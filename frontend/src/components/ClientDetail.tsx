import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Phone,
  PlusCircle,
  CheckCircle2,
  Calendar,
  Tag,
  MessageCircle,
  FileSpreadsheet,
  UserX,
  UserCheck,
  AlertTriangle,
  MoreVertical,
  Edit3,
} from 'lucide-react';
import { Cliente, Movimiento } from '../types';
import { MovementList } from './MovementList';
import { EditClientModal } from './EditClientModal';
import { formatCurrency, normalizeArgentinePhone, getWhatsAppCleanNumber } from '../utils/format';
import { hapticTap } from '../utils/haptics';
import { api } from '../api/client';

interface ClientDetailProps {
  cliente: Cliente | null;
  movimientos: Movimiento[];
  loadingMovimientos: boolean;
  onBack?: () => void;
  onOpenMovementModal: (tipo: 'CARGO' | 'PAGO') => void;
  onOpenWhatsAppModal: () => void;
  onAnularMovimiento: (movimientoId: number) => Promise<void>;
  onToggleActivo?: (clienteId: number) => Promise<void>;
  onUpdateCliente?: (clienteActualizado: Cliente) => void;
}

export const ClientDetail: React.FC<ClientDetailProps> = ({
  cliente,
  movimientos,
  loadingMovimientos,
  onBack,
  onOpenMovementModal,
  onOpenWhatsAppModal,
  onAnularMovimiento,
  onToggleActivo,
  onUpdateCliente,
}) => {
  const [exportandoExcel, setExportandoExcel] = useState<boolean>(false);
  const [togglingActivo, setTogglingActivo] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleExportarExcel = async () => {
    if (!cliente) return;
    setExportandoExcel(true);
    try {
      await api.exportarExcel(cliente.id, undefined, cliente.nombre);
    } catch (err: any) {
      alert(err.message || 'Error al exportar Excel');
    } finally {
      setExportandoExcel(false);
    }
  };

  const handleToggleActivo = async () => {
    if (!cliente || !onToggleActivo) return;
    const accion = cliente.activo ? 'deshabilitar' : 'reactivar';
    const confirmMsg = cliente.activo
      ? `¿Está seguro de que desea deshabilitar a ${cliente.nombre}? No se podrán asentar nuevos fiados ni pagos hasta que sea reactivado.`
      : `¿Desea reactivar a ${cliente.nombre} para permitir registrar nuevos fiados y pagos?`;

    if (!window.confirm(confirmMsg)) return;

    setTogglingActivo(true);
    try {
      await onToggleActivo(cliente.id);
    } catch (err: any) {
      alert(err.message || `Error al ${accion} cliente`);
    } finally {
      setTogglingActivo(false);
    }
  };

  if (!cliente) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mb-3 border border-slate-700">
          <Tag className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">Ningún cliente seleccionado</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          Seleccione un cliente de la lista para ver su cuenta corriente o asentar compras fiadas.
        </p>
      </div>
    );
  }

  const saldoNum = parseFloat(cliente.saldo_actual);
  const hasDebt = saldoNum > 0;
  const isCredit = saldoNum < 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-y-auto">
      {/* Client Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-850/60 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="md:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {cliente.nombre}
                </h2>
                {cliente.apodo && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    {cliente.apodo}
                  </span>
                )}
                {!cliente.activo && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                    <UserX className="w-3 h-3" />
                    Inhabilitado
                  </span>
                )}
              </div>

              {cliente.telefono && (
                <div className="flex items-center gap-2 mt-0.5">
                  <a
                    href={`tel:${cliente.telefono}`}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition font-mono"
                    title="Llamar"
                  >
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    <span>{normalizeArgentinePhone(cliente.telefono)}</span>
                  </a>
                  <a
                    href={`https://wa.me/${getWhatsAppCleanNumber(cliente.telefono)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 transition p-0.5"
                    title="Abrir chat de WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Quick WhatsApp Summary Button */}
            <button
              onClick={onOpenWhatsAppModal}
              title="Enviar resumen mensual por WhatsApp"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition active:scale-95"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>

            {/* Three Dots Menu Button (⋮) */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => {
                  hapticTap(15);
                  setMenuOpen(!menuOpen);
                }}
                title="Opciones del cliente"
                className={`p-2 rounded-xl border text-slate-300 hover:text-white transition active:scale-95 ${
                  menuOpen
                    ? 'bg-slate-700 border-emerald-500/50 text-white shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700/80'
                }`}
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl py-1.5 z-30 animate-in fade-in zoom-in-95">
                  {/* Opción 1: Editar datos */}
                  <button
                    onClick={() => {
                      hapticTap(15);
                      setMenuOpen(false);
                      setEditModalOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-200 hover:bg-slate-700/80 hover:text-white flex items-center gap-2.5 transition"
                  >
                    <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Editar datos del cliente</span>
                  </button>

                  {/* Opción 2: Habilitar / Deshabilitar */}
                  {onToggleActivo && (
                    <button
                      onClick={() => {
                        hapticTap(15);
                        setMenuOpen(false);
                        handleToggleActivo();
                      }}
                      disabled={togglingActivo}
                      className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-200 hover:bg-slate-700/80 hover:text-white flex items-center gap-2.5 transition disabled:opacity-50"
                    >
                      {cliente.activo ? (
                        <>
                          <UserX className="w-4 h-4 text-rose-400 shrink-0" />
                          <span className="text-rose-300">Deshabilitar cuenta</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-emerald-300">Reactivar cuenta</span>
                        </>
                      )}
                    </button>
                  )}

                  <div className="my-1 border-t border-slate-700/60" />

                  {/* Opción 3: Exportar Excel */}
                  <button
                    onClick={() => {
                      hapticTap(15);
                      setMenuOpen(false);
                      handleExportarExcel();
                    }}
                    disabled={exportandoExcel}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-200 hover:bg-slate-700/80 hover:text-white flex items-center gap-2.5 transition disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Descargar Excel (.xlsx)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Saldo Hero Card */}
        <div
          className={`p-4 rounded-2xl border transition shadow-lg ${
            hasDebt
              ? 'bg-gradient-to-br from-rose-950/40 via-rose-900/20 to-slate-900 border-rose-500/30'
              : isCredit
              ? 'bg-gradient-to-br from-cyan-950/40 via-cyan-900/20 to-slate-900 border-cyan-500/30'
              : 'bg-gradient-to-br from-emerald-950/40 via-emerald-900/20 to-slate-900 border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {hasDebt ? 'Saldo Deudor Actual' : isCredit ? 'Saldo a Favor' : 'Estado de Cuenta'}
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                hasDebt
                  ? 'bg-rose-500/20 text-rose-300'
                  : isCredit
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {hasDebt ? 'DEBE' : isCredit ? 'A FAVOR' : 'AL DÍA'}
            </span>
          </div>

          <div
            className={`text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 ${
              hasDebt ? 'text-rose-400' : isCredit ? 'text-cyan-400' : 'text-emerald-400'
            }`}
          >
            {formatCurrency(cliente.saldo_actual)}
          </div>
        </div>

        {/* Inactive Client Warning Banner */}
        {!cliente.activo && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Cliente inhabilitado:</strong> No se pueden asentar nuevos fiados ni pagos hasta que la cuenta sea reactivada.
            </span>
          </div>
        )}

        {/* Action Buttons: The 3-Touch counter buttons */}
        <div className="grid grid-cols-2 gap-2.5 mt-3.5">
          <button
            onClick={() => onOpenMovementModal('CARGO')}
            disabled={!cliente.activo}
            title={!cliente.activo ? "Cliente inhabilitado" : "Registrar nuevo fiado"}
            className={`py-3 px-3 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 ${
              cliente.activo
                ? 'bg-rose-600 hover:bg-rose-500 active:scale-95 text-white shadow-rose-950/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <PlusCircle className="w-5 h-5" />
            + Fiado (Cargo)
          </button>
          <button
            onClick={() => onOpenMovementModal('PAGO')}
            disabled={!cliente.activo}
            title={!cliente.activo ? "Cliente inhabilitado" : "Registrar cobro"}
            className={`py-3 px-3 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 ${
              cliente.activo
                ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-emerald-950/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            Cobrar (Pago)
          </button>
        </div>
      </div>

      {/* Movements History Section */}
      <div className="p-3 sm:p-5 flex-1">
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-500" />
            Libro Mayor Inmutable ({movimientos.length})
          </h3>
          <span className="text-[11px] text-slate-500">Orden cronológico inverso</span>
        </div>

        <MovementList
          movimientos={movimientos}
          loading={loadingMovimientos}
          onAnular={onAnularMovimiento}
        />
      </div>

      {/* Modal para editar datos del cliente */}
      <EditClientModal
        isOpen={editModalOpen}
        cliente={cliente}
        onClose={() => setEditModalOpen(false)}
        onSuccess={(updated) => {
          if (onUpdateCliente) {
            onUpdateCliente(updated);
          }
        }}
      />
    </div>
  );
};
