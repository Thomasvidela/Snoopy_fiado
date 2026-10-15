import React, { useState } from 'react';
import { UserPlus, X, Phone, User, Tag, BookOpen, AlertCircle } from 'lucide-react';
import { Cliente, ClienteCreatePayload } from '../types';
import { api } from '../api/client';

import { normalizeArgentinePhone } from '../utils/format';

interface NewClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (cliente: Cliente) => void;
}

export const NewClientModal: React.FC<NewClientModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [nombre, setNombre] = useState<string>('');
  const [apodo, setApodo] = useState<string>('');
  const [telefono, setTelefono] = useState<string>('+54 9 ');
  const [saldoInicial, setSaldoInicial] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre del cliente es obligatorio.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Normalizar número asegurando siempre formato +54 de Argentina
      const cleanInput = telefono.replace('+54 9 ', '').replace('+54', '').trim();
      const telNormalizado = cleanInput.length > 0 ? normalizeArgentinePhone(telefono.trim()) : undefined;

      const payload: ClienteCreatePayload = {
        nombre: nombre.trim(),
        apodo: apodo.trim() || undefined,
        telefono: telNormalizado,
        saldo_inicial: saldoInicial && parseFloat(saldoInicial) > 0 ? parseFloat(saldoInicial).toFixed(2) : '0.00',
      };

      const nuevoCliente = await api.createCliente(payload);
      onSuccess(nuevoCliente);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al registrar cliente');
    } finally {
      setLoading(false);
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

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Nuevo Cliente</h2>
            <p className="text-xs text-slate-400">Dar de alta cuenta corriente</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Nombre */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Nombre Completo *
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                required
                autoFocus
                placeholder="Ej: Juan Carlos Gómez"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
          </div>

          {/* Apodo / Alias */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Apodo o Referencia (Opcional)
            </label>
            <div className="relative">
              <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Ej: Don Juan, El Mecánico, Vecino del frente"
                value={apodo}
                onChange={(e) => setApodo(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
          </div>

          {/* Teléfono */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Teléfono Celular WhatsApp (+54)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="tel"
                placeholder="Ej: +54 9 11 2345-6789"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition font-mono"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              🇦🇷 Prefijo Argentina: +54 9 (ej: +54 9 11 2345-6789)
            </span>
          </div>

          {/* Saldo Inicial (Migración de papel) */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-1.5 text-amber-400 font-semibold text-xs">
              <BookOpen className="w-4 h-4" />
              <span>Migración desde Fichero de Papel</span>
            </div>
            <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
              Si el cliente ya tenía deuda anotada en la libreta física, ingrésela aquí. Se creará automáticamente el movimiento de saldo inicial.
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-amber-400">
                $
              </span>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-900/90 border border-amber-500/40 rounded-lg text-sm font-semibold text-amber-200 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/40"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Guardar Cliente'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
