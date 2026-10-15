from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import create_access_token, get_current_user, hash_pin, verify_pin
from app.models import Movimiento, Usuario
from app.schemas import LoginPinRequest, OperadorCreate, OperadorOut, OperadorUpdate, TokenResponse

router = APIRouter(prefix="/auth", tags=["Autenticación"])


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
    operador_actual: Usuario = Depends(get_current_user)
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
    operador_actual: Usuario = Depends(get_current_user)
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
    operador_actual: Usuario = Depends(get_current_user)
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
def login_con_pin(payload: LoginPinRequest, db: Session = Depends(get_db)):
    """Autentica a un operador mediante su PIN numérico y retorna un JWT."""
    usuario = db.query(Usuario).filter(Usuario.id == payload.usuario_id).first()
    if not usuario:
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="PIN incorrecto."
        )

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
