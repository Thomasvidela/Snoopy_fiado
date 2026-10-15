import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Shield,
  ShieldCheck,
  X,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Operador, OperadorCreatePayload } from '../types';
import { api } from '../api/client';

interface ManageOperatorsModalProps {
  isOpen: boolean;
  currentOperator: Operador | null;
  onClose: () => void;
  onOperatorsChanged: () => void;
}

export const ManageOperatorsModal: React.FC<ManageOperatorsModalProps> = ({
  isOpen,
  currentOperator,
  onClose,
  onOperatorsChanged,
}) => {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form nuevo operador
  const [nombre, setNombre] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [esAdmin, setEsAdmin] = useState<boolean>(false);
  const [creando, setCreando] = useState<boolean>(false);

  // Operador a eliminar
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      cargarOperadores();
      setNombre('');
      setPin('');
      setEsAdmin(false);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const cargarOperadores = async () => {
    setLoading(true);
    try {
      const data = await api.getOperadores(true); // incluir inactivos
      setOperadores(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar operadores');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleCrearOperador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre del operador es requerido.');
      return;
    }
    if (pin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos numéricos.');
      return;
    }

    setCreando(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: OperadorCreatePayload = {
        nombre: nombre.trim(),
        pin: pin.trim(),
        es_admin: esAdmin,
      };
      const nuevo = await api.createOperador(payload);
      setSuccess(`Operador '${nuevo.nombre}' creado con éxito.`);
      setNombre('');
      setPin('');
      setEsAdmin(false);
      cargarOperadores();
      onOperatorsChanged();
    } catch (err: any) {
      setError(err.message || 'Error al crear operador');
    } finally {
      setCreando(false);
    }
  };

  const handleEliminarOperador = async (op: Operador) => {
    if (op.id === currentOperator?.id) {
      alert('No puedes eliminar tu propio usuario en sesión activa.');
      return;
    }

    const confirmar = window.confirm(
      `¿Desea eliminar al operador '${op.nombre}'?\n\nSi tiene ventas o movimientos registrados en el libro mayor, se deshabilitará para no alterar el historial contable.`
    );
    if (!confirmar) return;

    setDeletingId(op.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.deleteOperador(op.id);
      setSuccess(res.mensaje);
      cargarOperadores();
      onOperatorsChanged();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar operador');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl relative flex flex-col max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Gestión de Operadores</h2>
            <p className="text-xs text-slate-400">Crear, habilitar o eliminar operadores del comercio</p>
          </div>
        </div>

        {error && (
          <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-2.5 mb-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Formulario Nuevo Operador */}
          <form
            onSubmit={handleCrearOperador}
            className="p-3.5 bg-slate-900/80 border border-slate-700/80 rounded-xl space-y-3"
          >
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
              Nuevo Operador
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Mamá, Juan, Empleado"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  PIN (4 dígitos) *
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    maxLength={10}
                    placeholder="••••"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={esAdmin}
                  onChange={(e) => setEsAdmin(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  Es Administrador
                </span>
              </label>

              <button
                type="submit"
                disabled={creando}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                {creando ? 'Creando...' : 'Guardar Operador'}
              </button>
            </div>
          </form>

          {/* Listado de Operadores Existentes */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Operadores Registrados ({operadores.length})
            </h3>

            <div className="space-y-2">
              {loading && operadores.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">Cargando...</div>
              ) : (
                operadores.map((op) => {
                  const isCurrent = op.id === currentOperator?.id;
                  return (
                    <div
                      key={op.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        !op.activo
                          ? 'bg-slate-900/30 border-slate-800 opacity-60'
                          : 'bg-slate-900/60 border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-600/30 text-emerald-400 font-bold text-xs flex items-center justify-center border border-emerald-500/30">
                          {op.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white text-xs">{op.nombre}</span>
                            {op.es_admin && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                                <Shield className="w-2.5 h-2.5" />
                                Admin
                              </span>
                            )}
                            {isCurrent && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300">
                                Tu sesión
                              </span>
                            )}
                            {!op.activo && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-400">
                                Inactivo
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            ID: #{op.id} • PIN protegido con bcrypt
                          </span>
                        </div>
                      </div>

                      {/* Botón Eliminar */}
                      <div>
                        {isCurrent ? (
                          <span className="text-[10px] text-slate-500 italic pr-1">En uso</span>
                        ) : (
                          <button
                            onClick={() => handleEliminarOperador(op)}
                            disabled={deletingId === op.id}
                            title="Eliminar o deshabilitar operador"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="pt-3 mt-3 border-t border-slate-700/60 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
