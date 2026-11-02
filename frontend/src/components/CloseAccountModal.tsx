import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Calculator,
  AlertCircle,
  CalendarCheck,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Cliente, ClienteArticulo } from '../types';
import { formatCurrency } from '../utils/format';
import { hapticSuccess, hapticError } from '../utils/haptics';
import { api } from '../api/client';
import { PostOperationInfo } from './PostOperationModal';

interface CloseAccountModalProps {
  isOpen: boolean;
  cliente: Cliente | null;
  targetPeriodo?: string;
  saldoFichaLibreta?: number;
  articulosPendientes: ClienteArticulo[];
  onClose: () => void;
  onSuccess: (info: PostOperationInfo, nuevoPeriodoActivo?: string) => Promise<void> | void;
}

const MESES_NOMBRES: Record<number, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

function formatearPeriodoLabel(periodo: string): string {
  const parts = periodo.split('-');
  if (parts.length !== 2) return periodo;
  const anio = parseInt(parts[0], 10);
  const mes = parseInt(parts[1], 10);
  return `${MESES_NOMBRES[mes] || mes} ${anio}`;
}

function obtenerSiguientePeriodo(periodo: string): string {
  const parts = periodo.split('-');
  if (parts.length !== 2) return periodo;
  const anio = parseInt(parts[0], 10);
  const mes = parseInt(parts[1], 10);
  if (mes >= 12) return `${anio + 1}-01`;
  return `${anio}-${String(mes + 1).padStart(2, '0')}`;
}

export const CloseAccountModal: React.FC<CloseAccountModalProps> = ({
  isOpen,
  cliente,
  targetPeriodo,
  saldoFichaLibreta,
  articulosPendientes,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !cliente) return null;

  const now = new Date();
  const mesCalendario = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const periodoActivoActual =
    cliente.periodo_actual && cliente.periodo_actual > mesCalendario
      ? cliente.periodo_actual
      : mesCalendario;

  const periodoACerrar = targetPeriodo || periodoActivoActual;
  const esCierreDeMesActual = periodoACerrar >= periodoActivoActual;
  const proximoPeriodo = esCierreDeMesActual
    ? obtenerSiguientePeriodo(periodoACerrar)
    : periodoActivoActual;

  const labelMesCierre = formatearPeriodoLabel(periodoACerrar);
  const labelMesNuevo = formatearPeriodoLabel(proximoPeriodo);

  const saldoLibreta =
    saldoFichaLibreta !== undefined ? saldoFichaLibreta : parseFloat(cliente.saldo_actual);
  const totalArticulos = articulosPendientes.reduce(
    (acc, a) => acc + parseFloat(a.subtotal_actual),
    0
  );
  const totalConsolidado = saldoLibreta + totalArticulos;

  const handleConfirmarCierre = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.cerrarMesCliente(cliente.id, periodoACerrar);
      hapticSuccess();
      onClose();
      await onSuccess(
        {
          titulo: `¡Ficha ${labelMesCierre} liquidada!`,
          detalle:
            res.articulos_liquidados_count > 0
              ? `Se sumaron ${res.articulos_liquidados_count} producto(s) al cierre de ${labelMesCierre} y el total del mes quedó en ${formatCurrency(
                  res.saldo_cierre
                )}`
              : `La ficha de ${labelMesCierre} quedó cerrada en ${formatCurrency(
                  res.saldo_cierre
                )} y se habilitó ${labelMesNuevo}`,
          monto: res.saldo_cierre,
          esCargo: true,
        },
        res.nuevo_periodo_activo
      );
    } catch (err: any) {
      hapticError();
      setError(err.message || 'Error al liquidar el mes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pr-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-white">
              {esCierreDeMesActual
                ? `Liquidar / Cerrar Ficha ${labelMesCierre}`
                : `Sumar Productos al Cierre de ${labelMesCierre}`}
            </h2>
            <p className="text-xs text-slate-400">
              Cliente: <strong className="text-white">{cliente.nombre}</strong>
              {cliente.apodo && (
                <span className="text-amber-400 ml-1.5 font-semibold">"{cliente.apodo}"</span>
              )}
            </p>
          </div>
        </div>

        {/* Transición de Pestañas de Mes */}
        {esCierreDeMesActual && (
          <div className="grid grid-cols-11 items-center gap-2 bg-slate-900/80 border border-slate-700/70 rounded-xl p-3 mb-4">
            <div className="col-span-5 bg-slate-800/90 border border-slate-700 rounded-lg p-2.5 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                Se cierra ficha
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-white mt-0.5 block">
                {labelMesCierre}
              </span>
            </div>
            <div className="col-span-1 flex justify-center text-emerald-400">
              <ArrowRight className="w-4 h-4" />
            </div>
            <div className="col-span-5 bg-emerald-950/30 border border-emerald-500/40 rounded-lg p-2.5 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                Nueva ficha en $0,00
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-emerald-200 mt-0.5 block">
                {labelMesNuevo}
              </span>
            </div>
          </div>
        )}

        {/* Desglose del Cierre de la Ficha */}
        <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 space-y-2.5 mb-4">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Subtotal compras/pagos en ficha {labelMesCierre}:</span>
            <span className="font-bold text-white">{formatCurrency(saldoLibreta)}</span>
          </div>

          {articulosPendientes.length > 0 && (
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-amber-300 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  Productos que se suman al cierre hoy ({articulosPendientes.length}):
                </span>
                <span>+{formatCurrency(totalArticulos)}</span>
              </div>
              <div className="pl-5 space-y-1">
                {articulosPendientes.map((art) => (
                  <div
                    key={art.id}
                    className="flex items-center justify-between text-[11px] text-slate-400"
                  >
                    <span>
                      • {art.cantidad}x {art.producto_nombre} ({formatCurrency(art.precio_unitario_actual)} c/u)
                    </span>
                    <span className="text-slate-300 font-medium">
                      {formatCurrency(art.subtotal_actual)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2.5 border-t border-slate-700 flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-200">
              Total Final Ficha {labelMesCierre}:
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-rose-400">
              {formatCurrency(totalConsolidado)}
            </span>
          </div>
        </div>

        {/* Explicación clara */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs text-slate-300 space-y-1.5 mb-4">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <p>
                • Todos los productos anotados en <strong className="text-white">{labelMesCierre}</strong> se suman ahora al precio vigente, dejando el total de la ficha en{' '}
                <strong className="text-white">{formatCurrency(totalConsolidado)}</strong>.
              </p>
              {esCierreDeMesActual && (
                <p>
                  • Se abre la nueva ficha <strong className="text-emerald-300">{labelMesNuevo}</strong> desde <strong className="text-white">$0,00</strong> de forma separada para los próximos fiados.
                </p>
              )}
              <p>
                • Cuando el cliente abone <strong className="text-white">{labelMesCierre}</strong>, podés entrar a su pestaña y tocar <strong className="text-emerald-400">Cobrar</strong> para cargarle el pago en ese mes.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleConfirmarCierre}>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs sm:text-sm transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-2/3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-950/50 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CalendarCheck className="w-4 h-4 shrink-0" />
              <span>
                {loading
                  ? 'Procesando cierre...'
                  : esCierreDeMesActual
                  ? `Cerrar y Liquidar ${labelMesCierre}`
                  : `Sumar al Cierre de ${labelMesCierre}`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
