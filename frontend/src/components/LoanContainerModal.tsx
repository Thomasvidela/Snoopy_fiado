import React, { useState, useEffect } from 'react';
import { RefreshCcw, X, AlertCircle, Plus, Minus, Tag } from 'lucide-react';
import { Cliente, PrestamoEnvase } from '../types';
import { api } from '../api/client';
import { hapticTap, hapticSuccess, hapticError } from '../utils/haptics';

interface LoanContainerModalProps {
  isOpen: boolean;
  cliente: Cliente | null;
  onClose: () => void;
  onSuccess: (prestamo: PrestamoEnvase) => void;
}

const ENVASES_FRECUENTES = [
  { label: 'Envase Garrafa 10kg', icon: '🔥' },
  { label: 'Envase Garrafa 15kg', icon: '🔥' },
  { label: 'Envase Cerveza 1L', icon: '🍺' },
  { label: 'Envase Gaseosa Retornable', icon: '🥤' },
  { label: 'Bidón de Agua 20L', icon: '💧' },
  { label: 'Cajón con Envases', icon: '📦' },
];

export const LoanContainerModal: React.FC<LoanContainerModalProps> = ({
  isOpen,
  cliente,
  onClose,
  onSuccess,
}) => {
  const [descripcion, setDescripcion] = useState<string>(ENVASES_FRECUENTES[0].label);
  const [modoPersonalizado, setModoPersonalizado] = useState<boolean>(false);
  const [cantidad, setCantidad] = useState<number>(1);
  const [nota, setNota] = useState<string>('');
  const [guardando, setGuardando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDescripcion(ENVASES_FRECUENTES[0].label);
      setModoPersonalizado(false);
      setCantidad(1);
      setNota('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !cliente) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcion.trim()) {
      setError('Seleccioná o escribí qué envase se le presta al cliente.');
      return;
    }
    if (cantidad < 1) {
      setError('La cantidad debe ser al menos 1.');
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const created = await api.createClienteEnvase(cliente.id, {
        descripcion: descripcion.trim(),
        cantidad,
        nota: nota.trim() || undefined,
      });
      hapticSuccess();
      onClose();
      onSuccess(created);
    } catch (err: any) {
      hapticError();
      setError(err.message || 'Error al registrar el préstamo de envase');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pr-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
            <RefreshCcw className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Prestar Envase Retornable</h2>
            <p className="text-xs text-slate-400">
              Cliente: <strong className="text-white">{cliente.nombre}</strong>
              {cliente.apodo && (
                <span className="text-amber-400 ml-1.5 font-semibold">"{cliente.apodo}"</span>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Opciones rápidas de 1 toque */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              ¿Qué envase le prestás?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ENVASES_FRECUENTES.map((item) => {
                const isSelected = !modoPersonalizado && descripcion === item.label;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      hapticTap(15);
                      setModoPersonalizado(false);
                      setDescripcion(item.label);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-500 text-white shadow-sm'
                        : 'bg-slate-850 hover:bg-slate-700/60 border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className="font-semibold text-xs leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-2">
              {!modoPersonalizado ? (
                <button
                  type="button"
                  onClick={() => {
                    hapticTap(10);
                    setModoPersonalizado(true);
                    setDescripcion('');
                  }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline"
                >
                  + Escribir otro tipo de envase...
                </button>
              ) : (
                <input
                  type="text"
                  autoFocus
                  placeholder="Ej: Envase de Sidra, Cajón plástico, etc."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-cyan-500 rounded-xl text-white text-sm focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Cantidad de envases prestados
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  hapticTap(15);
                  if (cantidad > 1) setCantidad(cantidad - 1);
                }}
                disabled={cantidad <= 1}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white flex items-center justify-center font-bold text-lg transition"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="flex-1 py-2 rounded-xl bg-slate-900 border border-slate-700 text-center font-mono font-extrabold text-xl text-white">
                {cantidad}
              </div>

              <button
                type="button"
                onClick={() => {
                  hapticTap(15);
                  setCantidad(cantidad + 1);
                }}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center font-bold text-lg transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Nota Opcional */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Nota / Detalle <span className="text-slate-500 text-[10px]">(Opcional)</span>
            </label>
            <div className="relative">
              <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ej: Garrafa color amarillo, dijo que lo trae hoy a la tarde"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Explicación */}
          <div className="p-3 rounded-xl bg-slate-850/80 border border-slate-700/60 text-slate-300 text-[11px] leading-relaxed">
            🍾 <strong>Control de Envases Vacíos:</strong> Quedará marcado con un aviso visible en la
            ficha del cliente y en el resumen de WhatsApp hasta que devuelva el envase y toques{' '}
            <strong className="text-emerald-400">✅ Devolvió</strong>.
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || !descripcion.trim()}
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-950/40 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {guardando ? 'Anotando...' : `Anotar ${cantidad} Envase(s)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
