# Etapa 1: Compilación de Frontend React + Vite
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Etapa 2: Runtime Backend FastAPI + Archivos estáticos
FROM python:3.12-slim AS runtime
WORKDIR /app

# Dependencias del sistema mínimas para psycopg, zona horaria y salud
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Dependencias Python
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Código de la aplicación Backend
COPY backend/ ./backend/

# Artefactos compilados del Frontend (Servidos como SPA modular por FastAPI)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

ENV PYTHONPATH=/app/backend \
    STATIC_DIR=/app/frontend/dist \
    PYTHONUNBUFFERED=1 \
    TZ=America/Argentina/Buenos_Aires

EXPOSE 8000

# Healthcheck interno del contenedor
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
