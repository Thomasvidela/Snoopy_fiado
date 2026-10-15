import React, { useState, useEffect } from 'react';
import { Edit3, X, Phone, User, Tag, AlertCircle, Check, UserCheck, UserX } from 'lucide-react';
import { Cliente } from '../types';
import { api } from '../api/client';
import { normalizeArgentinePhone } from '../utils/format';
import { hapticSuccess, hapticError, hapticTap } from '../utils/haptics';

interface EditClientModalProps {
  isOpen: boolean;
  cliente: Cliente | null;
  onClose: () => void;
  onSuccess: (clienteActualizado: Cliente) => void;
}

export const EditClientModal: React.FC<EditClientModalProps> = ({
  isOpen,
  cliente,
  onClose,
  onSuccess,
}) => {
  const [nombre, setNombre] = useState<string>('');
  const [apodo, setApodo] = useState<string>('');
  const [telefono, setTelefono] = useState<string>('');
  const [activo, setActivo] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cliente && isOpen) {
      setNombre(cliente.nombre);
      setApodo(cliente.apodo || '');
      setTelefono(cliente.telefono ? normalizeArgentinePhone(cliente.telefono) : '+54 9 ');
      setActivo(cliente.activo);
      setError(null);
    }
  }, [cliente, isOpen]);

  if (!isOpen || !cliente) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre del cliente es obligatorio.');
      hapticError();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Normalizar número asegurando siempre formato +54 de Argentina
      const cleanInput = telefono.replace('+54 9 ', '').replace('+54', '').trim();
      const telNormalizado = cleanInput.length > 0 ? normalizeArgentinePhone(telefono.trim()) : '';

      const updated = await api.updateCliente(cliente.id, {
        nombre: nombre.trim(),
        apodo: apodo.trim() || undefined,
        telefono: telNormalizado || undefined,
        activo,
      });

      hapticSuccess();
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      hapticError();
      setError(err.message || 'Error al actualizar los datos del cliente');
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
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Editar Cliente</h2>
            <p className="text-xs text-slate-400">Modificar datos o estado de la cuenta</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Nombre y Apellido <span className="text-emerald-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Juan Pérez"
                className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Apodo */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Apodo / Familia <span className="text-slate-500 text-[10px]">(Opcional)</span>
            </label>
            <div className="relative">
              <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={apodo}
                onChange={(e) => setApodo(e.target.value)}
                placeholder="Ej: El Ruso, Vecino de la esquina"
                className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              WhatsApp / Teléfono Móvil
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+54 9 11 ..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Estado de la cuenta (Habilitado / Inhabilitado) */}
          <div className="pt-1">
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Estado de la Cuenta Corriente
            </label>
            <button
              type="button"
              onClick={() => {
                hapticTap(20);
                setActivo(!activo);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition ${
                activo
                  ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-600/40 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {activo ? (
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                ) : (
                  <UserX className="w-5 h-5 text-rose-400" />
                )}
                <div className="text-left">
                  <span className="font-semibold text-xs block">
                    {activo ? 'Cliente Habilitado' : 'Cliente Inhabilitado / Pausado'}
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {activo
                      ? 'Puede comprar fiado y registrar pagos'
                      : 'Bloqueado para nuevos fiados o pagos'}
                  </span>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                  activo
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium shadow transition disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
