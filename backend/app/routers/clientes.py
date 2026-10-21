from datetime import datetime
from typing import Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Cliente,
    ClienteArticulo,
    EstadoArticulo,
    Movimiento,
    TipoMovimiento,
    Usuario,
    ahora_argentina,
    calcular_siguiente_periodo,
    obtener_periodo_activo_cliente,
)
from app.schemas import (
    CerrarMesRequest,
    CerrarMesResponse,
    ClienteCreate,
    ClienteOut,
    ClienteUpdate,
    ListadoClientesResponse,
    ResumenMensualOut,
)
from app.services.excel import generar_excel_cliente
from app.services.ledger import LedgerService, _lock_query, normalizar_telefono_argentina
from app.services.resumen import MESES_ES, ResumenService, parse_periodo

router = APIRouter(prefix="/clientes", tags=["Clientes"])


def _map_cliente_out(cliente: Cliente) -> ClienteOut:
    total_articulos = Decimal("0.00")
    count_articulos = 0
    if hasattr(cliente, "articulos") and cliente.articulos:
        for art in cliente.articulos:
            if art.estado == EstadoArticulo.PENDIENTE:
                count_articulos += 1
                total_articulos += art.cantidad * art.producto.precio_actual

    saldo_total = cliente.saldo_actual + total_articulos

    return ClienteOut(
        id=cliente.id,
        nombre=cliente.nombre,
        apodo=cliente.apodo,
        telefono=cliente.telefono,
        saldo_actual=cliente.saldo_actual,
        ultima_actividad=cliente.ultima_actividad,
        activo=cliente.activo,
        fecha_alta=cliente.fecha_alta,
        periodo_actual=obtener_periodo_activo_cliente(cliente),
        total_articulos_pendientes=total_articulos,
        articulos_pendientes_count=count_articulos,
        saldo_total=saldo_total
    )


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
        .options(selectinload(Cliente.articulos).selectinload(ClienteArticulo.producto))
        .order_by(Cliente.ultima_actividad.desc(), Cliente.id.desc())
        .offset(offset)
        .limit(limite)
        .all()
    )

    return ListadoClientesResponse(
        items=[_map_cliente_out(c) for c in items],
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
    return _map_cliente_out(cliente)


@router.get("/{cliente_id}", response_model=ClienteOut)
def obtener_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Obtiene los detalles y saldo actual de un cliente."""
    cliente = (
        db.query(Cliente)
        .options(selectinload(Cliente.articulos).selectinload(ClienteArticulo.producto))
        .filter(Cliente.id == cliente_id)
        .first()
    )
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado."
        )
    return _map_cliente_out(cliente)


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
    return _map_cliente_out(cliente)


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
    return _map_cliente_out(cliente)


@router.post("/{cliente_id}/cerrar-mes", response_model=CerrarMesResponse)
def cerrar_mes_cliente(
    cliente_id: int,
    payload: Optional[CerrarMesRequest] = None,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """
    Cierra/liquida el período mensual activo del cliente sin exigir cobro inmediato:
    1. Si tiene productos dinámicos pendientes (ej: garrafas), los liquida al valor de hoy dentro del mes que cierra.
    2. Avanza el período activo del cliente al mes siguiente para que los próximos fiados se anoten en la nueva pestaña.
    """
    cliente_query = db.query(Cliente).filter(Cliente.id == cliente_id)
    cliente = _lock_query(cliente_query, db).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado."
        )

    if not cliente.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede cerrar el mes de un cliente inactivo."
        )

    periodo_a_cerrar = obtener_periodo_activo_cliente(cliente)
    _, _, anio_cierre, mes_cierre = parse_periodo(periodo_a_cerrar)
    nombre_mes_cierre = f"{MESES_ES.get(mes_cierre, str(mes_cierre))} {anio_cierre}"

    articulos_pendientes = (
        db.query(ClienteArticulo)
        .filter(
            ClienteArticulo.cliente_id == cliente_id,
            ClienteArticulo.estado == EstadoArticulo.PENDIENTE
        )
        .order_by(ClienteArticulo.fecha_creacion.asc())
        .all()
    )

    ahora = ahora_argentina()
    total_liquidado = Decimal("0.00")

    for art in articulos_pendientes:
        producto = art.producto
        precio_vigente = producto.precio_actual
        monto_item = art.cantidad * precio_vigente
        nuevo_saldo = cliente.saldo_actual + monto_item

        nota_extra = f" ({art.nota})" if art.nota else ""
        cant_str = f"{art.cantidad:g}"
        mov = Movimiento(
            cliente_id=cliente.id,
            usuario_id=operador.id,
            tipo=TipoMovimiento.CARGO,
            monto=monto_item,
            saldo_resultante=nuevo_saldo,
            nota=f"{producto.nombre} ({cant_str} {producto.unidad} liquidada al cierre de {nombre_mes_cierre} a ${precio_vigente:,.2f}){nota_extra}",
            periodo=periodo_a_cerrar,
            anulado=False,
            fecha_creacion=ahora
        )
        db.add(mov)
        db.flush()

        cliente.saldo_actual = nuevo_saldo
        art.estado = EstadoArticulo.LIQUIDADO
        art.movimiento_id = mov.id
        art.precio_liquidado = precio_vigente
        art.fecha_liquidacion = ahora
        total_liquidado += monto_item

    nuevo_periodo = calcular_siguiente_periodo(periodo_a_cerrar)
    cliente.periodo_actual = nuevo_periodo
    cliente.ultima_actividad = ahora

    db.commit()
    db.refresh(cliente)

    _, _, anio_nuevo, mes_nuevo = parse_periodo(nuevo_periodo)
    nombre_mes_nuevo = f"{MESES_ES.get(mes_nuevo, str(mes_nuevo))} {anio_nuevo}"

    return CerrarMesResponse(
        ok=True,
        mensaje=f"Período {nombre_mes_cierre} cerrado. Los nuevos movimientos se anotarán en {nombre_mes_nuevo}.",
        periodo_cerrado=periodo_a_cerrar,
        nuevo_periodo_activo=nuevo_periodo,
        articulos_liquidados_count=len(articulos_pendientes),
        total_articulos_liquidados=total_liquidado,
        saldo_cierre=cliente.saldo_actual,
        cliente=_map_cliente_out(cliente)
    )


@router.get("/{cliente_id}/resumen", response_model=ResumenMensualOut)
def obtener_resumen_mensual(
    cliente_id: int,
    mes: Optional[str] = Query(None, description="Período en formato YYYY-MM (por defecto el período activo del cliente)"),
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """
    Obtiene el estado de cuenta mensual con saldo anterior, movimientos, totales y
    el texto formateado listo para enviar por WhatsApp.
    """
    if not mes:
        cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
        mes = obtener_periodo_activo_cliente(cliente) if cliente else ahora_argentina().strftime("%Y-%m")

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
        parse_periodo(mes)  # Validar formato YYYY-MM
        # Saldo anterior al período
        ultimo_anterior = (
            db.query(Movimiento)
            .filter(
                Movimiento.cliente_id == cliente_id,
                Movimiento.periodo < mes
            )
            .order_by(Movimiento.periodo.desc(), Movimiento.fecha_creacion.desc(), Movimiento.id.desc())
            .first()
        )
        saldo_anterior = ultimo_anterior.saldo_resultante if ultimo_anterior else Decimal("0.00")

        # Movimientos del período
        movimientos = (
            db.query(Movimiento)
            .filter(
                Movimiento.cliente_id == cliente_id,
                Movimiento.periodo == mes
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
