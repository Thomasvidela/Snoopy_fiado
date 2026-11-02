import React, { useState, useEffect } from 'react';
import {
  X,
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCcw,
  CalendarCheck,
  AlertCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { ResumenDiario } from '../types';
import { api } from '../api/client';
import { formatCurrency, formatDate } from '../utils/format';
import { hapticSuccess, hapticError } from '../utils/haptics';

interface DailySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectClienteById?: (clienteId: number) => void;
  onRefreshClients?: () => void;
}

export const DailySummaryModal: React.FC<DailySummaryModalProps> = ({
  isOpen,
  onClose,
  onSelectClienteById,
  onRefreshClients,
}) => {
  const [data, setData] = useState<ResumenDiario | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [devolviendoId, setDevolviendoId] = useState<number | null>(null);

  const cargarResumen = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getResumenDiario();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Error al cargar el resumen diario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      cargarResumen();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDevolverDesdeResumen = async (envaseId: number) => {
    setDevolviendoId(envaseId);
    try {
      await api.devolverClienteEnvase(envaseId);
      hapticSuccess();
      await cargarResumen();
      if (onRefreshClients) onRefreshClients();
    } catch (err: any) {
      hapticError();
      alert(err.message || 'Error al registrar devolución');
    } finally {
      setDevolviendoId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl p-5 shadow-2xl relative flex flex-col max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pr-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-white">
              Resumen Diario y Envases en la Calle
            </h2>
            <p className="text-xs text-slate-400">
              {data ? `Fecha: ${data.fecha}` : 'Cargando métricas del día...'} • Reporte automático
              a las 22:00 hs
            </p>
          </div>
        </div>

        {loading && !data ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Calculando resumen del día...
          </div>
        ) : error ? (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        ) : data ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* 4 KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-900/80 border border-rose-500/30 rounded-xl p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">
                  Fiado Hoy
                </span>
                <span className="text-base sm:text-lg font-extrabold text-white mt-0.5 block">
                  {formatCurrency(data.fiado_hoy)}
                </span>
                <span className="text-[11px] text-slate-400">
                  {data.cantidad_cargos_hoy} compra(s) hoy
                </span>
              </div>

              <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                  Cobrado Hoy
                </span>
                <span className="text-base sm:text-lg font-extrabold text-white mt-0.5 block">
                  {formatCurrency(data.cobrado_hoy)}
                </span>
                <span className="text-[11px] text-slate-400">
                  {data.cantidad_pagos_hoy} cobro(s) hoy
                </span>
              </div>

              <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                  Total en la Calle
                </span>
                <span className="text-base sm:text-lg font-extrabold text-rose-300 mt-0.5 block">
                  {formatCurrency(data.total_en_calle)}
                </span>
                <span className="text-[11px] text-slate-400">
                  {data.clientes_con_deuda} clientes con saldo
                </span>
              </div>

              <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                  Envases Prestados
                </span>
                <span className="text-base sm:text-lg font-extrabold text-cyan-300 mt-0.5 block">
                  🍾 {data.envases_prestados_pendientes}
                </span>
                <span className="text-[11px] text-slate-400">
                  En {data.clientes_con_envases} cliente(s)
                </span>
              </div>
            </div>

            {/* Banner de Cierre de Mes Automático */}
            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5 text-emerald-200">
                <CalendarCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Cierre de Mes Automático Activo:</strong> Al cambiar el mes calendario,
                  todas las fichas y garrafas pendientes se cierran y liquidan solas.
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 shrink-0">
                Mes: {data.periodo_actual}
              </span>
            </div>

            {/* Sección: Quiénes tienen envases prestados de la despensa */}
            {data.envases_en_calle_detalle.length > 0 && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/15 p-3.5 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                  <RefreshCcw className="w-4 h-4" />
                  Envases Retornables Pendientes de Devolución ({data.envases_prestados_pendientes})
                </h3>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {data.envases_en_calle_detalle.map((env) => (
                    <div
                      key={env.id}
                      className="bg-slate-900/90 border border-slate-700/70 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectClienteById) {
                              onSelectClienteById(env.cliente_id);
                              onClose();
                            }
                          }}
                          className="font-bold text-white hover:text-cyan-300 transition text-left"
                        >
                          {env.cliente_nombre || `Cliente #${env.cliente_id}`}
                        </button>
                        <div className="text-cyan-300 font-semibold">
                          🍾 Debe {env.cantidad_pendiente}x {env.descripcion}
                          {env.nota ? (
                            <span className="text-slate-400 font-normal"> ({env.nota})</span>
                          ) : null}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Prestado el {formatDate(env.fecha_prestamo)}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={devolviendoId === env.id}
                        onClick={() => handleDevolverDesdeResumen(env.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shrink-0 transition active:scale-95 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Devolvió</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Movimientos registrados hoy */}
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-3.5 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                Movimientos Registrados Hoy ({data.ultimos_movimientos_hoy.length})
              </h3>
              {data.ultimos_movimientos_hoy.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  Todavía no se registraron fiados ni cobros en el día de hoy.
                </p>
              ) : (
                <div className="divide-y divide-slate-800 max-h-52 overflow-y-auto pr-1">
                  {data.ultimos_movimientos_hoy.map((m) => {
                    const isCargo = m.tipo === 'CARGO';
                    return (
                      <div
                        key={m.id}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                              isCargo
                                ? 'bg-rose-500/15 text-rose-400'
                                : 'bg-emerald-500/15 text-emerald-400'
                            }`}
                          >
                            {isCargo ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="text-slate-200 font-medium truncate">
                              {m.nota || (isCargo ? 'Compra fiada' : 'Pago recibido')}
                            </p>
                            <span className="text-[10px] text-slate-400">
                              {formatDate(m.fecha_creacion)}
                              {m.operador_nombre ? ` • ${m.operador_nombre}` : ''}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`font-bold shrink-0 ${
                            isCargo ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {isCargo ? '+' : '-'}
                          {formatCurrency(m.monto)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-4 pt-3 border-t border-slate-700/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
