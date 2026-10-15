from datetime import datetime
from typing import Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Cliente, Movimiento, Usuario, ahora_argentina
from app.schemas import ClienteCreate, ClienteOut, ClienteUpdate, ListadoClientesResponse, ResumenMensualOut
from app.services.excel import generar_excel_cliente
from app.services.ledger import LedgerService, normalizar_telefono_argentina
from app.services.resumen import ResumenService, parse_periodo

router = APIRouter(prefix="/clientes", tags=["Clientes"])


@router.get("", response_model=ListadoClientesResponse)
def listar_clientes(
    q: Optional[str] = Query(None, description="Búsqueda por nombre o apodo"),
    solo_activos: Optional[bool] = Query(None, description="Filtrar por estado activo (True=activos, False=inactivos, None=todos)"),
    limite: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """
    Lista clientes ordenados por última actividad descendente.
    Soporta búsqueda instantánea por nombre o apodo.
    """
    query = db.query(Cliente)

    if solo_activos is not None:
        query = query.filter(Cliente.activo.is_(solo_activos))

    if q and q.strip():
        termino = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Cliente.nombre.ilike(termino),
                Cliente.apodo.ilike(termino)
            )
        )

    total = query.count()
    items = (
        query
        .order_by(Cliente.ultima_actividad.desc(), Cliente.id.desc())
        .offset(offset)
        .limit(limite)
        .all()
    )

    return ListadoClientesResponse(
        items=[ClienteOut.model_validate(c) for c in items],
        total=total
    )


@router.post("", response_model=ClienteOut, status_code=status.HTTP_201_CREATED)
def crear_cliente(
    payload: ClienteCreate,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Crea un nuevo cliente y registra el saldo inicial si corresponde."""
    cliente = LedgerService.crear_cliente(db=db, datos=payload, operador=operador)
    return ClienteOut.model_validate(cliente)


@router.get("/{cliente_id}", response_model=ClienteOut)
def obtener_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Obtiene los detalles y saldo actual de un cliente."""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado."
        )
    return ClienteOut.model_validate(cliente)


@router.put("/{cliente_id}", response_model=ClienteOut)
def actualizar_cliente(
    cliente_id: int,
    payload: ClienteUpdate,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Actualiza datos del cliente (nombre, apodo, teléfono, estado activo)."""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado."
        )

    if payload.nombre is not None:
        cliente.nombre = payload.nombre.strip()
    if payload.apodo is not None:
        cliente.apodo = payload.apodo.strip() if payload.apodo else None
    if payload.telefono is not None:
        cliente.telefono = normalizar_telefono_argentina(payload.telefono) if payload.telefono and payload.telefono.strip() else None
    if payload.activo is not None:
        cliente.activo = payload.activo

    db.commit()
    db.refresh(cliente)
    return ClienteOut.model_validate(cliente)


@router.patch("/{cliente_id}/toggle-activo", response_model=ClienteOut)
def toggle_cliente_activo(
    cliente_id: int,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Habilita o deshabilita a un cliente alternando su estado activo."""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado."
        )
    cliente.activo = not cliente.activo
    db.commit()
    db.refresh(cliente)
    return ClienteOut.model_validate(cliente)


@router.get("/{cliente_id}/resumen", response_model=ResumenMensualOut)
def obtener_resumen_mensual(
    cliente_id: int,
    mes: Optional[str] = Query(None, description="Período en formato YYYY-MM (por defecto el mes actual)"),
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """
    Obtiene el estado de cuenta mensual con saldo anterior, movimientos, totales y
    el texto formateado listo para enviar por WhatsApp.
    """
    if not mes:
        mes = ahora_argentina().strftime("%Y-%m")

    resumen = ResumenService.generar_resumen(db=db, cliente_id=cliente_id, periodo=mes)
    return resumen


@router.get("/{cliente_id}/exportar-excel")
def exportar_movimientos_excel(
    cliente_id: int,
    mes: Optional[str] = Query(None, description="Período YYYY-MM opcional (por ejemplo '2026-10')"),
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """
    Genera y descarga un documento Excel (.xlsx) profesional con el historial de movimientos
    del cliente, saldos resultantes y desglose contable.
    """
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado."
        )

    saldo_anterior = None
    if mes:
        inicio_mes, fin_mes, _, _ = parse_periodo(mes)
        # Saldo anterior al mes
        ultimo_anterior = (
            db.query(Movimiento)
            .filter(
                Movimiento.cliente_id == cliente_id,
                Movimiento.fecha_creacion < inicio_mes
            )
            .order_by(Movimiento.fecha_creacion.desc(), Movimiento.id.desc())
            .first()
        )
        saldo_anterior = ultimo_anterior.saldo_resultante if ultimo_anterior else Decimal("0.00")

        # Movimientos del período
        movimientos = (
            db.query(Movimiento)
            .filter(
                Movimiento.cliente_id == cliente_id,
                Movimiento.fecha_creacion >= inicio_mes,
                Movimiento.fecha_creacion <= fin_mes
            )
            .order_by(Movimiento.fecha_creacion.asc(), Movimiento.id.asc())
            .all()
        )
        sufijo_archivo = mes
    else:
        # Historial completo cronológico
        movimientos = (
            db.query(Movimiento)
            .filter(Movimiento.cliente_id == cliente_id)
            .order_by(Movimiento.fecha_creacion.asc(), Movimiento.id.asc())
            .all()
        )
        sufijo_archivo = "Completo"

    excel_stream = generar_excel_cliente(
        cliente=cliente,
        movimientos=movimientos,
        periodo=mes,
        saldo_anterior=saldo_anterior
    )

    nombre_limpio = "".join(c for c in cliente.nombre if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
    nombre_archivo = f"Libreta_{nombre_limpio}_{sufijo_archivo}.xlsx"

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre_archivo}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )
