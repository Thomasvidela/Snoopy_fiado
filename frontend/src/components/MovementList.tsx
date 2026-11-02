import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  AlertTriangle,
  Calendar,
  User,
  Lock,
  Sparkles,
  MessageCircle,
  Edit3,
  PlusCircle,
  CheckCircle2,
  Package,
  Trash2,
  Calculator,
  X,
} from 'lucide-react';
import { Movimiento, ClienteArticulo, MovimientoUpdatePayload } from '../types';
import { formatCurrency, formatDate } from '../utils/format';
import { hapticTap, hapticSuccess, hapticError } from '../utils/haptics';

interface MovementListProps {
  movimientos: Movimiento[];
  articulosPendientes?: ClienteArticulo[];
  loading: boolean;
  periodoActivo?: string | null;
  selectedPeriodo?: string;
  onSelectPeriodo?: (periodo: string, saldoFicha: number) => void;
  onAnular: (movimientoId: number) => Promise<void>;
  onEditar?: (movimientoId: number, payload: MovimientoUpdatePayload) => Promise<void>;
  onOpenWhatsAppMes?: (periodo: string) => void;
  onOpenMovementForPeriodo?: (tipo: 'CARGO' | 'PAGO', periodo: string, saldoFicha: number) => void;
  onOpenAddArticleForPeriodo?: (periodo: string) => void;
  onOpenCloseMonthForPeriodo?: (periodo: string, saldoFicha: number) => void;
  onCancelarArticulo?: (articuloId: number) => Promise<void>;
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

export function getPeriodoLabel(mesKey: string): string {
  const parts = mesKey.split('-');
  if (parts.length !== 2) return mesKey;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  return `${MESES_NOMBRES[month] || month} ${year}`;
}

export interface GrupoMensual {
  mesKey: string;
  mesLabel: string;
  esPeriodoActivo: boolean;
  movimientos: Movimiento[];
  articulosPendientes: ClienteArticulo[];
  totalArticulosPendientes: number;
  totalCargos: number;
  totalPagos: number;
  saldoMes: number;
  saldoPorMovimientoId: Record<number, number>;
}

export const MovementList: React.FC<MovementListProps> = ({
  movimientos,
  articulosPendientes = [],
  loading,
  periodoActivo,
  selectedPeriodo,
  onSelectPeriodo,
  onAnular,
  onEditar,
  onOpenWhatsAppMes,
  onOpenMovementForPeriodo,
  onOpenAddArticleForPeriodo,
  onOpenCloseMonthForPeriodo,
  onCancelarArticulo,
}) => {
  const [selectedToAnul, setSelectedToAnul] = useState<Movimiento | null>(null);
  const [anulando, setAnulando] = useState<boolean>(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  // Estado para Editar un movimiento (de mes actual o mes anterior)
  const [selectedToEdit, setSelectedToEdit] = useState<Movimiento | null>(null);
  const [editMonto, setEditMonto] = useState<string>('');
  const [editNota, setEditNota] = useState<string>('');
  const [editando, setEditando] = useState<boolean>(false);
  const [errorEditar, setErrorEditar] = useState<string | null>(null);

  const currentYearMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const effectiveActivePeriod = useMemo(() => {
    if (periodoActivo && periodoActivo > currentYearMonth) {
      return periodoActivo;
    }
    return currentYearMonth;
  }, [periodoActivo, currentYearMonth]);

  const gruposMensuales = useMemo<GrupoMensual[]>(() => {
    const movsMap = new Map<string, Movimiento[]>();
    const artsMap = new Map<string, ClienteArticulo[]>();

    // Asegurar que la ficha del período activo siempre exista
    movsMap.set(effectiveActivePeriod, []);
    artsMap.set(effectiveActivePeriod, []);

    for (const m of movimientos) {
      let key = m.periodo || '';
      if (!key) {
        const d = new Date(m.fecha_creacion);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!movsMap.has(key)) movsMap.set(key, []);
      if (!artsMap.has(key)) artsMap.set(key, []);
      movsMap.get(key)!.push(m);
    }

    for (const art of articulosPendientes) {
      let key = art.periodo || '';
      if (!key) {
        const d = new Date(art.fecha_creacion);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!movsMap.has(key)) movsMap.set(key, []);
      if (!artsMap.has(key)) artsMap.set(key, []);
      artsMap.get(key)!.push(art);
    }

    // Ordenar claves de más reciente a más antigua
    const sortedKeysDesc = Array.from(movsMap.keys()).sort((a, b) => b.localeCompare(a));

    return sortedKeysDesc.map((key) => {
      const movs = movsMap.get(key) || []; // Vienen del más reciente al más antiguo
      const arts = artsMap.get(key) || [];

      let cargos = 0;
      let pagos = 0;

      // Calcular el saldo acumulado propio dentro de esta ficha (orden cronológico ascendente)
      const movsAsc = [...movs].reverse();
      let acumMes = 0;
      const saldoPorMovimientoId: Record<number, number> = {};

      for (const m of movsAsc) {
        const montoVal = parseFloat(m.monto);
        if (m.tipo === 'CARGO') {
          acumMes += montoVal;
          if (!m.anulado) cargos += montoVal;
        } else if (m.tipo === 'PAGO') {
          acumMes -= montoVal;
          if (!m.anulado) pagos += montoVal;
        } else if (m.tipo === 'ANULACION_CARGO') {
          acumMes -= montoVal;
        } else if (m.tipo === 'ANULACION_PAGO') {
          acumMes += montoVal;
        }
        saldoPorMovimientoId[m.id] = acumMes;
      }

      const saldoMes = cargos - pagos;
      const totalArticulosPendientes = arts.reduce(
        (acc, a) => acc + parseFloat(a.subtotal_actual),
        0
      );

      return {
        mesKey: key,
        mesLabel: getPeriodoLabel(key),
        esPeriodoActivo: key === effectiveActivePeriod,
        movimientos: movs,
        articulosPendientes: arts,
        totalArticulosPendientes,
        totalCargos: cargos,
        totalPagos: pagos,
        saldoMes,
        saldoPorMovimientoId,
      };
    });
  }, [movimientos, articulosPendientes, effectiveActivePeriod]);

  const [internalTabKey, setInternalTabKey] = useState<string>(effectiveActivePeriod);
  const currentTabKey = selectedPeriodo || internalTabKey;

  useEffect(() => {
    setInternalTabKey(effectiveActivePeriod);
    if (onSelectPeriodo) {
      const g = gruposMensuales.find((x) => x.mesKey === effectiveActivePeriod);
      onSelectPeriodo(effectiveActivePeriod, g ? g.saldoMes : 0);
    }
  }, [effectiveActivePeriod]);

  const activeGrupo = useMemo<GrupoMensual | null>(() => {
    if (gruposMensuales.length === 0) return null;
    return (
      gruposMensuales.find((g) => g.mesKey === currentTabKey) || gruposMensuales[0]
    );
  }, [gruposMensuales, currentTabKey]);

  // Mantener sincronizado el saldo de la ficha seleccionada en el padre
  useEffect(() => {
    if (activeGrupo && onSelectPeriodo) {
      onSelectPeriodo(activeGrupo.mesKey, activeGrupo.saldoMes);
    }
  }, [activeGrupo?.mesKey, activeGrupo?.saldoMes]);

  const handleSelectTab = (grupo: GrupoMensual) => {
    hapticTap(10);
    setInternalTabKey(grupo.mesKey);
    if (onSelectPeriodo) {
      onSelectPeriodo(grupo.mesKey, grupo.saldoMes);
    }
  };

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

  const openEditModal = (m: Movimiento) => {
    hapticTap(15);
    setSelectedToEdit(m);
    setEditMonto(parseFloat(m.monto).toString());
    setEditNota(m.nota || '');
    setErrorEditar(null);
  };

  const confirmEditar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToEdit || !onEditar) return;
    const parsedMonto = parseFloat(editMonto);
    if (isNaN(parsedMonto) || parsedMonto <= 0) {
      hapticError();
      setErrorEditar('Ingrese un monto válido mayor a $0.');
      return;
    }

    setEditando(true);
    setErrorEditar(null);
    try {
      await onEditar(selectedToEdit.id, {
        monto: parsedMonto.toFixed(2),
        nota: editNota.trim(),
      });
      hapticSuccess();
      setSelectedToEdit(null);
    } catch (err: any) {
      hapticError();
      setErrorEditar(err.message || 'Error al editar el movimiento');
    } finally {
      setEditando(false);
    }
  };

