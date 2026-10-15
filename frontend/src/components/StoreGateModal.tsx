import React, { useState } from 'react';
import { ShieldCheck, Lock, Eye, EyeOff, AlertCircle, Store } from 'lucide-react';
import { api, storeAuth } from '../api/client';
import { hapticSuccess, hapticError, hapticTap } from '../utils/haptics';

interface StoreGateModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export const StoreGateModal: React.FC<StoreGateModalProps> = ({ isOpen, onSuccess }) => {
  const [clave, setClave] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clave.trim()) {
      setError('Por favor ingrese la clave del comercio');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.verificarClaveLocal(clave.trim());
      storeAuth.setStoreKey(clave.trim());
      hapticSuccess();
      onSuccess();
    } catch (err: any) {
      hapticError();
      setError(err.message || 'Clave del comercio incorrecta');
      setClave('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-800 border border-slate-700/80 rounded-2xl w-full max-w-sm p-6 sm:p-7 shadow-2xl relative text-center">
        {/* Brand Icon Header */}
        <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-950/50">
          <Store className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-bold text-white tracking-tight">
          Despensa Snoopy
        </h2>
        <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider mt-0.5">
          Libreta de Fiados & Cuentas Corrientes
        </p>

        <div className="my-5 p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-left flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            <strong className="text-white">Dispositivo no registrado:</strong> Ingrese la clave del comercio para habilitar este celular una única vez.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative text-left">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Clave del Local
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Ingrese la clave..."
                autoFocus
                autoComplete="off"
                className="w-full px-3.5 py-3 pr-10 rounded-xl bg-slate-900 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white placeholder-slate-500 text-sm outline-none transition"
              />
              <button
                type="button"
                onClick={() => {
                  hapticTap(15);
                  setShowPassword(!showPassword);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm transition shadow-md shadow-emerald-900/30 flex items-center justify-center gap-2 active:scale-98"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{loading ? 'Verificando...' : 'Habilitar Dispositivo'}</span>
          </button>
        </form>

        <p className="text-[11px] text-slate-500 mt-4">
          Una vez habilitado, este teléfono recordará el permiso de forma permanente.
        </p>
      </div>
    </div>
  );
};
