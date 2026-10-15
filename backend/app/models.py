from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from typing import Optional, List
from sqlalchemy import (
    String,
    Boolean,
    Numeric,
    DateTime,
    ForeignKey,
    Index,
    Enum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from zoneinfo import ZoneInfo
from app.database import Base

# Zona horaria oficial del comercio (Argentina UTC-3)
TZ_ARG = ZoneInfo("America/Argentina/Buenos_Aires")


def ahora_argentina() -> datetime:
    """Retorna la fecha y hora actual en la zona horaria de Argentina (UTC-3)."""
    return datetime.now(TZ_ARG).replace(tzinfo=None)


# Alias de compatibilidad
utc_now = ahora_argentina


class TipoMovimiento(str, PyEnum):
    CARGO = "CARGO"
    PAGO = "PAGO"
    ANULACION_CARGO = "ANULACION_CARGO"
    ANULACION_PAGO = "ANULACION_PAGO"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    pin_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    es_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    movimientos_registrados: Mapped[List["Movimiento"]] = relationship(
        "Movimiento",
        foreign_keys="Movimiento.usuario_id",
        back_populates="operador"
    )


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    apodo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    telefono: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    saldo_actual: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False
    )
    ultima_actividad: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        index=True,
        nullable=False
    )
    activo: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    fecha_alta: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    movimientos: Mapped[List["Movimiento"]] = relationship(
        "Movimiento",
        foreign_keys="Movimiento.cliente_id",
        back_populates="cliente",
        order_by="desc(Movimiento.fecha_creacion)"
    )


class Movimiento(Base):
    __tablename__ = "movimientos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    tipo: Mapped[TipoMovimiento] = mapped_column(
        Enum(TipoMovimiento, name="tipo_movimiento"),
        nullable=False
    )
    monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    saldo_resultante: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    nota: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    anulado: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    anulado_por_id: Mapped[Optional[int]] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    fecha_anulacion: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    anula_movimiento_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("movimientos.id"),
        nullable=True
    )
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False
    )

    # Relationships
    cliente: Mapped["Cliente"] = relationship("Cliente", back_populates="movimientos")
    operador: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[usuario_id],
        back_populates="movimientos_registrados"
    )
    anulado_por: Mapped[Optional["Usuario"]] = relationship(
        "Usuario",
        foreign_keys=[anulado_por_id]
    )
    anula_movimiento: Mapped[Optional["Movimiento"]] = relationship(
        "Movimiento",
        remote_side=[id],
        foreign_keys=[anula_movimiento_id]
    )

    __table_args__ = (
        Index("ix_movimientos_cliente_fecha", "cliente_id", "fecha_creacion"),
    )