  if (loading && movimientos.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
        Cargando fichas mensuales...
      </div>
    );
  }

  if (!activeGrupo) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Barra de Pestañas (Fichas Mensuales Independientes) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
        {gruposMensuales.map((grupo) => {
          const isSelected = grupo.mesKey === activeGrupo.mesKey;
          const tieneDeudaMes = grupo.saldoMes > 0.005;
          const estaSaldado =
            !grupo.esPeriodoActivo &&
            grupo.saldoMes <= 0.005 &&
            (grupo.movimientos.length > 0 || grupo.totalCargos > 0);

          return (
            <button
              key={grupo.mesKey}
              type="button"
              onClick={() => handleSelectTab(grupo)}
              className={`px-3.5 py-2.5 rounded-xl border text-left transition shrink-0 flex items-center gap-2.5 ${
                isSelected
                  ? grupo.esPeriodoActivo
                    ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-md shadow-emerald-950/40'
                    : tieneDeudaMes
                    ? 'bg-rose-950/50 border-rose-500 text-white shadow-md shadow-rose-950/30'
                    : 'bg-cyan-950/50 border-cyan-500 text-white shadow-md shadow-cyan-950/30'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              }`}
            >
              {grupo.esPeriodoActivo ? (
                <Sparkles
                  className={`w-4 h-4 shrink-0 ${
                    isSelected ? 'text-emerald-400' : 'text-emerald-500/70'
                  }`}
                />
              ) : estaSaldado ? (
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 ${
                    isSelected ? 'text-cyan-400' : 'text-emerald-500/70'
                  }`}
                />
              ) : (
                <Lock
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isSelected ? 'text-rose-400' : 'text-amber-400/80'
                  }`}
                />
              )}

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-extrabold tracking-tight">
                    {grupo.mesLabel}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                      grupo.esPeriodoActivo
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : estaSaldado
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : tieneDeudaMes
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {grupo.esPeriodoActivo
                      ? 'En curso'
                      : estaSaldado
                      ? 'Saldado'
                      : tieneDeudaMes
                      ? 'Con saldo'
                      : 'Cerrado'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>
                    Total mes:{' '}
                    <strong
                      className={
                        grupo.saldoMes > 0
                          ? isSelected
                            ? 'text-rose-300'
                            : 'text-rose-400/90'
                          : isSelected
                          ? 'text-emerald-300'
                          : 'text-slate-300'
                      }
                    >
                      {formatCurrency(grupo.saldoMes)}
                    </strong>
                  </span>
                  {grupo.articulosPendientes.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      +{grupo.articulosPendientes.length} prod.
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Contenedor Principal de la Ficha del Mes Seleccionado */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        {/* Cabecera y Totales Independientes de esta Ficha */}
        <div
          className={`p-3.5 sm:p-4 border-b ${
            activeGrupo.esPeriodoActivo
              ? 'bg-slate-800/80 border-slate-700/70'
              : 'bg-slate-850/90 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar
                className={`w-4 h-4 ${
                  activeGrupo.esPeriodoActivo ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
              <h4 className="text-sm font-extrabold text-white">
                Ficha: {activeGrupo.mesLabel}
              </h4>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  activeGrupo.esPeriodoActivo
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {activeGrupo.esPeriodoActivo
                  ? 'Ficha del mes en curso'
                  : 'Ficha de mes anterior (Editable / Cobrable)'}
              </span>
            </div>

            {onOpenWhatsAppMes && (
              <button
                type="button"
                onClick={() => {
                  hapticTap(15);
                  onOpenWhatsAppMes(activeGrupo.mesKey);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Resumen WhatsApp de {activeGrupo.mesLabel}</span>
              </button>
            )}
          </div>

          {/* 3 Indicadores Exclusivos de esta Ficha de Mes */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                (+) Compras de {activeGrupo.mesLabel.split(' ')[0]}
              </span>
              <span className="text-xs sm:text-sm font-bold text-rose-400 mt-0.5 block">
                +{formatCurrency(activeGrupo.totalCargos)}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                (-) Pagos en {activeGrupo.mesLabel.split(' ')[0]}
              </span>
              <span className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5 block">
                -{formatCurrency(activeGrupo.totalPagos)}
              </span>
            </div>

            <div
              className={`rounded-xl p-2.5 border ${
                activeGrupo.saldoMes > 0
                  ? 'bg-rose-950/30 border-rose-500/30'
                  : 'bg-emerald-950/30 border-emerald-500/30'
              }`}
            >
              <span
                className={`text-[10px] uppercase tracking-wider font-semibold block ${
                  activeGrupo.saldoMes > 0 ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                Total Ficha {activeGrupo.mesLabel.split(' ')[0]}
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-white mt-0.5 block">
                {formatCurrency(activeGrupo.saldoMes)}
              </span>
            </div>
          </div>

          {/* Barra de Acciones Directas sobre esta Ficha (especialmente útil para meses anteriores) */}
          {!activeGrupo.esPeriodoActivo && (
            <div className="mt-3 pt-3 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-300">
                Operar directamente en la ficha de <strong className="text-white">{activeGrupo.mesLabel}</strong>:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {onOpenMovementForPeriodo && (
                  <button
                    type="button"
                    onClick={() => {
                      hapticTap(15);
                      onOpenMovementForPeriodo('PAGO', activeGrupo.mesKey, activeGrupo.saldoMes);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      Cobrar {activeGrupo.mesLabel.split(' ')[0]}
                      {activeGrupo.saldoMes > 0
                        ? ` (${formatCurrency(activeGrupo.saldoMes)})`
                        : ''}
                    </span>
                  </button>
                )}

                {onOpenMovementForPeriodo && (
                  <button
                    type="button"
                    onClick={() => {
                      hapticTap(15);
                      onOpenMovementForPeriodo('CARGO', activeGrupo.mesKey, activeGrupo.saldoMes);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1 transition active:scale-95"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ Fiado en {activeGrupo.mesLabel.split(' ')[0]}</span>
                  </button>
                )}

                {onOpenAddArticleForPeriodo && (
                  <button
                    type="button"
                    onClick={() => {
                      hapticTap(15);
                      onOpenAddArticleForPeriodo(activeGrupo.mesKey);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1 transition active:scale-95"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>+ Producto</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Productos Dinámicos Anotados en esta Ficha (se suman al cierre de mes) */}
        {activeGrupo.articulosPendientes.length > 0 && (
          <div className="p-3.5 sm:p-4 bg-amber-950/15 border-b border-amber-500/30">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs sm:text-sm font-bold text-amber-200">
                    Productos anotados en {activeGrupo.mesLabel} ({activeGrupo.articulosPendientes.length})
                  </h5>
                  <p className="text-[11px] text-slate-400">
                    Se cotizan y suman todos juntos al total del mes al tocar{' '}
                    <strong className="text-amber-300">Liquidar / Cerrar Mes</strong> (Valor ref. hoy:{' '}
                    <strong className="text-amber-300">
                      +{formatCurrency(activeGrupo.totalArticulosPendientes)}
                    </strong>
                    )
                  </p>
                </div>
              </div>

              {onOpenCloseMonthForPeriodo && (
                <button
                  type="button"
                  onClick={() => {
                    hapticTap(15);
                    onOpenCloseMonthForPeriodo(activeGrupo.mesKey, activeGrupo.saldoMes);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  <span>
                    Sumar al Cierre de {activeGrupo.mesLabel.split(' ')[0]} (+
                    {formatCurrency(activeGrupo.totalArticulosPendientes)})
                  </span>
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {activeGrupo.articulosPendientes.map((art) => (
                <div
                  key={art.id}
                  className="bg-slate-900/90 rounded-xl px-3 py-2 border border-slate-700/70 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">
                        {art.cantidad}x {art.producto_nombre}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                        Suma a cierre de mes (Ref: {formatCurrency(art.subtotal_actual)})
                      </span>
                    </div>
                    {art.nota && (
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">Nota: {art.nota}</p>
                    )}
                  </div>

                  {onCancelarArticulo && (
                    <button
                      type="button"
                      onClick={() => onCancelarArticulo(art.id)}
                      title="Quitar producto anotado por error"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de Movimientos de la Ficha Seleccionada */}
        {activeGrupo.movimientos.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs sm:text-sm space-y-1">
            <p className="font-semibold text-slate-200">
              Ficha <span className="text-emerald-400">{activeGrupo.mesLabel}</span> en{' '}
              <strong className="text-white">$0,00</strong>.
            </p>
            <p className="text-xs text-slate-400">
              {activeGrupo.articulosPendientes.length > 0
                ? 'Hay productos anotados que se sumarán al realizar el cierre del mes.'
                : 'Aún no hay compras ni pagos registrados en esta ficha mensual.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {activeGrupo.movimientos.map((m) => {
              const isCargo = m.tipo === 'CARGO';
              const isPago = m.tipo === 'PAGO';
              const isContraCargo = m.tipo === 'ANULACION_CARGO';
              const isContraPago = m.tipo === 'ANULACION_PAGO';
              const isContraAsiento = isContraCargo || isContraPago;
              const saldoEnFicha =
                activeGrupo.saldoPorMovimientoId[m.id] !== undefined
                  ? activeGrupo.saldoPorMovimientoId[m.id]
                  : parseFloat(m.saldo_resultante);

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
                          className={`text-xs mt-0.5 break-words ${
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

                  {/* Amount, Month Ficha Balance & Actions (Editar / Anular) */}
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
                      Acum. mes:{' '}
                      <span className="text-slate-200">{formatCurrency(saldoEnFicha)}</span>
                    </div>

                    {/* Botones Editar y Anular para movimientos activos (incluso en meses anteriores) */}
                    {!m.anulado && !isContraAsiento && (
                      <div className="flex items-center justify-end gap-2.5 mt-1">
                        {onEditar && (
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            className="text-[11px] text-slate-400 hover:text-amber-300 hover:underline inline-flex items-center gap-1 transition"
                          >
                            <Edit3 className="w-3 h-3" />
                            Editar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedToAnul(m)}
                          className="text-[11px] text-slate-400 hover:text-rose-400 hover:underline inline-flex items-center gap-1 transition"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Anular
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal para Editar Movimiento (Monto o Nota) */}
      {selectedToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSelectedToEdit(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-white">
                  Editar {selectedToEdit.tipo === 'CARGO' ? 'Compra Fiada' : 'Pago Recibido'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Ficha: <strong className="text-slate-200">{activeGrupo.mesLabel}</strong>
                </p>
              </div>
            </div>

            <form onSubmit={confirmEditar} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Monto ($)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={editMonto}
                  onChange={(e) => setEditMonto(e.target.value)}
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-base font-bold text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nota / Detalle
                </label>
                <input
                  type="text"
                  value={editNota}
                  onChange={(e) => setEditNota(e.target.value)}
                  placeholder="Descripción del movimiento..."
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {errorEditar && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                  {errorEditar}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedToEdit(null)}
                  disabled={editando}
                  className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editando}
                  className="py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow-md shadow-amber-950/50"
                >
                  {editando ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              <strong className="text-white">{formatCurrency(selectedToAnul.monto)}</strong> en la ficha{' '}
              <strong className="text-white">{activeGrupo.mesLabel}</strong>.
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
