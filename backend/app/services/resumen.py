from calendar import monthrange
from datetime import datetime
from decimal import Decimal
from typing import List, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Cliente, Movimiento, TipoMovimiento
from app.schemas import ClienteOut, MovimientoOut, ResumenMensualOut

MESES_ES = {
    1: "Enero",
    2: "Febrero",
    3: "Marzo",
    4: "Abril",
    5: "Mayo",
    6: "Junio",
    7: "Julio",
    8: "Agosto",
    9: "Septiembre",
    10: "Octubre",
    11: "Noviembre",
    12: "Diciembre",
}


def formatear_pesos(monto: Decimal) -> str:
    """Formatea un Decimal al formato monetario argentino ($ 1.250,50)."""
    signo = "-" if monto < Decimal("0.00") else ""
    monto_abs = abs(monto)
    partes = f"{monto_abs:,.2f}".split(".")
    entero = partes[0].replace(",", ".")
    decimal = partes[1]
    return f"{signo}${entero},{decimal}"


def parse_periodo(periodo: str) -> Tuple[datetime, datetime, int, int]:
    """Parsea una cadena 'YYYY-MM' y devuelve (inicio_mes, fin_mes, anio, mes)."""
    try:
        partes = periodo.strip().split("-")
        anio = int(partes[0])
        mes = int(partes[1])
        if mes < 1 or mes > 12:
            raise ValueError
        _, ultimo_dia = monthrange(anio, mes)
        inicio_mes = datetime(anio, mes, 1, 0, 0, 0)
        # Fin de mes inclusivo hasta 23:59:59.999999
        fin_mes = datetime(anio, mes, ultimo_dia, 23, 59, 59, 999999)
        return inicio_mes, fin_mes, anio, mes
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de período inválido. Debe ser 'YYYY-MM' (ej: '2026-10')."
        )


class ResumenService:
    @staticmethod
    def generar_resumen(
        db: Session,
        cliente_id: int,
        periodo: str
    ) -> ResumenMensualOut:
        """
        Genera el estado de cuenta mensual de un cliente, calculando:
        - Saldo anterior (al inicio del período)
        - Total cargos netos del período
        - Total pagos netos del período
        - Saldo final del período
        - Mensaje preformateado para WhatsApp
        """
        cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cliente no encontrado."
            )

        inicio_mes, fin_mes, anio, mes = parse_periodo(periodo)

        # 1. Saldo anterior: último movimiento ANTERIOR al inicio del mes
        ultimo_mov_anterior = (
            db.query(Movimiento)
            .filter(
                Movimiento.cliente_id == cliente_id,
                Movimiento.fecha_creacion < inicio_mes
            )
            .order_by(Movimiento.fecha_creacion.desc(), Movimiento.id.desc())
            .first()
        )
        saldo_anterior = ultimo_mov_anterior.saldo_resultante if ultimo_mov_anterior else Decimal("0.00")

        # 2. Movimientos del período
        movimientos_db = (
            db.query(Movimiento)
            .filter(
                Movimiento.cliente_id == cliente_id,
                Movimiento.fecha_creacion >= inicio_mes,
                Movimiento.fecha_creacion <= fin_mes
            )
            .order_by(Movimiento.fecha_creacion.asc(), Movimiento.id.asc())
            .all()
        )

        # Calcular totales del período considerando anulaciones
        # Cargos efectivos = CARGOs no anulados
        # Pagos efectivos = PAGOs no anulados
        total_cargos = sum(
            (m.monto for m in movimientos_db if m.tipo == TipoMovimiento.CARGO and not m.anulado),
            Decimal("0.00")
        )
        total_pagos = sum(
            (m.monto for m in movimientos_db if m.tipo == TipoMovimiento.PAGO and not m.anulado),
            Decimal("0.00")
        )

        if movimientos_db:
            saldo_final = movimientos_db[-1].saldo_resultante
        else:
            saldo_final = saldo_anterior

        # Mapear movimientos a DTO Out
        movimientos_out: List[MovimientoOut] = []
        lineas_detalle = []

        for m in movimientos_db:
            operador_nombre = m.operador.nombre if m.operador else None
            anulado_por_nombre = m.anulado_por.nombre if m.anulado_por else None

            mov_out = MovimientoOut(
                id=m.id,
                cliente_id=m.cliente_id,
                usuario_id=m.usuario_id,
                operador_nombre=operador_nombre,
                tipo=m.tipo,
                monto=m.monto,
                saldo_resultante=m.saldo_resultante,
                nota=m.nota,
                anulado=m.anulado,
                anulado_por_id=m.anulado_por_id,
                anulado_por_nombre=anulado_por_nombre,
                fecha_anulacion=m.fecha_anulacion,
                anula_movimiento_id=m.anula_movimiento_id,
                fecha_creacion=m.fecha_creacion
            )
            movimientos_out.append(mov_out)

            # Generar línea para WhatsApp
            fecha_str = m.fecha_creacion.strftime("%d/%m")
            if m.anulado:
                lineas_detalle.append(f"- ~{fecha_str}: {formatear_pesos(m.monto)} ({m.tipo.value} - ANULADO)~")
            elif m.tipo == TipoMovimiento.CARGO:
                nota_txt = f" - {m.nota}" if m.nota else ""
                lineas_detalle.append(f"- {fecha_str}: {formatear_pesos(m.monto)} (Compra{nota_txt})")
            elif m.tipo == TipoMovimiento.PAGO:
                nota_txt = f" - {m.nota}" if m.nota else ""
                lineas_detalle.append(f"- {fecha_str}: -{formatear_pesos(m.monto)} (Pago recibido{nota_txt})")
            elif m.tipo in (TipoMovimiento.ANULACION_CARGO, TipoMovimiento.ANULACION_PAGO):
                lineas_detalle.append(f"- {fecha_str}: {m.tipo.value} ({formatear_pesos(m.monto)})")

        nombre_mes = MESES_ES.get(mes, str(mes))
        alias_texto = f" ({cliente.apodo})" if cliente.apodo else ""

        if not lineas_detalle:
            bloque_detalle = "- Sin movimientos registrados en este período."
        else:
            bloque_detalle = "\n".join(lineas_detalle)

        texto_whatsapp = (
            f"*Despensa Snoopy*\n"
            f"*Cliente:* {cliente.nombre}{alias_texto}\n"
            f"*Período:* {nombre_mes} {anio}\n\n"
            f"*Estado de Cuenta:*\n"
            f"- Saldo anterior: {formatear_pesos(saldo_anterior)}\n"
            f"- (+) Compras del mes: {formatear_pesos(total_cargos)}\n"
            f"- (-) Pagos/Entregas: {formatear_pesos(total_pagos)}\n"
            f"--------------------------------\n"
            f"*SALDO TOTAL: {formatear_pesos(saldo_final)}*\n"
            f"--------------------------------\n\n"
            f"*Detalle de movimientos:*\n"
            f"{bloque_detalle}\n\n"
            f"¡Muchas gracias por su compra!"
        )

        return ResumenMensualOut(
            cliente=ClienteOut.model_validate(cliente),
            periodo=periodo,
            saldo_anterior=saldo_anterior,
            total_cargos_periodo=total_cargos,
            total_pagos_periodo=total_pagos,
            saldo_final_periodo=saldo_final,
            movimientos=movimientos_out,
            texto_whatsapp=texto_whatsapp
        )
