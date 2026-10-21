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


def calcular_siguiente_periodo(periodo: str) -> str:
    """Dado un período 'YYYY-MM', retorna el siguiente mes 'YYYY-MM'."""
    try:
        anio_str, mes_str = periodo.strip().split("-")
        anio = int(anio_str)
        mes = int(mes_str)
        if mes >= 12:
            return f"{anio + 1}-01"
        return f"{anio}-{mes + 1:02d}"
    except Exception:
        ahora = ahora_argentina()
        if ahora.month >= 12:
            return f"{ahora.year + 1}-01"
        return f"{ahora.year}-{ahora.month + 1:02d}"


def obtener_periodo_activo_cliente(cliente: "Cliente") -> str:
    """
    Retorna el período contable activo ('YYYY-MM') del cliente.
    Si el cliente cerró anticipadamente el mes en curso, su periodo_actual será posterior
    al mes calendario y los nuevos movimientos se imputarán a ese nuevo mes.
    """
    mes_calendario = ahora_argentina().strftime("%Y-%m")
    if getattr(cliente, "periodo_actual", None) and cliente.periodo_actual > mes_calendario:
        return cliente.periodo_actual
    return mes_calendario


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
    periodo_actual: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)

    movimientos: Mapped[List["Movimiento"]] = relationship(
        "Movimiento",
        foreign_keys="Movimiento.cliente_id",
        back_populates="cliente",
        order_by="desc(Movimiento.fecha_creacion)"
    )
    articulos: Mapped[List["ClienteArticulo"]] = relationship(
        "ClienteArticulo",
        foreign_keys="ClienteArticulo.cliente_id",
        back_populates="cliente",
        order_by="desc(ClienteArticulo.fecha_creacion)"
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
    periodo: Mapped[Optional[str]] = mapped_column(String(7), index=True, nullable=True)

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


class EstadoArticulo(str, PyEnum):
    PENDIENTE = "PENDIENTE"
    LIQUIDADO = "LIQUIDADO"
    DEVUELTO = "DEVUELTO"


class Producto(Base):
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    precio_actual: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unidad: Mapped[str] = mapped_column(String(50), default="unidad", nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    fecha_actualizacion: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    articulos: Mapped[List["ClienteArticulo"]] = relationship("ClienteArticulo", back_populates="producto")


class ClienteArticulo(Base):
    __tablename__ = "cliente_articulos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, index=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"), nullable=False, index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1.00"), nullable=False)
    nota: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    estado: Mapped[EstadoArticulo] = mapped_column(
        Enum(EstadoArticulo, name="estado_articulo"),
        default=EstadoArticulo.PENDIENTE,
        index=True,
        nullable=False
    )
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    movimiento_id: Mapped[Optional[int]] = mapped_column(ForeignKey("movimientos.id"), nullable=True)
    precio_liquidado: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    fecha_liquidacion: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    cliente: Mapped["Cliente"] = relationship("Cliente", back_populates="articulos")
    producto: Mapped["Producto"] = relationship("Producto", back_populates="articulos")
    operador: Mapped["Usuario"] = relationship("Usuario")
    movimiento: Mapped[Optional["Movimiento"]] = relationship("Movimiento")

