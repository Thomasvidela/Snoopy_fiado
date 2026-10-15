import React, { useState, useEffect, useRef } from 'react';
import { PlusCircle, CheckCircle2, X, AlertCircle } from 'lucide-react';
import { Cliente, MovimientoCreatePayload } from '../types';
import { formatCurrency } from '../utils/format';

interface MovementModalProps {
  isOpen: boolean;
  cliente: Cliente | null;
  defaultTipo?: 'CARGO' | 'PAGO';
  onClose: () => void;
  onSubmit: (payload: MovimientoCreatePayload) => Promise<void>;
}

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000];
const PRESET_NOTES_CARGO = ['Pan y leche', 'Gaseosas / Bebidas', 'Fiambres', 'Almacén', 'Limpieza', 'Varios'];
const PRESET_NOTES_PAGO = ['Efectivo', 'Transferencia', 'Pago total', 'Entrega a cuenta'];

export const MovementModal: React.FC<MovementModalProps> = ({
  isOpen,
  cliente,
  defaultTipo = 'CARGO',
  onClose,
  onSubmit,
}) => {
  const [tipo, setTipo] = useState<'CARGO' | 'PAGO'>(defaultTipo);
  const [monto, setMonto] = useState<string>('');
  const [nota, setNota] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTipo(defaultTipo);
      setMonto('');
      setNota('');
      setError(null);
      // Auto focus on open for fast counter entry
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, defaultTipo]);

  if (!isOpen || !cliente) return null;

  const handleAddPreset = (val: number) => {
    const current = parseFloat(monto || '0');
    setMonto((current + val).toString());
    setError(null);
  };


  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedMonto = parseFloat(monto);
    if (isNaN(parsedMonto) || parsedMonto <= 0) {
      setError('Ingrese un monto válido mayor a 0');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        tipo,
        monto: parsedMonto.toFixed(2),
        nota: nota.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al asentar el movimiento');
    } finally {
      setLoading(false);
    }
  };

  const isCargo = tipo === 'CARGO';
  const saldoActual = parseFloat(cliente.saldo_actual);
  const parsedMonto = parseFloat(monto || '0');
  const nuevoSaldoEstimado = isCargo
    ? saldoActual + (isNaN(parsedMonto) ? 0 : parsedMonto)
    : saldoActual - (isNaN(parsedMonto) ? 0 : parsedMonto);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with Client Info */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">
              {cliente.nombre}
            </h2>
            {cliente.apodo && (
              <span className="text-xs text-amber-400 font-medium">"{cliente.apodo}"</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Saldo actual: <span className="font-semibold text-white">{formatCurrency(cliente.saldo_actual)}</span>
          </p>
        </div>

        {/* Type Toggle: CARGO vs PAGO */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-xl mb-4 border border-slate-700/60">
          <button
            type="button"
            onClick={() => setTipo('CARGO')}
            className={`py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition ${
              isCargo
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            + FIADO (Cargo)
          </button>
          <button
            type="button"
            onClick={() => setTipo('PAGO')}
            className={`py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition ${
              !isCargo
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            COBRAR (Pago)
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* Main Amount Input */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              Monto en pesos (ARS)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">
                $
              </span>
              <input
                ref={inputRef}
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={monto}
                onChange={(e) => {
                  setMonto(e.target.value);
                  setError(null);
                }}
                className={`w-full pl-9 pr-4 py-3 bg-slate-900 border text-2xl font-bold rounded-xl focus:outline-none transition ${
                  isCargo
                    ? 'border-rose-500/50 text-rose-300 focus:border-rose-400 focus:ring-1 focus:ring-rose-400'
                    : 'border-emerald-500/50 text-emerald-300 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400'
                }`}
              />
            </div>
          </div>

          {/* Quick Preset Buttons (Regla de los 3 toques) */}
          <div>
            <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
              Valores rápidos (+ sumar):
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESET_AMOUNTS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAddPreset(val)}
                  className="py-1.5 px-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/60 rounded-lg text-xs font-bold text-slate-200 active:scale-95 transition"
                >
                  +{formatCurrency(val)}
                </button>
              ))}
            </div>
          </div>

          {/* Note Input & Preset Chips */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              Nota / Detalle (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Pan, gaseosa, yerba..."
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(isCargo ? PRESET_NOTES_CARGO : PRESET_NOTES_PAGO).map((pNote) => (
                <button
                  key={pNote}
                  type="button"
                  onClick={() => setNota(pNote)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                    nota === pNote
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {pNote}
                </button>
              ))}
            </div>
          </div>

          {/* Estimated resulting balance preview */}
          {parsedMonto > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/50 flex items-center justify-between text-xs">
              <span className="text-slate-400">Nuevo saldo estimado:</span>
              <span className={`font-bold ${nuevoSaldoEstimado > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {formatCurrency(nuevoSaldoEstimado)}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Big Action Button */}
          <button
            type="submit"
            disabled={loading || !monto || parseFloat(monto) <= 0}
            className={`w-full py-3.5 rounded-xl font-bold text-base text-white shadow-lg transition active:scale-98 flex items-center justify-center gap-2 disabled:opacity-50 ${
              isCargo
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/40'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
            }`}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isCargo ? (
              <>
                <PlusCircle className="w-5 h-5" />
                Asentar Fiado ({formatCurrency(parsedMonto || 0)})
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Registrar Cobro ({formatCurrency(parsedMonto || 0)})
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
