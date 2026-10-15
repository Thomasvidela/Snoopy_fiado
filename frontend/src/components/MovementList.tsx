import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  AlertTriangle,
  Calendar,
  User,
} from 'lucide-react';
import { Movimiento } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

interface MovementListProps {
  movimientos: Movimiento[];
  loading: boolean;
  onAnular: (movimientoId: number) => Promise<void>;
}

export const MovementList: React.FC<MovementListProps> = ({
  movimientos,
  loading,
  onAnular,
}) => {
  const [selectedToAnul, setSelectedToAnul] = useState<Movimiento | null>(null);
  const [anulando, setAnulando] = useState<boolean>(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  const confirmAnular = async () => {
    if (!selectedToAnul) return;
    setAnulando(true);
    setErrorAnular(null);
    try {
      await onAnular(selectedToAnul.id);
      setSelectedToAnul(null);
    } catch (err: any) {
      setErrorAnular(err.message || 'Error al anular movimiento');
    } finally {
      setAnulando(false);
    }
  };

  if (loading && movimientos.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
        Cargando historial de movimientos...
      </div>
    );
  }

  if (movimientos.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm bg-slate-900/40 rounded-xl border border-slate-800/80 m-3">
        No hay movimientos registrados para este cliente.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* List of Movements */}
      <div className="divide-y divide-slate-800 border-t border-b border-slate-800">
        {movimientos.map((m) => {
          const isCargo = m.tipo === 'CARGO';
          const isPago = m.tipo === 'PAGO';
          const isContraCargo = m.tipo === 'ANULACION_CARGO';
          const isContraPago = m.tipo === 'ANULACION_PAGO';
          const isContraAsiento = isContraCargo || isContraPago;

          return (
            <div
              key={m.id}
              className={`p-3.5 sm:p-4 transition flex items-start justify-between gap-3 ${
                m.anulado
                  ? 'bg-slate-900/30 opacity-60'
                  : isContraAsiento
                  ? 'bg-amber-950/10'
                  : 'hover:bg-slate-800/40'
              }`}
            >
              {/* Type Icon & Details */}
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    m.anulado
                      ? 'bg-slate-800 text-slate-500'
                      : isCargo
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      : isPago
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {isCargo ? (
                    <ArrowUpRight className="w-5 h-5" />
                  ) : isPago ? (
                    <ArrowDownLeft className="w-5 h-5" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-white">
                      {isCargo
                        ? 'Compra Fiada'
                        : isPago
                        ? 'Pago Recibido'
                        : isContraCargo
                        ? 'Contra-asiento (Anulación Cargo)'
                        : 'Contra-asiento (Anulación Pago)'}
                    </span>

                    {m.anulado && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                        ANULADO
                      </span>
                    )}

                    {isContraAsiento && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Reversión
                      </span>
                    )}
                  </div>

                  {/* Note / Description */}
                  {m.nota && (
                    <p
                      className={`text-xs mt-0.5 truncate ${
                        m.anulado ? 'line-through text-slate-500' : 'text-slate-300'
                      }`}
                    >
                      {m.nota}
                    </p>
                  )}

                  {/* Metadata: Operator & Date */}
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {formatDate(m.fecha_creacion)}
                    </span>
                    {m.operador_nombre && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-500" />
                        {m.operador_nombre}
                      </span>
                    )}
                    {m.anulado && m.anulado_por_nombre && (
                      <span className="text-red-400">
                        (Anulado por {m.anulado_por_nombre})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Amount, Resulting Balance & Action */}
              <div className="text-right shrink-0">
                <div
                  className={`text-sm sm:text-base font-bold tracking-tight ${
                    m.anulado
                      ? 'line-through text-slate-500'
                      : isCargo || isContraPago
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {isCargo || isContraPago ? '+' : '-'}
                  {formatCurrency(m.monto)}
                </div>

                <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Saldo: <span className="text-slate-200">{formatCurrency(m.saldo_resultante)}</span>
                </div>

                {/* Anular button (only for non-annulled original CARGO or PAGO) */}
                {!m.anulado && !isContraAsiento && (
                  <button
                    onClick={() => setSelectedToAnul(m)}
                    className="text-[11px] text-slate-400 hover:text-rose-400 hover:underline mt-1 inline-flex items-center gap-1 transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Anular
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Confirmación Anulación */}
      {selectedToAnul && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-center font-bold text-base text-white">
              ¿Anular este movimiento?
            </h3>
            <p className="text-center text-xs text-slate-300 mt-1.5 leading-relaxed">
              Se marcará como anulado y se creará atómicamente un contra-asiento por{' '}
              <strong className="text-white">{formatCurrency(selectedToAnul.monto)}</strong> para
              revertir el saldo.
            </p>

            {errorAnular && (
              <div className="p-2.5 mt-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                {errorAnular}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-5">
              <button
                type="button"
                onClick={() => setSelectedToAnul(null)}
                disabled={anulando}
                className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAnular}
                disabled={anulando}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-rose-950/50"
              >
                {anulando ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Confirmar Anulación
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
