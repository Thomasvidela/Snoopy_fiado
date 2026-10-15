from typing import List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Movimiento, Usuario
from app.schemas import MovimientoCreate, MovimientoOut
from app.services.ledger import LedgerService

router = APIRouter(tags=["Movimientos"])


def _map_movimiento_out(m: Movimiento) -> MovimientoOut:
    return MovimientoOut(
        id=m.id,
        cliente_id=m.cliente_id,
        usuario_id=m.usuario_id,
        operador_nombre=m.operador.nombre if m.operador else None,
        tipo=m.tipo,
        monto=m.monto,
        saldo_resultante=m.saldo_resultante,
        nota=m.nota,
        anulado=m.anulado,
        anulado_por_id=m.anulado_por_id,
        anulado_por_nombre=m.anulado_por.nombre if m.anulado_por else None,
        fecha_anulacion=m.fecha_anulacion,
        anula_movimiento_id=m.anula_movimiento_id,
        fecha_creacion=m.fecha_creacion
    )


@router.get("/clientes/{cliente_id}/movimientos", response_model=List[MovimientoOut])
def listar_movimientos_cliente(
    cliente_id: int,
    limite: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Obtiene el historial de movimientos de un cliente ordenados del más reciente al más antiguo."""
    movimientos = (
        db.query(Movimiento)
        .filter(Movimiento.cliente_id == cliente_id)
        .order_by(Movimiento.fecha_creacion.desc(), Movimiento.id.desc())
        .offset(offset)
        .limit(limite)
        .all()
    )
    return [_map_movimiento_out(m) for m in movimientos]


@router.post(
    "/clientes/{cliente_id}/movimientos",
    response_model=MovimientoOut,
    status_code=status.HTTP_201_CREATED
)
def registrar_movimiento(
    cliente_id: int,
    payload: MovimientoCreate,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """
    Registra un nuevo cargo o pago aplicando bloqueo pesimista y actualización atómica del saldo.
    Cumple con la 'Regla de los 3 toques' para mostrador.
    """
    mov = LedgerService.registrar_movimiento(
        db=db,
        cliente_id=cliente_id,
        datos=payload,
        operador=operador
    )
    return _map_movimiento_out(mov)


@router.post("/movimientos/{movimiento_id}/anular", response_model=MovimientoOut)
def anular_movimiento(
    movimiento_id: int,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """
    Anula un movimiento anterior creando atómicamente un contra-asiento
    (ANULACION_CARGO o ANULACION_PAGO) y marcando el original como anulado.
    """
    contra_asiento = LedgerService.anular_movimiento(
        db=db,
        movimiento_id=movimiento_id,
        operador=operador
    )
    return _map_movimiento_out(contra_asiento)
