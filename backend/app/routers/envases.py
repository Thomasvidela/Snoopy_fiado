from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Cliente,
    ClienteArticulo,
    EstadoArticulo,
    EstadoEnvase,
    Movimiento,
    PrestamoEnvase,
    TipoMovimiento,
    Usuario,
    ahora_argentina,
)
from app.schemas import (
    CierreAutomaticoInfoOut,
    DevolverEnvaseRequest,
    MovimientoOut,
    PrestamoEnvaseCreate,
    PrestamoEnvaseOut,
    ResumenDiarioOut,
)
from app.services.cierre_mensual import CierreMensualService

router = APIRouter(tags=["Envases Retornables y Resumen Diario"])


def map_envase_out(env: PrestamoEnvase) -> PrestamoEnvaseOut:
    pendiente = max(0, (env.cantidad or 0) - (env.cantidad_devuelta or 0))
    if env.estado == EstadoEnvase.DEVUELTO:
        pendiente = 0
    return PrestamoEnvaseOut(
        id=env.id,
        cliente_id=env.cliente_id,
        cliente_nombre=env.cliente.nombre if env.cliente else None,
        usuario_id=env.usuario_id,
        operador_nombre=env.operador.nombre if env.operador else None,
        descripcion=env.descripcion,
        cantidad=env.cantidad,
        cantidad_devuelta=env.cantidad_devuelta,
        cantidad_pendiente=pendiente,
        nota=env.nota,
        estado=env.estado.value if hasattr(env.estado, "value") else str(env.estado),
        fecha_prestamo=env.fecha_prestamo,
        fecha_devolucion=env.fecha_devolucion,
        devuelto_por_nombre=env.devuelto_por.nombre if env.devuelto_por else None,
    )


@router.get("/clientes/{cliente_id}/envases", response_model=List[PrestamoEnvaseOut])
def listar_envases_cliente(
    cliente_id: int,
    solo_pendientes: bool = Query(False, description="Si es True, devuelve solo envases aún no devueltos"),
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user),
):
    """Lista los envases retornables prestados a un cliente."""
    query = db.query(PrestamoEnvase).filter(PrestamoEnvase.cliente_id == cliente_id)
    if solo_pendientes:
        query = query.filter(PrestamoEnvase.estado == EstadoEnvase.PRESTADO)
    items = query.order_by(PrestamoEnvase.fecha_prestamo.desc(), PrestamoEnvase.id.desc()).all()
    return [map_envase_out(e) for e in items]


@router.post(
    "/clientes/{cliente_id}/envases",
    response_model=PrestamoEnvaseOut,
    status_code=status.HTTP_201_CREATED,
)
def registrar_prestamo_envase(
    cliente_id: int,
    payload: PrestamoEnvaseCreate,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user),
):
    """
    Registra el préstamo de uno o más envases retornables al cliente
    (ej: Envase de Garrafa 10kg, Envase de Cerveza 1L, Envase de Gaseosa Retornable).
    """
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado.",
        )

    if not cliente.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pueden prestar envases a un cliente inactivo.",
        )

    descripcion_limpia = payload.descripcion.strip()
    if not descripcion_limpia:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La descripción del envase es obligatoria.",
        )

    ahora = ahora_argentina()
    prestamo = PrestamoEnvase(
        cliente_id=cliente.id,
        usuario_id=operador.id,
        descripcion=descripcion_limpia,
        cantidad=payload.cantidad,
        cantidad_devuelta=0,
        nota=payload.nota.strip() if payload.nota and payload.nota.strip() else None,
        estado=EstadoEnvase.PRESTADO,
        fecha_prestamo=ahora,
    )
    cliente.ultima_actividad = ahora

    db.add(prestamo)
    db.commit()
    db.refresh(prestamo)
    return map_envase_out(prestamo)


@router.post("/envases/{envase_id}/devolver", response_model=PrestamoEnvaseOut)
def devolver_envase_prestado(
    envase_id: int,
    payload: Optional[DevolverEnvaseRequest] = None,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user),
):
    """
    Marca como devuelto (total o parcialmente) un préstamo de envase retornable.
    Si el cliente debía 2 envases y devuelve 1, queda 1 pendiente. Si devuelve todos, pasa a DEVUELTO.
    """
    prestamo = db.query(PrestamoEnvase).filter(PrestamoEnvase.id == envase_id).first()
    if not prestamo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Préstamo de envase no encontrado.",
        )

    if prestamo.estado == EstadoEnvase.DEVUELTO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este envase ya fue devuelto en su totalidad.",
        )

    pendiente_actual = max(0, prestamo.cantidad - prestamo.cantidad_devuelta)
    a_devolver = (
        min(pendiente_actual, payload.cantidad_devuelta)
        if (payload and payload.cantidad_devuelta)
        else pendiente_actual
    )

    ahora = ahora_argentina()
    prestamo.cantidad_devuelta += a_devolver

    if prestamo.cantidad_devuelta >= prestamo.cantidad:
        prestamo.cantidad_devuelta = prestamo.cantidad
        prestamo.estado = EstadoEnvase.DEVUELTO
        prestamo.fecha_devolucion = ahora
        prestamo.devuelto_por_id = operador.id

    if prestamo.cliente:
        prestamo.cliente.ultima_actividad = ahora

    db.commit()
    db.refresh(prestamo)
    return map_envase_out(prestamo)


