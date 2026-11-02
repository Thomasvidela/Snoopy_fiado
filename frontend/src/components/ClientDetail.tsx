import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Phone,
  PlusCircle,
  CheckCircle2,
  Calendar,
  MessageCircle,
  FileSpreadsheet,
  UserX,
  UserCheck,
  AlertTriangle,
  MoreVertical,
  Edit3,
  Package,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Calculator,
} from 'lucide-react';
import { Cliente, Movimiento, ClienteArticulo, MovimientoUpdatePayload } from '../types';
import { MovementList, getPeriodoLabel } from './MovementList';
import { EditClientModal } from './EditClientModal';
import { AddArticleModal } from './AddArticleModal';
import { CloseAccountModal } from './CloseAccountModal';
import { PostOperationInfo } from './PostOperationModal';
import { formatCurrency, normalizeArgentinePhone, getWhatsAppCleanNumber } from '../utils/format';
import { hapticTap, hapticSuccess, hapticError } from '../utils/haptics';
import { api } from '../api/client';

interface ClientDetailProps {
  cliente: Cliente | null;
  movimientos: Movimiento[];
  loadingMovimientos: boolean;
  onBack?: () => void;
  onCloseCliente?: () => void;
  onOpenMovementModal: (
    tipo: 'CARGO' | 'PAGO',
    periodo?: string,
    saldoFicha?: number
  ) => void;
  onOpenWhatsAppModal: (periodo?: string) => void;
  onAnularMovimiento: (movimientoId: number) => Promise<void>;
  onEditarMovimiento?: (
    movimientoId: number,
    payload: MovimientoUpdatePayload
  ) => Promise<void>;
  onToggleActivo?: (clienteId: number) => Promise<void>;
  onUpdateCliente?: (clienteActualizado: Cliente) => void;
  onRefreshClient?: () => Promise<void> | void;
  onOperationFinished?: (info: PostOperationInfo) => void;
  clientes?: Cliente[];
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSelectCliente?: (cliente: Cliente) => void;
}

