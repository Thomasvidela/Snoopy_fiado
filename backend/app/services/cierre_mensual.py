import logging
import threading
from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    Cliente,
    ClienteArticulo,
    EstadoArticulo,
    Movimiento,
    TipoMovimiento,
    Usuario,
    ahora_argentina,
)
from app.services.ledger import _lock_query
from app.services.resumen import MESES_ES, parse_periodo

logger = logging.getLogger(__name__)


class CierreMensualService:
    """
    Servicio de cierre mensual automático.
    Cuando cambia el mes calendario en Argentina (UTC-3):
    1. Liquida automáticamente todos los productos dinámicos pendientes (ej. garrafas)
       cuyo período sea anterior al mes calendario actual, asentando el CARGO en esa ficha.
    2. Avanza el `periodo_actual` de todos los clientes activos al nuevo mes en curso
       para que las nuevas fichas arranquen en $0,00 automáticamente.
    """

    _lock = threading.Lock()
    _ultimo_mes_verificado: Optional[str] = None
    _ultimo_resultado: dict = {
        "ejecutado": False,
        "periodo_activo_actual": "",
        "ultimo_cierre_timestamp": None,
        "clientes_avanzados_count": 0,
        "articulos_liquidados_count": 0,
        "total_articulos_liquidados": Decimal("0.00"),
    }

    @classmethod
    def obtener_estado_ultimo_cierre(cls) -> dict:
        mes_actual = ahora_argentina().strftime("%Y-%m")
        datos = dict(cls._ultimo_resultado)
        if not datos.get("periodo_activo_actual"):
            datos["periodo_activo_actual"] = mes_actual
        return datos

    @classmethod
    def verificar_y_cerrar_periodos_vencidos(
        cls,
        db: Session,
        forzar: bool = False,
        mes_actual_override: Optional[str] = None,
    ) -> dict:
        """
        Verifica si existen fichas o productos pendientes de meses anteriores al mes actual
        y los cierra/liquida de forma atómica.
        Si `forzar=False` y el mes actual ya fue verificado en memoria sin cambios pendientes,
        retorna de inmediato para no penalizar la latencia de peticiones frecuentes.
        """
        ahora = ahora_argentina()
        mes_actual = mes_actual_override or ahora.strftime("%Y-%m")

        if not forzar and cls._ultimo_mes_verificado == mes_actual:
            # Verificación rápida: solo hacer trabajo si hay algún artículo pendiente de mes anterior
            # o cliente con periodo_actual < mes_actual
            hay_pendientes = (
                db.query(ClienteArticulo.id)
                .filter(
                    ClienteArticulo.estado == EstadoArticulo.PENDIENTE,
                    ClienteArticulo.periodo < mes_actual,
                )
                .first()
                is not None
            )
            hay_clientes_desfasados = (
                db.query(Cliente.id)
                .filter(
                    Cliente.activo.is_(True),
                    or_(
                        Cliente.periodo_actual.is_(None),
                        Cliente.periodo_actual < mes_actual,
                    ),
                )
                .first()
                is not None
            )
            if not hay_pendientes and not hay_clientes_desfasados:
                return cls.obtener_estado_ultimo_cierre()

        with cls._lock:
            # Buscar un operador de respaldo (admin) por si hiciera falta
            admin_op = (
                db.query(Usuario)
                .filter(Usuario.es_admin.is_(True))
                .order_by(Usuario.id.asc())
                .first()
            )
            if not admin_op:
                admin_op = db.query(Usuario).order_by(Usuario.id.asc()).first()

            # 1. Buscar todos los artículos pendientes de períodos anteriores al mes actual
            articulos_vencidos = (
                db.query(ClienteArticulo)
                .join(Cliente, Cliente.id == ClienteArticulo.cliente_id)
                .filter(
                    Cliente.activo.is_(True),
                    ClienteArticulo.estado == EstadoArticulo.PENDIENTE,
                )
                .order_by(ClienteArticulo.fecha_creacion.asc(), ClienteArticulo.id.asc())
                .all()
            )

            articulos_a_liquidar = []
            for art in articulos_vencidos:
                per_art = art.periodo or art.fecha_creacion.strftime("%Y-%m")
                if per_art < mes_actual:
                    articulos_a_liquidar.append((art, per_art))

            articulos_liquidados_count = 0
            total_liquidado = Decimal("0.00")

            for art, per_art in articulos_a_liquidar:
                cliente_query = db.query(Cliente).filter(Cliente.id == art.cliente_id)
                cliente = _lock_query(cliente_query, db).first()
                if not cliente or not cliente.activo:
                    continue

                producto = art.producto
                if not producto:
                    continue

                try:
                    _, _, anio_cierre, mes_cierre = parse_periodo(per_art)
                    nombre_mes_cierre = f"{MESES_ES.get(mes_cierre, str(mes_cierre))} {anio_cierre}"
                except Exception:
                    nombre_mes_cierre = per_art

                precio_vigente = producto.precio_actual
                monto_item = art.cantidad * precio_vigente
                nuevo_saldo = cliente.saldo_actual + monto_item

                nota_extra = f" ({art.nota})" if art.nota else ""
                cant_str = f"{art.cantidad:g}"
                operador_id = art.usuario_id or (admin_op.id if admin_op else 1)

                mov = Movimiento(
                    cliente_id=cliente.id,
                    usuario_id=operador_id,
                    tipo=TipoMovimiento.CARGO,
                    monto=monto_item,
                    saldo_resultante=nuevo_saldo,
                    nota=(
                        f"{producto.nombre} ({cant_str} {producto.unidad} sumada al cierre "
                        f"automático de {nombre_mes_cierre} a ${precio_vigente:,.2f}){nota_extra}"
                    ),
                    periodo=per_art,
                    anulado=False,
                    fecha_creacion=ahora,
                )
                db.add(mov)
                db.flush()

                cliente.saldo_actual = nuevo_saldo
                art.periodo = per_art
                art.estado = EstadoArticulo.LIQUIDADO
                art.movimiento_id = mov.id
                art.precio_liquidado = precio_vigente
                art.fecha_liquidacion = ahora

                articulos_liquidados_count += 1
                total_liquidado += monto_item

            # 2. Avanzar el periodo_actual de todos los clientes activos que hayan quedado en meses anteriores
            clientes_desfasados = (
                db.query(Cliente)
                .filter(
                    Cliente.activo.is_(True),
                    or_(
                        Cliente.periodo_actual.is_(None),
                        Cliente.periodo_actual < mes_actual,
                    ),
                )
                .all()
            )

            clientes_avanzados_count = 0
            for cli in clientes_desfasados:
                cli.periodo_actual = mes_actual
                clientes_avanzados_count += 1

            hubo_cambios = (articulos_liquidados_count > 0) or (clientes_avanzados_count > 0)
            if hubo_cambios:
                db.commit()
                logger.info(
                    f"[Cierre Mensual Automático -> {mes_actual}] "
                    f"Clientes avanzados: {clientes_avanzados_count} | "
                    f"Productos liquidados: {articulos_liquidados_count} (${total_liquidado:,.2f})"
                )
                cls._ultimo_resultado = {
                    "ejecutado": True,
                    "periodo_activo_actual": mes_actual,
                    "ultimo_cierre_timestamp": ahora,
                    "clientes_avanzados_count": (
                        cls._ultimo_resultado.get("clientes_avanzados_count", 0)
                        + clientes_avanzados_count
                    ),
                    "articulos_liquidados_count": (
                        cls._ultimo_resultado.get("articulos_liquidados_count", 0)
                        + articulos_liquidados_count
                    ),
                    "total_articulos_liquidados": (
                        cls._ultimo_resultado.get("total_articulos_liquidados", Decimal("0.00"))
                        + total_liquidado
                    ),
                }
            else:
                if not cls._ultimo_resultado.get("periodo_activo_actual"):
                    cls._ultimo_resultado["periodo_activo_actual"] = mes_actual

            cls._ultimo_mes_verificado = mes_actual
            return cls.obtener_estado_ultimo_cierre()
