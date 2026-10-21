from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Cliente,
    ClienteArticulo,
    EstadoArticulo,
    Movimiento,
    Producto,
    TipoMovimiento,
    Usuario,
    ahora_argentina,
    obtener_periodo_activo_cliente,
)
from app.schemas import (
    ClienteArticuloCreate,
    ClienteArticuloOut,
    LiquidarArticulosRequest,
    MovimientoOut,
    ProductoCreate,
    ProductoOut,
    ProductoUpdate,
)
from app.services.ledger import LedgerService, _lock_query

router = APIRouter(tags=["Productos y Artículos Dinámicos"])


def _map_articulo_out(art: ClienteArticulo) -> ClienteArticuloOut:
    precio_unit = art.producto.precio_actual if art.estado == EstadoArticulo.PENDIENTE else (art.precio_liquidado or art.producto.precio_actual)
    subtotal = art.cantidad * precio_unit
    return ClienteArticuloOut(
        id=art.id,
        cliente_id=art.cliente_id,
        producto_id=art.producto_id,
        producto_nombre=art.producto.nombre,
        producto_unidad=art.producto.unidad,
        precio_unitario_actual=precio_unit,
        cantidad=art.cantidad,
        subtotal_actual=subtotal,
        nota=art.nota,
        estado=art.estado.value,
        fecha_creacion=art.fecha_creacion,
        usuario_nombre=art.operador.nombre if art.operador else None,
        movimiento_id=art.movimiento_id,
        precio_liquidado=art.precio_liquidado,
        fecha_liquidacion=art.fecha_liquidacion
    )


# ==============================================================================
# Catálogo de Productos de Precio Dinámico (Garrafas, Carbón, etc.)
# ==============================================================================

@router.get("/productos", response_model=List[ProductoOut])
def listar_productos(
    incluir_inactivos: bool = Query(False, description="Incluir productos inactivos"),
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Lista todos los productos de precio dinámico/indexado."""
    query = db.query(Producto)
    if not incluir_inactivos:
        query = query.filter(Producto.activo.is_(True))
    productos = query.order_by(Producto.nombre.asc()).all()
    return [ProductoOut.model_validate(p) for p in productos]


@router.post("/productos", response_model=ProductoOut, status_code=status.HTTP_201_CREATED)
def crear_producto(
    payload: ProductoCreate,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Crea un nuevo producto con su cotización o precio actual."""
    nombre_limpio = payload.nombre.strip()
    existente = db.query(Producto).filter(Producto.nombre.ilike(nombre_limpio)).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un producto registrado con el nombre '{nombre_limpio}'."
        )

    producto = Producto(
        nombre=nombre_limpio,
        precio_actual=payload.precio_actual,
        unidad=payload.unidad.strip() if payload.unidad else "unidad",
        activo=True,
        fecha_creacion=ahora_argentina(),
        fecha_actualizacion=ahora_argentina()
    )
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return ProductoOut.model_validate(producto)


@router.put("/productos/{producto_id}", response_model=ProductoOut)
def actualizar_producto(
    producto_id: int,
    payload: ProductoUpdate,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Actualiza datos o el precio actual de un producto."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado."
        )

    if payload.nombre is not None and payload.nombre.strip():
        nombre_limpio = payload.nombre.strip()
        existente = db.query(Producto).filter(
            Producto.nombre.ilike(nombre_limpio),
            Producto.id != producto_id
        ).first()
        if existente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ya existe otro producto con el nombre '{nombre_limpio}'."
            )
        producto.nombre = nombre_limpio

    if payload.precio_actual is not None:
        producto.precio_actual = payload.precio_actual

    if payload.unidad is not None and payload.unidad.strip():
        producto.unidad = payload.unidad.strip()

    if payload.activo is not None:
        producto.activo = payload.activo

    producto.fecha_actualizacion = ahora_argentina()
    db.commit()
    db.refresh(producto)
    return ProductoOut.model_validate(producto)


@router.delete("/productos/{producto_id}")
def eliminar_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Desactiva o elimina un producto."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado."
        )

    articulos_count = db.query(ClienteArticulo).filter(ClienteArticulo.producto_id == producto_id).count()
    if articulos_count > 0:
        producto.activo = False
        db.commit()
        return {
            "ok": True,
            "mensaje": f"El producto '{producto.nombre}' tiene historial asociado. Ha sido desactivado.",
            "eliminado_fisicamente": False
        }
    else:
        nombre = producto.nombre
        db.delete(producto)
        db.commit()
        return {
            "ok": True,
            "mensaje": f"Producto '{nombre}' eliminado correctamente.",
            "eliminado_fisicamente": True
        }


# ==============================================================================
# Artículos Pendientes en Libreta de Clientes (Fiado en Especies)
# ==============================================================================

