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
} from 'lucide-react';
import { Movimiento } from '../types';
import { formatCurrency, formatDate } from '../utils/format';
import { hapticTap } from '../utils/haptics';

interface MovementListProps {
  movimientos: Movimiento[];
  loading: boolean;
  periodoActivo?: string | null;
  onAnular: (movimientoId: number) => Promise<void>;
  onOpenWhatsAppMes?: (periodo: string) => void;
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

function getPeriodoLabel(mesKey: string): string {
  const parts = mesKey.split('-');
  if (parts.length !== 2) return mesKey;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  return `${MESES_NOMBRES[month] || month} ${year}`;
}

interface GrupoMensual {
  mesKey: string;
  mesLabel: string;
  esPeriodoActivo: boolean;
  movimientos: Movimiento[];
  saldoAnterior: number;
  totalCargos: number;
  totalPagos: number;
  saldoCierre: number;
}

export const MovementList: React.FC<MovementListProps> = ({
  movimientos,
  loading,
  periodoActivo,
  onAnular,
  onOpenWhatsAppMes,
}) => {
  const [selectedToAnul, setSelectedToAnul] = useState<Movimiento | null>(null);
  const [anulando, setAnulando] = useState<boolean>(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

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
    const map = new Map<string, Movimiento[]>();

    // Si hay movimientos o si el cliente ya tiene un período adelantado abierto, asegurar que la pestaña activa exista
    if (movimientos.length > 0 || (periodoActivo && periodoActivo > currentYearMonth)) {
      map.set(effectiveActivePeriod, []);
    }

    for (const m of movimientos) {
      let key = m.periodo || '';
      if (!key) {
        const d = new Date(m.fecha_creacion);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(m);
    }

    // Ordenar claves cronológicamente de más antigua a más reciente para encadenar saldoAnterior -> saldoCierre
    const sortedKeysAsc = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    let runningSaldo = 0;
    const computedAsc: GrupoMensual[] = [];

    for (const key of sortedKeysAsc) {
      const movs = map.get(key)!; // Ya vienen ordenados del más reciente al más antiguo
      let cargos = 0;
      let pagos = 0;

      for (const m of movs) {
        if (!m.anulado) {
          if (m.tipo === 'CARGO') {
            cargos += parseFloat(m.monto);
          } else if (m.tipo === 'PAGO') {
            pagos += parseFloat(m.monto);
          }
        }
      }

      const saldoAnterior = runningSaldo;
      const saldoCierre =
        movs.length > 0 ? parseFloat(movs[0].saldo_resultante) : saldoAnterior;
      runningSaldo = saldoCierre;

      computedAsc.push({
        mesKey: key,
        mesLabel: getPeriodoLabel(key),
        esPeriodoActivo: key === effectiveActivePeriod,
        movimientos: movs,
        saldoAnterior,
        totalCargos: cargos,
        totalPagos: pagos,
        saldoCierre,
      });
    }

    // Devolver de más reciente a más antiguo (pestaña activa primero a la izquierda)
    return computedAsc.reverse();
  }, [movimientos, effectiveActivePeriod, periodoActivo, currentYearMonth]);

  const [selectedTabKey, setSelectedTabKey] = useState<string>(effectiveActivePeriod);

  // Cuando cambia el período activo del cliente (ej. al liquidar el mes), posicionar en la pestaña activa
  useEffect(() => {
    setSelectedTabKey(effectiveActivePeriod);
  }, [effectiveActivePeriod]);

  // Si la pestaña seleccionada no existe en los grupos actuales, seleccionar la primera disponible
  const activeGrupo = useMemo<GrupoMensual | null>(() => {
    if (gruposMensuales.length === 0) return null;
    return (
      gruposMensuales.find((g) => g.mesKey === selectedTabKey) || gruposMensuales[0]
    );
  }, [gruposMensuales, selectedTabKey]);

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

  if (gruposMensuales.length === 0 || !activeGrupo) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm bg-slate-900/40 rounded-xl border border-slate-800/80 m-3">
        No hay movimientos registrados para este cliente.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Barra de Pestañas (Tabs) Mensuales */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
        {gruposMensuales.map((grupo) => {
          const isSelected = grupo.mesKey === activeGrupo.mesKey;
          return (
            <button
              key={grupo.mesKey}
              type="button"
              onClick={() => {
                hapticTap(10);
                setSelectedTabKey(grupo.mesKey);
              }}
              className={`px-3.5 py-2.5 rounded-xl border text-left transition shrink-0 flex items-center gap-2.5 ${
                isSelected
                  ? grupo.esPeriodoActivo
                    ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-md shadow-emerald-950/40'
                    : 'bg-amber-950/50 border-amber-500 text-white shadow-md shadow-amber-950/30'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              }`}
            >
              {grupo.esPeriodoActivo ? (
                <Sparkles
                  className={`w-4 h-4 shrink-0 ${
                    isSelected ? 'text-emerald-400' : 'text-emerald-500/70'
                  }`}
                />
              ) : (
                <Lock
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isSelected ? 'text-amber-400' : 'text-slate-500'
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
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {grupo.esPeriodoActivo ? 'En curso' : 'Cerrado'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>
                    {grupo.esPeriodoActivo ? 'Saldo:' : 'Cerró en:'}{' '}
                    <strong className={isSelected ? 'text-white' : 'text-slate-300'}>
                      {formatCurrency(grupo.saldoCierre)}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>{grupo.movimientos.length} mov.</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Contenedor de la Pestaña Seleccionada */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        {/* Cabecera Resumen del Mes Seleccionado */}
        <div
          className={`p-3.5 sm:p-4 border-b ${
            activeGrupo.esPeriodoActivo
              ? 'bg-slate-800/80 border-slate-700/70'
              : 'bg-slate-850/90 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="flex items-center gap-2">
              <Calendar
                className={`w-4 h-4 ${
                  activeGrupo.esPeriodoActivo ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
              <h4 className="text-sm font-extrabold text-white">
                Pestaña: {activeGrupo.mesLabel}
              </h4>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  activeGrupo.esPeriodoActivo
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {activeGrupo.esPeriodoActivo
                  ? 'Período abierto (Nuevos fiados se anotan aquí)'
                  : 'Período cerrado'}
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

          {/* 4 Indicadores Contables del Mes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                Saldo Mes Anterior
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-200 mt-0.5 block">
                {formatCurrency(activeGrupo.saldoAnterior)}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                (+) Compras del Mes
              </span>
              <span className="text-xs sm:text-sm font-bold text-rose-400 mt-0.5 block">
                +{formatCurrency(activeGrupo.totalCargos)}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                (-) Pagos en el Mes
              </span>
              <span className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5 block">
                -{formatCurrency(activeGrupo.totalPagos)}
              </span>
            </div>

            <div
              className={`rounded-xl p-2.5 border ${
                activeGrupo.esPeriodoActivo
                  ? 'bg-emerald-950/30 border-emerald-500/30'
                  : 'bg-amber-950/25 border-amber-500/30'
              }`}
            >
              <span
                className={`text-[10px] uppercase tracking-wider font-semibold block ${
                  activeGrupo.esPeriodoActivo ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {activeGrupo.esPeriodoActivo ? 'Saldo de la Pestaña' : 'Cerró en'}
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-white mt-0.5 block">
                {formatCurrency(activeGrupo.saldoCierre)}
              </span>
            </div>
          </div>
        </div>

        {/* Lista de Movimientos de la Pestaña Seleccionada */}
        {activeGrupo.movimientos.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs sm:text-sm space-y-1">
            <p className="font-semibold text-slate-200">
              Pestaña <span className="text-emerald-400">{activeGrupo.mesLabel}</span> abierta y lista para anotar nuevos fiados.
            </p>
            <p className="text-xs text-slate-400">
              Aún no se cargaron compras ni pagos en este nuevo período.
              {activeGrupo.saldoAnterior > 0 && (
                <>
                  {' '}
                  El saldo pendiente que viene del mes anterior es de{' '}
                  <strong className="text-white">
                    {formatCurrency(activeGrupo.saldoAnterior)}
                  </strong>
                  .
                </>
              )}
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
                      Saldo:{' '}
                      <span className="text-slate-200">
                        {formatCurrency(m.saldo_resultante)}
                      </span>
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
        )}
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