export const ClientDetail: React.FC<ClientDetailProps> = ({
  cliente,
  movimientos,
  loadingMovimientos,
  onBack,
  onCloseCliente,
  onOpenMovementModal,
  onOpenWhatsAppModal,
  onAnularMovimiento,
  onEditarMovimiento,
  onToggleActivo,
  onUpdateCliente,
  onRefreshClient,
  onOperationFinished,
  clientes = [],
  searchQuery = '',
  onSearchChange,
  onSelectCliente,
}) => {
  const [exportandoExcel, setExportandoExcel] = useState<boolean>(false);
  const [togglingActivo, setTogglingActivo] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [addArticleModalOpen, setAddArticleModalOpen] = useState<boolean>(false);
  const [closeAccountModalOpen, setCloseAccountModalOpen] = useState<boolean>(false);
  const [articulos, setArticulos] = useState<ClienteArticulo[]>([]);
  const [mostrarHistorialArticulos, setMostrarHistorialArticulos] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentYearMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const defaultActivePeriod = useMemo(() => {
    if (cliente?.periodo_actual && cliente.periodo_actual > currentYearMonth) {
      return cliente.periodo_actual;
    }
    return currentYearMonth;
  }, [cliente?.periodo_actual, currentYearMonth]);

  const [selectedPeriodo, setSelectedPeriodo] = useState<string>(defaultActivePeriod);
  const [saldoFichaSeleccionada, setSaldoFichaSeleccionada] = useState<number>(0);

  useEffect(() => {
    setSelectedPeriodo(defaultActivePeriod);
  }, [cliente?.id, defaultActivePeriod]);

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
      await api.exportarExcel(cliente.id, selectedPeriodo, cliente.nombre);
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

  // Cargar articulos dinamicos del cliente
  const cargarArticulos = useCallback(async () => {
    if (!cliente) return;
    try {
      const data = await api.getClienteArticulos(cliente.id, false);
      setArticulos(data);
    } catch (err) {
      console.error('Error al cargar artículos del cliente:', err);
    }
  }, [cliente?.id]);

  useEffect(() => {
    if (cliente) {
      cargarArticulos();
    } else {
      setArticulos([]);
    }
  }, [cliente?.id, cargarArticulos]);

  if (!cliente) {
    const isSearching = searchQuery.trim().length > 0;
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 sm:p-10 text-center bg-slate-900 overflow-y-auto">
        <div className="w-full max-w-md bg-slate-800/70 border border-slate-700/80 rounded-2xl p-6 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 mx-auto mb-3 border border-emerald-500/30">
            <Search className="w-7 h-7" />
          </div>
          <h3 className="text-base sm:text-lg font-extrabold text-white">
            Paso 1: Buscar y seleccionar cliente
          </h3>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Por seguridad, primero busque al cliente por su{' '}
            <strong className="text-slate-200">nombre o apodo</strong> antes de registrar un
            fiado, garrafa o cobro.
          </p>

          {onSearchChange && (
            <div className="mt-4 relative text-left">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
              <input
                type="text"
                placeholder="Escriba el nombre o apodo del cliente..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-9 py-3 bg-slate-900 border border-emerald-500/60 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {isSearching && onSelectCliente && (
            <div className="mt-3 text-left max-h-60 overflow-y-auto divide-y divide-slate-700/60 rounded-xl border border-slate-700 bg-slate-900/90">
              {clientes.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No se encontraron clientes para "{searchQuery}"
                </div>
              ) : (
                clientes.slice(0, 8).map((c) => {
                  const s = parseFloat(c.saldo_actual);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        hapticTap(15);
                        onSelectCliente(c);
                      }}
                      className="w-full px-3.5 py-2.5 hover:bg-emerald-950/40 flex items-center justify-between gap-2 transition text-left"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-white block truncate">
                          {c.nombre}
                          {c.apodo && (
                            <span className="text-xs text-amber-400 font-medium ml-1.5">
                              "{c.apodo}"
                            </span>
                          )}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold shrink-0 ${
                          s > 0 ? 'text-rose-400' : s < 0 ? 'text-cyan-400' : 'text-emerald-400'
                        }`}
                      >
                        {formatCurrency(c.saldo_actual)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const articulosPendientes = articulos.filter((a) => a.estado === 'PENDIENTE');
  const articulosHistorial = articulos.filter((a) => a.estado !== 'PENDIENTE');

  // Artículos pendientes que pertenecen a la ficha actualmente seleccionada
  const articulosPendientesFicha = articulosPendientes.filter((a) => {
    const p =
      a.periodo ||
      (() => {
        const d = new Date(a.fecha_creacion);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })();
    return p === selectedPeriodo;
  });

  const totalArticulosFicha = articulosPendientesFicha.reduce(
    (acc, a) => acc + parseFloat(a.subtotal_actual),
    0
  );

  const saldoGeneral = parseFloat(cliente.saldo_actual);
  const labelFichaSeleccionada = getPeriodoLabel(selectedPeriodo);
  const esFichaAnterior = selectedPeriodo < defaultActivePeriod;

  const hasDebt = saldoFichaSeleccionada > 0.005;
  const isCredit = saldoFichaSeleccionada < -0.005;

  const handleCancelarArticuloById = async (articuloId: number) => {
    const art = articulos.find((x) => x.id === articuloId);
    const confirmMsg = `¿Quitar "${
      art?.producto_nombre || 'este producto'
    }" anotado? No se sumará al cierre de mes.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.cancelarClienteArticulo(articuloId);
      hapticSuccess();
      await cargarArticulos();
      if (onRefreshClient) await onRefreshClient();
    } catch (err: any) {
      hapticError();
      alert(err.message || 'Error al cancelar producto');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-y-auto">
      {/* Client Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-850/60 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            {(onCloseCliente || onBack) && (
              <button
                onClick={() => {
                  hapticTap(15);
                  if (onCloseCliente) {
                    onCloseCliente();
                  } else if (onBack) {
                    onBack();
                  }
                }}
                title="Cerrar ficha de este cliente y volver al buscador"
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-semibold transition active:scale-95 shrink-0"
              >
                <ArrowLeft className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Cambiar cliente</span>
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
            {/* Quick WhatsApp Summary Button (for selected month tab) */}
            <button
              onClick={() => onOpenWhatsAppModal(selectedPeriodo)}
              title={`Enviar resumen de ${labelFichaSeleccionada} por WhatsApp`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition active:scale-95"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">WhatsApp ({labelFichaSeleccionada.split(' ')[0]})</span>
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
                    <span>Descargar Excel ({labelFichaSeleccionada})</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Saldo Hero Card — Separado por la Ficha del Mes Seleccionada */}
        <div
          className={`p-4 rounded-2xl border transition shadow-lg ${
            hasDebt
              ? 'bg-gradient-to-br from-rose-950/40 via-rose-900/20 to-slate-900 border-rose-500/30'
              : isCredit
              ? 'bg-gradient-to-br from-cyan-950/40 via-cyan-900/20 to-slate-900 border-cyan-500/30'
              : 'bg-gradient-to-br from-emerald-950/40 via-emerald-900/20 to-slate-900 border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              Total Ficha {labelFichaSeleccionada}
              {esFichaAnterior && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  MES ANTERIOR SELECCIONADO
                </span>
              )}
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
              {hasDebt ? 'PENDIENTE EN ESTE MES' : isCredit ? 'A FAVOR EN ESTE MES' : 'FICHA EN $0,00'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap mt-1">
            <div
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                hasDebt ? 'text-rose-400' : isCredit ? 'text-cyan-400' : 'text-emerald-400'
              }`}
            >
              {formatCurrency(saldoFichaSeleccionada)}
            </div>

            {cliente.activo && (!esFichaAnterior || articulosPendientesFicha.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  hapticTap(15);
                  setCloseAccountModalOpen(true);
                }}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-emerald-600 border border-slate-600/80 hover:border-emerald-500 text-slate-100 hover:text-white text-xs font-bold transition active:scale-95 flex items-center gap-1.5 shadow-md"
              >
                <Calculator className="w-4 h-4 text-emerald-400 group-hover:text-white shrink-0" />
                <span>
                  {esFichaAnterior
                    ? `Sumar Productos al Cierre de ${labelFichaSeleccionada.split(' ')[0]}`
                    : `Liquidar / Cerrar ${labelFichaSeleccionada.split(' ')[0]}`}
                </span>
              </button>
            )}
          </div>

          {/* Info adicional: Productos a sumar al cierre y/o Deuda acumulada de otras fichas */}
          {(articulosPendientesFicha.length > 0 ||
            Math.abs(saldoGeneral - saldoFichaSeleccionada) > 0.01) && (
            <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-300 flex-wrap gap-2">
              {articulosPendientesFicha.length > 0 ? (
                <span className="text-amber-400 font-medium">
                  📦 {articulosPendientesFicha.length} producto(s) anotados en{' '}
                  {labelFichaSeleccionada.split(' ')[0]} (se sumarán al cierre del mes: +
                  {formatCurrency(totalArticulosFicha)})
                </span>
              ) : (
                <span />
              )}

              {Math.abs(saldoGeneral - saldoFichaSeleccionada) > 0.01 && (
                <span className="text-slate-400">
                  Deuda total acumulada (todas las fichas):{' '}
                  <strong className="text-white">{formatCurrency(saldoGeneral)}</strong>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Inactive Client Warning Banner */}
        {!cliente.activo && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Cliente inhabilitado:</strong> No se pueden asentar nuevos fiados ni pagos
              hasta que la cuenta sea reactivada.
            </span>
          </div>
        )}

        {/* Action Buttons: Operan directamente sobre la Ficha del Mes Seleccionada */}
        <div className="grid grid-cols-3 gap-2 mt-3.5">
          <button
            onClick={() =>
              onOpenMovementModal('CARGO', selectedPeriodo, saldoFichaSeleccionada)
            }
            disabled={!cliente.activo}
            title={
              !cliente.activo
                ? 'Cliente inhabilitado'
                : `Registrar fiado en la ficha ${labelFichaSeleccionada}`
            }
            className={`py-3 px-2 rounded-xl font-bold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-1.5 ${
              cliente.activo
                ? 'bg-rose-600 hover:bg-rose-500 active:scale-95 text-white shadow-rose-950/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              + Fiado ({labelFichaSeleccionada.split(' ')[0]})
            </span>
          </button>

          <button
            onClick={() => {
              hapticTap(15);
              setAddArticleModalOpen(true);
            }}
            disabled={!cliente.activo}
            title={
              !cliente.activo
                ? 'Cliente inhabilitado'
                : `Anotar Garrafa/Producto en ${labelFichaSeleccionada} para sumar al cierre de mes`
            }
            className={`py-3 px-2 rounded-xl font-bold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-1.5 ${
              cliente.activo
                ? 'bg-amber-600 hover:bg-amber-500 active:scale-95 text-white shadow-amber-950/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <Package className="w-4 h-4 shrink-0 text-amber-200" />
            <span className="truncate">+ Garrafa/Prod</span>
          </button>

          <button
            onClick={() =>
              onOpenMovementModal('PAGO', selectedPeriodo, saldoFichaSeleccionada)
            }
            disabled={!cliente.activo}
            title={
              !cliente.activo
                ? 'Cliente inhabilitado'
                : `Registrar cobro en la ficha ${labelFichaSeleccionada}`
            }
            className={`py-3 px-2 rounded-xl font-bold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-1.5 ${
              cliente.activo
                ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-emerald-950/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">
              Cobrar ({labelFichaSeleccionada.split(' ')[0]})
            </span>
          </button>
        </div>
      </div>

      {/* History of Closed/Returned Products */}
      {articulosHistorial.length > 0 && (
        <div className="px-3 sm:px-5 pt-3">
          <button
            onClick={() => setMostrarHistorialArticulos(!mostrarHistorialArticulos)}
            className="text-xs text-slate-400 hover:text-slate-300 flex items-center gap-1 transition font-medium"
          >
            {mostrarHistorialArticulos ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            <span>
              {mostrarHistorialArticulos ? 'Ocultar' : 'Ver'} historial de productos sumados en
              cierres anteriores ({articulosHistorial.length})
            </span>
          </button>

          {mostrarHistorialArticulos && (
            <div className="mt-2 space-y-1.5">
              {articulosHistorial.map((art) => (
                <div
                  key={art.id}
                  className="bg-slate-850/60 rounded-lg p-2.5 border border-slate-800 text-xs flex items-center justify-between text-slate-400"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-300">{art.producto_nombre}</span>
                    <span>
                      ({art.cantidad} {art.producto_unidad})
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                        art.estado === 'LIQUIDADO'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {art.estado === 'LIQUIDADO'
                        ? 'Sumado al cierre de mes'
                        : 'Devuelto / Cancelado'}
                    </span>
                  </div>
                  <div className="text-right">
                    {art.precio_liquidado ? (
                      <span className="text-slate-300 font-semibold">
                        {formatCurrency(art.precio_liquidado)}
                      </span>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Movements & Monthly Tabs Section */}
      <div className="p-3 sm:p-5 flex-1">
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-500" />
            Fichas Mensuales Independientes
          </h3>
          <span className="text-[11px] text-slate-500">
            Cada ficha separa su propio total mensual
          </span>
        </div>

        <MovementList
          movimientos={movimientos}
          articulosPendientes={articulosPendientes}
          loading={loadingMovimientos}
          periodoActivo={cliente.periodo_actual}
          selectedPeriodo={selectedPeriodo}
          onSelectPeriodo={(periodo, saldoFicha) => {
            setSelectedPeriodo(periodo);
            setSaldoFichaSeleccionada(saldoFicha);
          }}
          onAnular={onAnularMovimiento}
          onEditar={onEditarMovimiento}
          onOpenWhatsAppMes={(periodo) => onOpenWhatsAppModal(periodo)}
          onOpenMovementForPeriodo={(tipo, periodo, saldoFicha) => {
            setSelectedPeriodo(periodo);
            setSaldoFichaSeleccionada(saldoFicha);
            onOpenMovementModal(tipo, periodo, saldoFicha);
          }}
          onOpenAddArticleForPeriodo={(periodo) => {
            setSelectedPeriodo(periodo);
            setAddArticleModalOpen(true);
          }}
          onOpenCloseMonthForPeriodo={(periodo, saldoFicha) => {
            setSelectedPeriodo(periodo);
            setSaldoFichaSeleccionada(saldoFicha);
            setCloseAccountModalOpen(true);
          }}
          onCancelarArticulo={handleCancelarArticuloById}
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

      {/* Modal para anotar Garrafas u otros productos que se suman al cierre de mes */}
      <AddArticleModal
        isOpen={addArticleModalOpen}
        cliente={cliente}
        targetPeriodo={selectedPeriodo}
        onClose={() => setAddArticleModalOpen(false)}
        onSuccess={async (art) => {
          await cargarArticulos();
          if (onRefreshClient) await onRefreshClient();
          if (onOperationFinished) {
            onOperationFinished({
              titulo: '¡Producto anotado para cierre de mes!',
              detalle: `${art.cantidad} ${art.producto_unidad} de ${art.producto_nombre} en ficha ${labelFichaSeleccionada} (se suma al cerrar el mes)`,
              monto: art.subtotal_actual,
              esCargo: true,
            });
          }
        }}
      />

      {/* Modal para Liquidar / Cerrar Mes */}
      <CloseAccountModal
        isOpen={closeAccountModalOpen}
        cliente={cliente}
        targetPeriodo={selectedPeriodo}
        saldoFichaLibreta={saldoFichaSeleccionada}
        articulosPendientes={articulosPendientesFicha}
        onClose={() => setCloseAccountModalOpen(false)}
        onSuccess={async (info, nuevoPeriodoActivo) => {
          await cargarArticulos();
          if (onRefreshClient) await onRefreshClient();
          if (nuevoPeriodoActivo) {
            setSelectedPeriodo(nuevoPeriodoActivo);
          }
          if (onOperationFinished) {
            onOperationFinished(info);
          }
        }}
      />
    </div>
  );
};
