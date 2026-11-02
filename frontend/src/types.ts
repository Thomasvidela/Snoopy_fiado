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
  periodo_actual?: string | null;
  total_articulos_pendientes?: string;
  articulos_pendientes_count?: number;
  saldo_total?: string;
  envases_pendientes_count?: number;
  envases_pendientes_resumen?: string[];
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
  periodo?: string | null;
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
  periodo?: string | null;
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
  periodo?: string;
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
  envases_pendientes?: PrestamoEnvase[];
  texto_whatsapp: string;
}

export interface PrestamoEnvase {
  id: number;
  cliente_id: number;
  cliente_nombre?: string | null;
  usuario_id: number;
  operador_nombre?: string | null;
  descripcion: string;
  cantidad: number;
  cantidad_devuelta: number;
  cantidad_pendiente: number;
  nota?: string | null;
  estado: 'PRESTADO' | 'DEVUELTO';
  fecha_prestamo: string;
  fecha_devolucion?: string | null;
  devuelto_por_nombre?: string | null;
}

export interface PrestamoEnvaseCreatePayload {
  descripcion: string;
  cantidad: number;
  nota?: string;
}

export interface CierreAutomaticoInfo {
  ejecutado: boolean;
  periodo_activo_actual: string;
  ultimo_cierre_timestamp?: string | null;
  clientes_avanzados_count: number;
  articulos_liquidados_count: number;
  total_articulos_liquidados: string;
}

export interface ResumenDiario {
  fecha: string;
  periodo_actual: string;
  fiado_hoy: string;
  cantidad_cargos_hoy: number;
  cobrado_hoy: string;
  cantidad_pagos_hoy: number;
  total_en_calle: string;
  clientes_con_deuda: number;
  total_articulos_pendientes_valor: string;
  articulos_pendientes_unidades: number;
  envases_prestados_pendientes: number;
  clientes_con_envases: number;
  ultimos_movimientos_hoy: Movimiento[];
  envases_en_calle_detalle: PrestamoEnvase[];
  cierre_automatico: CierreAutomaticoInfo;
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
  periodo?: string;
}

export interface MovimientoUpdatePayload {
  monto?: string;
  nota?: string;
}

export interface CerrarMesResponse {
  ok: boolean;
  mensaje: string;
  periodo_cerrado: string;
  nuevo_periodo_activo: string;
  articulos_liquidados_count: number;
  total_articulos_liquidados: string;
  saldo_cierre: string;
  cliente: Cliente;
}

export interface OperadorCreatePayload {
  nombre: string;
  pin: string;
  es_admin?: boolean;
}
