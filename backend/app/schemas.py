from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.models import TipoMovimiento


class OperadorOut(BaseModel):
    id: int
    nombre: str
    activo: bool
    es_admin: bool = False

    model_config = ConfigDict(from_attributes=True)


class OperadorCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    pin: str = Field(..., min_length=4, max_length=10)
    es_admin: bool = False


class OperadorUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=100)
    pin: Optional[str] = Field(default=None, min_length=4, max_length=10)
    activo: Optional[bool] = None
    es_admin: Optional[bool] = None


class ClaveLocalRequest(BaseModel):
    clave: str = Field(..., min_length=1, max_length=100)


class LoginPinRequest(BaseModel):
    usuario_id: int
    pin: str = Field(..., min_length=4, max_length=10)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    operador: OperadorOut


class ClienteCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    apodo: Optional[str] = Field(default=None, max_length=100)
    telefono: Optional[str] = Field(default=None, max_length=50)
    saldo_inicial: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=1, max_length=150)
    apodo: Optional[str] = Field(default=None, max_length=100)
    telefono: Optional[str] = Field(default=None, max_length=50)
    activo: Optional[bool] = None


class ClienteOut(BaseModel):
    id: int
    nombre: str
    apodo: Optional[str] = None
    telefono: Optional[str] = None
    saldo_actual: Decimal
    ultima_actividad: datetime
    activo: bool
    fecha_alta: datetime
    total_articulos_pendientes: Decimal = Decimal("0.00")
    articulos_pendientes_count: int = 0
    saldo_total: Decimal = Decimal("0.00")

    model_config = ConfigDict(from_attributes=True)


class ListadoClientesResponse(BaseModel):
    items: List[ClienteOut]
    total: int


class MovimientoCreate(BaseModel):
    tipo: TipoMovimiento
    monto: Decimal = Field(..., gt=Decimal("0.00"))
    nota: Optional[str] = Field(default=None, max_length=255)


class MovimientoOut(BaseModel):
    id: int
    cliente_id: int
    usuario_id: int
    operador_nombre: Optional[str] = None
    tipo: TipoMovimiento
    monto: Decimal
    saldo_resultante: Decimal
    nota: Optional[str] = None
    anulado: bool
    anulado_por_id: Optional[int] = None
    anulado_por_nombre: Optional[str] = None
    fecha_anulacion: Optional[datetime] = None
    anula_movimiento_id: Optional[int] = None
    fecha_creacion: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Productos de Precio Dinámico ---
class ProductoBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    precio_actual: Decimal = Field(..., gt=Decimal("0.00"))
    unidad: str = Field(default="unidad", max_length=50)


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=1, max_length=150)
    precio_actual: Optional[Decimal] = Field(default=None, gt=Decimal("0.00"))
    unidad: Optional[str] = Field(default=None, max_length=50)
    activo: Optional[bool] = None


class ProductoOut(ProductoBase):
    id: int
    activo: bool
    fecha_creacion: datetime
    fecha_actualizacion: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Artículos Dinámicos en Libreta de Clientes ---
class ClienteArticuloCreate(BaseModel):
    producto_id: int
    cantidad: Decimal = Field(default=Decimal("1.00"), gt=Decimal("0.00"))
    nota: Optional[str] = Field(default=None, max_length=255)


class ClienteArticuloOut(BaseModel):
    id: int
    cliente_id: int
    producto_id: int
    producto_nombre: str
    producto_unidad: str
    precio_unitario_actual: Decimal
    cantidad: Decimal
    subtotal_actual: Decimal
    nota: Optional[str] = None
    estado: str
    fecha_creacion: datetime
    usuario_nombre: Optional[str] = None
    movimiento_id: Optional[int] = None
    precio_liquidado: Optional[Decimal] = None
    fecha_liquidacion: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LiquidarArticulosRequest(BaseModel):
    articulo_ids: Optional[List[int]] = Field(default=None, description="IDs específicos a liquidar o None para todos los pendientes")
    nota_adicional: Optional[str] = Field(default=None, max_length=100)


class ResumenMensualOut(BaseModel):
    cliente: ClienteOut
    periodo: str
    saldo_anterior: Decimal
    total_cargos_periodo: Decimal
    total_pagos_periodo: Decimal
    saldo_final_periodo: Decimal
    movimientos: List[MovimientoOut]
    articulos_pendientes: List[ClienteArticuloOut] = []
    total_articulos_pendientes: Decimal = Decimal("0.00")
    saldo_total_con_articulos: Decimal = Decimal("0.00")
    texto_whatsapp: str
