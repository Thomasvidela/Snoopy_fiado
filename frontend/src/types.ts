export type TipoMovimiento = 'CARGO' | 'PAGO' | 'ANULACION_CARGO' | 'ANULACION_PAGO';

export interface Operador {
  id: number;
  nombre: string;
  activo: boolean;
  es_admin?: boolean;
}

export interface Cliente {
  id: number;
  nombre: string;
  apodo?: string | null;
  telefono?: string | null;
  saldo_actual: string;
  ultima_actividad: string;
  activo: boolean;
  fecha_alta: string;
  total_articulos_pendientes?: string;
  articulos_pendientes_count?: number;
  saldo_total?: string;
}

export interface ListadoClientesResponse {
  items: Cliente[];
  total: number;
}

export interface Movimiento {
  id: number;
  cliente_id: number;
  usuario_id: number;
  operador_nombre?: string | null;
  tipo: TipoMovimiento;
  monto: string;
  saldo_resultante: string;
  nota?: string | null;
  anulado: boolean;
  anulado_por_id?: number | null;
  anulado_por_nombre?: string | null;
  fecha_anulacion?: string | null;
  anula_movimiento_id?: number | null;
  fecha_creacion: string;
}

export interface Producto {
  id: number;
  nombre: string;
  precio_actual: string;
  unidad: string;
  activo: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface ProductoCreatePayload {
  nombre: string;
  precio_actual: string | number;
  unidad?: string;
}

export interface ProductoUpdatePayload {
  nombre?: string;
  precio_actual?: string | number;
  unidad?: string;
  activo?: boolean;
}

export interface ClienteArticulo {
  id: number;
  cliente_id: number;
  producto_id: number;
  producto_nombre: string;
  producto_unidad: string;
  precio_unitario_actual: string;
  cantidad: string;
  subtotal_actual: string;
  nota?: string | null;
  estado: 'PENDIENTE' | 'LIQUIDADO' | 'DEVUELTO';
  fecha_creacion: string;
  usuario_nombre?: string | null;
  movimiento_id?: number | null;
  precio_liquidado?: string | null;
  fecha_liquidacion?: string | null;
}

export interface ClienteArticuloCreatePayload {
  producto_id: number;
  cantidad: string | number;
  nota?: string;
}

export interface ResumenMensual {
  cliente: Cliente;
  periodo: string;
  saldo_anterior: string;
  total_cargos_periodo: string;
  total_pagos_periodo: string;
  saldo_final_periodo: string;
  movimientos: Movimiento[];
  articulos_pendientes?: ClienteArticulo[];
  total_articulos_pendientes?: string;
  saldo_total_con_articulos?: string;
  texto_whatsapp: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  operador: Operador;
}

export interface ClienteCreatePayload {
  nombre: string;
  apodo?: string;
  telefono?: string;
  saldo_inicial?: string;
}

export interface MovimientoCreatePayload {
  tipo: 'CARGO' | 'PAGO';
  monto: string;
  nota?: string;
}

export interface OperadorCreatePayload {
  nombre: string;
  pin: string;
  es_admin?: boolean;
}
