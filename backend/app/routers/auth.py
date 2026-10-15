from datetime import datetime, timedelta
import threading
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import (
    create_access_token,
    get_current_admin_user,
    get_current_user,
    hash_pin,
    verify_pin,
)
from app.models import Movimiento, Usuario
from app.schemas import LoginPinRequest, OperadorCreate, OperadorOut, OperadorUpdate, TokenResponse

router = APIRouter(prefix="/auth", tags=["Autenticación"])


class LoginRateLimiter:
    """Control de fuerza bruta en memoria por operador e IP con bloqueo temporal."""
    def __init__(self, max_attempts: int = 5, lockout_minutes: int = 15):
        self.max_attempts = max_attempts
        self.lockout_delta = timedelta(minutes=lockout_minutes)
        self.attempts: dict[str, list[datetime]] = {}
        self.lockouts: dict[str, datetime] = {}
        self._lock = threading.Lock()

    def _cleanup(self, now: datetime):
        for k in [k for k, until in self.lockouts.items() if until <= now]:
            del self.lockouts[k]
        for k in list(self.attempts.keys()):
            valid = [t for t in self.attempts[k] if now - t <= self.lockout_delta]
            if valid:
                self.attempts[k] = valid
            else:
                del self.attempts[k]

    def get_lockout_remaining(self, identifier: str) -> Optional[int]:
        now = datetime.now()
        with self._lock:
            self._cleanup(now)
            if identifier in self.lockouts:
                until = self.lockouts[identifier]
                if now < until:
                    diff_seconds = int((until - now).total_seconds())
                    return max(1, (diff_seconds + 59) // 60)
                del self.lockouts[identifier]
            return None

    def get_remaining_attempts(self, identifier: str) -> int:
        now = datetime.now()
        with self._lock:
            self._cleanup(now)
            used = len(self.attempts.get(identifier, []))
            return max(0, self.max_attempts - used)

    def record_failure(self, identifier: str):
        now = datetime.now()
        with self._lock:
            self._cleanup(now)
            if identifier not in self.attempts:
                self.attempts[identifier] = []
            self.attempts[identifier].append(now)
            if len(self.attempts[identifier]) >= self.max_attempts:
                self.lockouts[identifier] = now + self.lockout_delta
                del self.attempts[identifier]

    def record_success(self, identifier: str):
        with self._lock:
            self.attempts.pop(identifier, None)
            self.lockouts.pop(identifier, None)


login_limiter = LoginRateLimiter(
    max_attempts=settings.MAX_LOGIN_ATTEMPTS,
    lockout_minutes=settings.LOCKOUT_MINUTES
)


def get_client_ip(request: Request) -> str:
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


@router.get("/operadores", response_model=List[OperadorOut])
def listar_operadores(
    incluir_inactivos: bool = Query(False, description="Incluir operadores inactivos"),
    db: Session = Depends(get_db)
):
    """Lista los operadores. Por defecto retorna solo los activos para el selector de login."""
    query = db.query(Usuario)
    if not incluir_inactivos:
        query = query.filter(Usuario.activo.is_(True))
    operadores = query.order_by(Usuario.id.asc()).all()
    return [OperadorOut.model_validate(op) for op in operadores]


@router.post("/operadores", response_model=OperadorOut, status_code=status.HTTP_201_CREATED)
def crear_operador(
    payload: OperadorCreate,
    db: Session = Depends(get_db),
    operador_actual: Usuario = Depends(get_current_admin_user)
):
    """Crea un nuevo operador con su PIN de 4 dígitos."""
    nombre_limpio = payload.nombre.strip()
    existente = db.query(Usuario).filter(func.lower(Usuario.nombre) == nombre_limpio.lower()).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un operador con el nombre '{nombre_limpio}'."
        )

    nuevo_operador = Usuario(
        nombre=nombre_limpio,
        pin_hash=hash_pin(payload.pin),
        activo=True,
        es_admin=payload.es_admin
    )
    db.add(nuevo_operador)
    db.commit()
    db.refresh(nuevo_operador)
    return OperadorOut.model_validate(nuevo_operador)


