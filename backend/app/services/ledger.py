from datetime import datetime
from decimal import Decimal
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, Query

from app.models import Cliente, Movimiento, TipoMovimiento, Usuario, ahora_argentina
from app.schemas import ClienteCreate, MovimientoCreate


def _lock_query(query: Query, db: Session) -> Query:
    """Aplica SELECT ... FOR UPDATE en PostgreSQL / bases compatibles, evitando error en SQLite."""
    bind = db.get_bind()
    if bind and bind.dialect.name == "sqlite":
        return query
    return query.with_for_update()


def normalizar_telefono_argentina(telefono: Optional[str]) -> Optional[str]:
    """Normaliza y asegura que el número comience con el código internacional +54 de Argentina."""
    if not telefono:
        return None
    limpio = "".join(c for c in telefono if c.isdigit() or c == "+")
    if not limpio:
        return None
    if limpio.startswith("+"):
        limpio = limpio[1:]
    if limpio.startswith("0"):
        limpio = limpio[1:]
    if not limpio.startswith("54"):
        limpio = "54" + limpio
    if limpio.startswith("54") and not limpio.startswith("549"):
        limpio = "549" + limpio[2:]

    resto = limpio[3:]
    if len(resto) == 10:
        area = resto[:2]
        num1 = resto[2:6]
        num2 = resto[6:]
        return f"+54 9 {area} {num1}-{num2}"
    elif len(resto) > 5:
        area = resto[:3]
        num = resto[3:]
        return f"+54 9 {area} {num}"
    return f"+54 9 {resto}"


class LedgerService:
    @staticmethod
    def crear_cliente(db: Session, datos: ClienteCreate, operador: Usuario) -> Cliente:
        """
        Crea un nuevo cliente. Si viene con saldo_inicial > 0 (migración de libreta física),
        se genera de forma atómica el primer movimiento CARGO correspondiente.
        """
        saldo_inicial = Decimal(str(datos.saldo_inicial or "0.00"))
        if saldo_inicial < Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El saldo inicial no puede ser negativo."
            )

        cliente = Cliente(
            nombre=datos.nombre.strip(),
            apodo=datos.apodo.strip() if datos.apodo else None,
            telefono=normalizar_telefono_argentina(datos.telefono),
            saldo_actual=Decimal("0.00"),
            ultima_actividad=ahora_argentina(),
            activo=True,
            fecha_alta=ahora_argentina()
        )
        db.add(cliente)
        db.flush()  # Obtiene cliente.id

        if saldo_inicial > Decimal("0.00"):
            movimiento_inicial = Movimiento(
                cliente_id=cliente.id,
                usuario_id=operador.id,
                tipo=TipoMovimiento.CARGO,
                monto=saldo_inicial,
                saldo_resultante=saldo_inicial,
                nota="Saldo inicial (migrado del fichero)",
                anulado=False,
                fecha_creacion=ahora_argentina()
            )
            cliente.saldo_actual = saldo_inicial
            db.add(movimiento_inicial)

        db.commit()
        db.refresh(cliente)
        return cliente

    @staticmethod
    def registrar_movimiento(
        db: Session,
        cliente_id: int,
        datos: MovimientoCreate,
        operador: Usuario
    ) -> Movimiento:
        """
        Registra un CARGO o PAGO con bloqueo pesimista (FOR UPDATE) sobre el cliente.
        Garantiza que el saldo_actual y saldo_resultante sean calculados con precisión Decimal.
        """
        if datos.tipo not in (TipoMovimiento.CARGO, TipoMovimiento.PAGO):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Solo se pueden registrar directamente movimientos de tipo CARGO o PAGO."
            )

        monto = Decimal(str(datos.monto))
        if monto <= Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El monto debe ser estrictamente mayor a 0."
            )

        # Bloqueo pesimista de la fila del cliente
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
                detail="No se pueden asentar movimientos en un cliente inactivo."
            )

        saldo_actual = cliente.saldo_actual
        if datos.tipo == TipoMovimiento.CARGO:
            nuevo_saldo = saldo_actual + monto
        else:  # PAGO
            nuevo_saldo = saldo_actual - monto

        ahora = ahora_argentina()
        movimiento = Movimiento(
            cliente_id=cliente.id,
            usuario_id=operador.id,
            tipo=datos.tipo,
            monto=monto,
            saldo_resultante=nuevo_saldo,
            nota=datos.nota.strip() if datos.nota else None,
            anulado=False,
            fecha_creacion=ahora
        )

        cliente.saldo_actual = nuevo_saldo
        cliente.ultima_actividad = ahora

        db.add(movimiento)
        db.commit()
        db.refresh(movimiento)
        return movimiento

    @staticmethod
    def anular_movimiento(
        db: Session,
        movimiento_id: int,
        operador: Usuario
    ) -> Movimiento:
        """
        Anula un movimiento existente marcándolo anulado=True y creando atómicamente
        un contra-asiento (ANULACION_CARGO o ANULACION_PAGO) que revierte el saldo.
        Utiliza bloqueo pesimista en ambas entidades.
        """
        # Bloquear movimiento original
        mov_query = db.query(Movimiento).filter(Movimiento.id == movimiento_id)
        movimiento = _lock_query(mov_query, db).first()

        if not movimiento:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Movimiento no encontrado."
            )

        if movimiento.anulado:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El movimiento ya se encuentra anulado."
            )

        if movimiento.tipo in (TipoMovimiento.ANULACION_CARGO, TipoMovimiento.ANULACION_PAGO):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede anular un movimiento de contra-asiento."
            )

        # Bloquear cliente
        cliente_query = db.query(Cliente).filter(Cliente.id == movimiento.cliente_id)
        cliente = _lock_query(cliente_query, db).first()

        if not cliente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cliente asociado al movimiento no encontrado."
            )

        ahora = ahora_argentina()
        monto = movimiento.monto

        if movimiento.tipo == TipoMovimiento.CARGO:
            contra_tipo = TipoMovimiento.ANULACION_CARGO
            nuevo_saldo = cliente.saldo_actual - monto
        elif movimiento.tipo == TipoMovimiento.PAGO:
            contra_tipo = TipoMovimiento.ANULACION_PAGO
            nuevo_saldo = cliente.saldo_actual + monto
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tipo de movimiento no anulable."
            )

        # Marcar original como anulado
        movimiento.anulado = True
        movimiento.anulado_por_id = operador.id
        movimiento.fecha_anulacion = ahora

        # Crear contra-asiento inmutable
        nota_anulacion = f"Anulación de #{movimiento.id} ({movimiento.tipo.value})"
        if movimiento.nota:
            nota_anulacion += f" - {movimiento.nota}"

        contra_asiento = Movimiento(
            cliente_id=cliente.id,
            usuario_id=operador.id,
            tipo=contra_tipo,
            monto=monto,
            saldo_resultante=nuevo_saldo,
            nota=nota_anulacion,
            anulado=False,
            anula_movimiento_id=movimiento.id,
            fecha_creacion=ahora
        )

        cliente.saldo_actual = nuevo_saldo
        cliente.ultima_actividad = ahora

        db.add(contra_asiento)
        db.commit()
        db.refresh(contra_asiento)
        return contra_asiento
