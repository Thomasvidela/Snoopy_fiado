import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.routers import auth, clientes, movimientos
from app.seed import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicialización de base de datos y datos semilla
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


is_dev = settings.ENVIRONMENT.lower() in ("development", "dev", "local")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if is_dev else None,
    redoc_url="/redoc" if is_dev else None,
    openapi_url="/openapi.json" if is_dev else None,
)

# Middleware de Cabeceras de Seguridad HTTP (Hardening)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montar Routers de la API
app.include_router(auth.router, prefix="/api")
app.include_router(clientes.router, prefix="/api")
app.include_router(movimientos.router, prefix="/api")


@app.get("/api/health", tags=["Salud"])
def health_check():
    return {
        "status": "ok",
        "proyecto": settings.PROJECT_NAME,
        "database": engine.dialect.name
    }


# Configuración del frontend React compilado (monolito modular)
def resolver_dist_path() -> Path:
    if settings.STATIC_DIR:
        return Path(settings.STATIC_DIR)
    # Rutas relativas comunes (local o docker)
    posibles_rutas = [
        Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
        Path(__file__).resolve().parent.parent / "frontend" / "dist",
        Path("/app/frontend/dist"),
        Path("./frontend/dist")
    ]
    for p in posibles_rutas:
        if p.exists() and (p / "index.html").exists():
            return p
    return posibles_rutas[0]


dist_dir = resolver_dist_path()

if dist_dir.exists() and (dist_dir / "index.html").exists():
    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # No interceptar endpoints de la API o docs
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})

        # Bloquear acceso a archivos ocultos (.env, .git) o secuencias de salto de directorio
        if full_path.startswith(".") or ".." in full_path:
            return JSONResponse(status_code=403, content={"detail": "Acceso denegado"})

        dist_resolved = dist_dir.resolve()
        try:
            file_path = (dist_dir / full_path).resolve()
            # Bloquear cualquier intento de Path Traversal fuera de dist
            if not file_path.is_relative_to(dist_resolved):
                return JSONResponse(status_code=403, content={"detail": "Acceso denegado"})
        except (ValueError, RuntimeError):
            return JSONResponse(status_code=403, content={"detail": "Acceso denegado"})

        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(dist_resolved / "index.html"))
else:
    @app.get("/", include_in_schema=False)
    async def index_placeholder():
        return {
            "mensaje": f"API {settings.PROJECT_NAME} activa.",
            "documentacion": "/docs",
            "frontend": "Compilación del frontend no encontrada aún en frontend/dist"
        }