@router.delete("/envases/{envase_id}")
def eliminar_prestamo_envase(
    envase_id: int,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user),
):
    """Elimina un registro de envase prestado que haya sido anotado por error."""
    prestamo = db.query(PrestamoEnvase).filter(PrestamoEnvase.id == envase_id).first()
    if not prestamo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registro de envase no encontrado.",
        )

    db.delete(prestamo)
    db.commit()
    return {"ok": True, "mensaje": "Registro de envase eliminado correctamente."}


def calcular_metricas_resumen_diario(db: Session) -> ResumenDiarioOut:
    """Calcula todas las métricas del Resumen Diario en hora oficial de Argentina."""
    cierre_info = CierreMensualService.verificar_y_cerrar_periodos_vencidos(db)
    ahora = ahora_argentina()
    inicio_hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    periodo_actual = ahora.strftime("%Y-%m")

    movs_hoy = (
        db.query(Movimiento)
        .filter(
            Movimiento.fecha_creacion >= inicio_hoy,
            Movimiento.anulado.is_(False),
        )
        .order_by(Movimiento.fecha_creacion.desc(), Movimiento.id.desc())
        .all()
    )

    fiado_hoy = Decimal("0.00")
    cantidad_cargos_hoy = 0
    cobrado_hoy = Decimal("0.00")
    cantidad_pagos_hoy = 0

    for m in movs_hoy:
        if m.tipo == TipoMovimiento.CARGO:
            fiado_hoy += m.monto
            cantidad_cargos_hoy += 1
        elif m.tipo == TipoMovimiento.PAGO:
            cobrado_hoy += m.monto
            cantidad_pagos_hoy += 1

    # Clientes activos y su deuda + artículos pendientes
    clientes_activos = (
        db.query(Cliente)
        .options(selectinload(Cliente.articulos).selectinload(ClienteArticulo.producto))
        .filter(Cliente.activo.is_(True))
        .all()
    )

    total_en_calle = Decimal("0.00")
    clientes_con_deuda = 0
    total_articulos_valor = Decimal("0.00")
    articulos_unidades = 0

    for c in clientes_activos:
        art_cliente_val = Decimal("0.00")
        for art in c.articulos:
            if art.estado == EstadoArticulo.PENDIENTE and art.producto:
                sub = art.cantidad * art.producto.precio_actual
                art_cliente_val += sub
                total_articulos_valor += sub
                articulos_unidades += int(art.cantidad)

        saldo_consolidado = c.saldo_actual + art_cliente_val
        if saldo_consolidado > Decimal("0.00"):
            total_en_calle += saldo_consolidado
            clientes_con_deuda += 1

    # Envases prestados pendientes en la calle
    envases_activos = (
        db.query(PrestamoEnvase)
        .join(Cliente, Cliente.id == PrestamoEnvase.cliente_id)
        .filter(
            Cliente.activo.is_(True),
            PrestamoEnvase.estado == EstadoEnvase.PRESTADO,
        )
        .order_by(PrestamoEnvase.fecha_prestamo.desc())
        .all()
    )

    envases_pendientes_unidades = 0
    clientes_envases_ids = set()
    for e in envases_activos:
        pend = max(0, e.cantidad - e.cantidad_devuelta)
        if pend > 0:
            envases_pendientes_unidades += pend
            clientes_envases_ids.add(e.cliente_id)

    ultimos_movs_out = [
        MovimientoOut(
            id=m.id,
            cliente_id=m.cliente_id,
            usuario_id=m.usuario_id,
            operador_nombre=m.operador.nombre if m.operador else None,
            tipo=m.tipo,
            monto=m.monto,
            saldo_resultante=m.saldo_resultante,
            nota=f"[{m.cliente.nombre}] {m.nota}" if (m.cliente and m.nota) else (f"[{m.cliente.nombre}]" if m.cliente else m.nota),
            periodo=m.periodo or m.fecha_creacion.strftime("%Y-%m"),
            anulado=m.anulado,
            anulado_por_id=m.anulado_por_id,
            anulado_por_nombre=m.anulado_por.nombre if m.anulado_por else None,
            fecha_anulacion=m.fecha_anulacion,
            anula_movimiento_id=m.anula_movimiento_id,
            fecha_creacion=m.fecha_creacion,
        )
        for m in movs_hoy[:20]
    ]

    return ResumenDiarioOut(
        fecha=ahora.strftime("%d/%m/%Y"),
        periodo_actual=periodo_actual,
        fiado_hoy=fiado_hoy,
        cantidad_cargos_hoy=cantidad_cargos_hoy,
        cobrado_hoy=cobrado_hoy,
        cantidad_pagos_hoy=cantidad_pagos_hoy,
        total_en_calle=total_en_calle,
        clientes_con_deuda=clientes_con_deuda,
        total_articulos_pendientes_valor=total_articulos_valor,
        articulos_pendientes_unidades=articulos_unidades,
        envases_prestados_pendientes=envases_pendientes_unidades,
        clientes_con_envases=len(clientes_envases_ids),
        ultimos_movimientos_hoy=ultimos_movs_out,
        envases_en_calle_detalle=[map_envase_out(e) for e in envases_activos],
        cierre_automatico=CierreAutomaticoInfoOut(**cierre_info),
    )


@router.get("/reportes/resumen-diario", response_model=ResumenDiarioOut)
def obtener_resumen_diario(
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user),
):
    """Devuelve el resumen diario de movimientos, deuda en la calle, envases prestados y estado de cierre automático."""
    return calcular_metricas_resumen_diario(db)