@router.put("/operadores/{operador_id}", response_model=OperadorOut)
def actualizar_operador(
    operador_id: int,
    payload: OperadorUpdate,
    db: Session = Depends(get_db),
    operador_actual: Usuario = Depends(get_current_admin_user)
):
    """Modifica datos de un operador (nombre, PIN, estado activo, admin)."""
    usuario = db.query(Usuario).filter(Usuario.id == operador_id).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Operador no encontrado."
        )

    if payload.nombre is not None and payload.nombre.strip():
        nombre_limpio = payload.nombre.strip()
        existente = db.query(Usuario).filter(
            func.lower(Usuario.nombre) == nombre_limpio.lower(),
            Usuario.id != operador_id
        ).first()
        if existente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ya existe otro operador con el nombre '{nombre_limpio}'."
            )
        usuario.nombre = nombre_limpio

    if payload.pin is not None and payload.pin.strip():
        usuario.pin_hash = hash_pin(payload.pin.strip())

    if payload.activo is not None:
        if not payload.activo and operador_actual.id == operador_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No puedes desactivar tu propio usuario en sesión activa."
            )
        usuario.activo = payload.activo

    if payload.es_admin is not None:
        usuario.es_admin = payload.es_admin

    db.commit()
    db.refresh(usuario)
    return OperadorOut.model_validate(usuario)


@router.delete("/operadores/{operador_id}")
def eliminar_operador(
    operador_id: int,
    db: Session = Depends(get_db),
    operador_actual: Usuario = Depends(get_current_admin_user)
):
    """
    Elimina un operador. Si tiene movimientos registrados en el libro mayor,
    se desactiva automáticamente para preservar la integridad contable.
    """
    if operador_actual.id == operador_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes eliminar tu propio usuario en sesión activa."
        )

    usuario = db.query(Usuario).filter(Usuario.id == operador_id).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Operador no encontrado."
        )

    # Verificar si es el único admin
    if usuario.es_admin:
        otros_admins = db.query(Usuario).filter(
            Usuario.es_admin.is_(True),
            Usuario.activo.is_(True),
            Usuario.id != operador_id
        ).count()
        if otros_admins == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede eliminar el único administrador del sistema."
            )

    movimientos_asociados = db.query(Movimiento).filter(Movimiento.usuario_id == operador_id).count()
    if movimientos_asociados > 0:
        # Desactivación lógica para preservar libro mayor inmutable
        usuario.activo = False
        db.commit()
        return {
            "ok": True,
            "mensaje": f"El operador '{usuario.nombre}' tiene {movimientos_asociados} movimientos registrados. Ha sido deshabilitado para preservar el libro contable.",
            "eliminado_fisicamente": False
        }
    else:
        # Eliminación física
        nombre = usuario.nombre
        db.delete(usuario)
        db.commit()
        return {
            "ok": True,
            "mensaje": f"Operador '{nombre}' eliminado correctamente.",
            "eliminado_fisicamente": True
        }


@router.post("/login", response_model=TokenResponse)
def login_con_pin(payload: LoginPinRequest, request: Request, db: Session = Depends(get_db)):
    """Autentica a un operador mediante su PIN numérico con protección anti fuerza bruta y bloqueo temporal."""
    client_ip = get_client_ip(request)
    user_key = f"user_{payload.usuario_id}"
    ip_key = f"ip_{client_ip}"

    # 1. Comprobar si el usuario o la IP están bloqueados por intentos fallidos
    rem_user = login_limiter.get_lockout_remaining(user_key)
    rem_ip = login_limiter.get_lockout_remaining(ip_key)
    remaining_min = rem_user or rem_ip
    if remaining_min is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Acceso temporalmente bloqueado por seguridad tras varios intentos fallidos. Intente nuevamente en {remaining_min} minuto(s)."
        )

    usuario = db.query(Usuario).filter(Usuario.id == payload.usuario_id).first()
    if not usuario:
        login_limiter.record_failure(ip_key)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Operador no encontrado."
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El operador se encuentra inactivo."
        )

    if not verify_pin(payload.pin, usuario.pin_hash):
        login_limiter.record_failure(user_key)
        login_limiter.record_failure(ip_key)
        intentos_restantes = min(
            login_limiter.get_remaining_attempts(user_key),
            login_limiter.get_remaining_attempts(ip_key)
        )
        if intentos_restantes > 0:
            msg = f"PIN incorrecto. Le quedan {intentos_restantes} intento(s) antes del bloqueo temporal."
        else:
            msg = f"PIN incorrecto. Límite de intentos superado. Acceso bloqueado por {settings.LOCKOUT_MINUTES} minutos."
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=msg
        )

    # Inicio de sesión exitoso: resetear contadores de fallos
    login_limiter.record_success(user_key)
    login_limiter.record_success(ip_key)

    access_token = create_access_token(data={"sub": str(usuario.id), "nombre": usuario.nombre})

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        operador=OperadorOut.model_validate(usuario)
    )


@router.get("/me", response_model=OperadorOut)
def obtener_perfil_actual(operador: Usuario = Depends(get_current_user)):
    """Retorna los datos del operador actualmente autenticado."""
    return OperadorOut.model_validate(operador)
