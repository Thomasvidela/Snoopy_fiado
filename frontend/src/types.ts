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

export interface ResumenMensual {
  cliente: Cliente;
  periodo: string;
  saldo_anterior: string;
  total_cargos_periodo: string;
  total_pagos_periodo: string;
  saldo_final_periodo: string;
  movimientos: Movimiento[];
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