@router.get("/clientes/{cliente_id}/articulos", response_model=List[ClienteArticuloOut])
def listar_articulos_cliente(
    cliente_id: int,
    solo_pendientes: bool = Query(True, description="Filtrar solo artículos pendientes de cotización"),
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Obtiene los artículos (ej: garrafas) anotados en la libreta del cliente."""
    query = db.query(ClienteArticulo).filter(ClienteArticulo.cliente_id == cliente_id)
    if solo_pendientes:
        query = query.filter(ClienteArticulo.estado == EstadoArticulo.PENDIENTE)
    articulos = query.order_by(ClienteArticulo.fecha_creacion.desc()).all()
    return [_map_articulo_out(a) for a in articulos]


@router.post(
    "/clientes/{cliente_id}/articulos",
    response_model=ClienteArticuloOut,
    status_code=status.HTTP_201_CREATED
)
def registrar_articulo_cliente(
    cliente_id: int,
    payload: ClienteArticuloCreate,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """
    Anota la entrega de un producto dinámico (ej: 1 garrafa de gas) en la libreta del cliente.
    No asienta pesos fijos al momento de entrega; se cotiza al precio vigente al cerrar la cuenta.
    """
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado."
        )

    if not cliente.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pueden asentar artículos en un cliente inactivo."
        )

    producto = db.query(Producto).filter(Producto.id == payload.producto_id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado."
        )

    if not producto.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El producto '{producto.nombre}' se encuentra inactivo."
        )

    if payload.cantidad <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La cantidad debe ser mayor a 0."
        )

    ahora = ahora_argentina()
    articulo = ClienteArticulo(
        cliente_id=cliente.id,
        producto_id=producto.id,
        usuario_id=operador.id,
        cantidad=payload.cantidad,
        nota=payload.nota.strip() if payload.nota else None,
        estado=EstadoArticulo.PENDIENTE,
        fecha_creacion=ahora
    )
    cliente.ultima_actividad = ahora

    db.add(articulo)
    db.commit()
    db.refresh(articulo)
    return _map_articulo_out(articulo)


@router.delete("/articulos/{articulo_id}")
def cancelar_articulo(
    articulo_id: int,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """Cancela o anula un artículo pendiente (por devolución del producto o error de carga)."""
    articulo = db.query(ClienteArticulo).filter(ClienteArticulo.id == articulo_id).first()
    if not articulo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artículo no encontrado."
        )

    if articulo.estado != EstadoArticulo.PENDIENTE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden cancelar artículos en estado PENDIENTE."
        )

    articulo.estado = EstadoArticulo.DEVUELTO
    db.commit()
    return {"ok": True, "mensaje": "Artículo cancelado/devuelto correctamente."}


@router.post("/clientes/{cliente_id}/articulos/liquidar")
def liquidar_articulos_a_precio_actual(
    cliente_id: int,
    payload: LiquidarArticulosRequest,
    db: Session = Depends(get_db),
    operador: Usuario = Depends(get_current_user)
):
    """
    Cierra/liquida artículos pendientes al valor de cotización actual vigente de hoy,
    asentando de forma atómica los movimientos CARGO correspondientes en el libro mayor.
    """
    # Bloquear cliente para garantizar coherencia contable
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
            detail="No se pueden liquidar artículos en un cliente inactivo."
        )

    query = db.query(ClienteArticulo).filter(
        ClienteArticulo.cliente_id == cliente_id,
        ClienteArticulo.estado == EstadoArticulo.PENDIENTE
    )
    if payload.articulo_ids:
        query = query.filter(ClienteArticulo.id.in_(payload.articulo_ids))

    articulos_pendientes = query.all()
    if not articulos_pendientes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay artículos pendientes para liquidar."
        )

    ahora = ahora_argentina()
    total_liquidado = Decimal("0.00")
    movimientos_generados = []

    for art in articulos_pendientes:
        producto = art.producto
        precio_vigente = producto.precio_actual
        monto_item = art.cantidad * precio_vigente
        nuevo_saldo = cliente.saldo_actual + monto_item

        nota_extra = f" - {payload.nota_adicional.strip()}" if payload.nota_adicional else ""
        if art.nota:
            nota_extra += f" ({art.nota})"

        cant_str = f"{art.cantidad:g}"
        mov = Movimiento(
            cliente_id=cliente.id,
            usuario_id=operador.id,
            tipo=TipoMovimiento.CARGO,
            monto=monto_item,
            saldo_resultante=nuevo_saldo,
            nota=f"{producto.nombre} ({cant_str} {producto.unidad} liquidada al valor actual de ${precio_vigente:,.2f}){nota_extra}",
            periodo=obtener_periodo_activo_cliente(cliente),
            anulado=False,
            fecha_creacion=ahora
        )
        db.add(mov)
        db.flush()  # Obtiene mov.id

        cliente.saldo_actual = nuevo_saldo
        art.estado = EstadoArticulo.LIQUIDADO
        art.movimiento_id = mov.id
        art.precio_liquidado = precio_vigente
        art.fecha_liquidacion = ahora

        total_liquidado += monto_item
        movimientos_generados.append(mov)

    cliente.ultima_actividad = ahora
    db.commit()

    return {
        "ok": True,
        "mensaje": f"Se liquidaron {len(articulos_pendientes)} artículo(s) al valor de cotización actual por un total de ${total_liquidado:,.2f}.",
        "total_liquidado": total_liquidado,
        "nuevo_saldo_actual": cliente.saldo_actual,
        "articulos_liquidados": [_map_articulo_out(a) for a in articulos_pendientes]
    }
