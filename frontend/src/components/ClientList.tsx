import React, { useState, useMemo } from 'react';
import { Search, Phone, Clock, X } from 'lucide-react';
import { Cliente } from '../types';
import { formatCurrency, timeAgo, normalizeArgentinePhone } from '../utils/format';
import { hapticTap } from '../utils/haptics';

interface ClientListProps {
  clientes: Cliente[];
  selectedClienteId: number | null;
  onSelectCliente: (cliente: Cliente) => void;
  loading: boolean;
  onSearchChange: (query: string) => void;
  searchQuery: string;
}

export const ClientList: React.FC<ClientListProps> = ({
  clientes,
  selectedClienteId,
  onSelectCliente,
  loading,
  onSearchChange,
  searchQuery,
}) => {
  const [filter, setFilter] = useState<'todos' | 'deudores' | 'aldia' | 'inactivos'>('todos');

  const inactivosCount = useMemo(() => {
    return clientes.filter((c) => !c.activo).length;
  }, [clientes]);

  // Filtrado local adicional (por estado de saldo o inactivos)
  const filteredClientes = useMemo(() => {
    return clientes.filter((c) => {
      if (filter === 'inactivos') return !c.activo;
      const saldo = parseFloat(c.saldo_actual);
      if (filter === 'deudores') return saldo > 0 && c.activo;
      if (filter === 'aldia') return saldo <= 0 && c.activo;
      return true;
    });
  }, [clientes, filter]);

  // Total deuda en la calle (solo de clientes activos)
  const totalDeuda = useMemo(() => {
    return clientes.reduce((acc, c) => {
      if (!c.activo) return acc;
      const s = parseFloat(c.saldo_actual);
      return s > 0 ? acc + s : acc;
    }, 0);
  }, [clientes]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Search & Header */}
      <div className="p-3 sm:p-4 border-b border-slate-800 space-y-3">
        {/* Instant Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o apodo..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Chips & Total Summary */}
        <div className="flex items-center justify-between text-xs gap-1 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 flex-wrap">
            <button
              onClick={() => setFilter('todos')}
              className={`px-2 py-1 rounded-md transition font-medium ${
                filter === 'todos'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos ({clientes.length})
            </button>
            <button
              onClick={() => setFilter('deudores')}
              className={`px-2 py-1 rounded-md transition font-medium ${
                filter === 'deudores'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Con Deuda
            </button>
            <button
              onClick={() => setFilter('aldia')}
              className={`px-2 py-1 rounded-md transition font-medium ${
                filter === 'aldia'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Al Día
            </button>
            {inactivosCount > 0 && (
              <button
                onClick={() => setFilter('inactivos')}
                className={`px-2 py-1 rounded-md transition font-medium ${
                  filter === 'inactivos'
                    ? 'bg-rose-800 text-white shadow-xs'
                    : 'text-rose-400/80 hover:text-rose-300'
                }`}
              >
                Inactivos ({inactivosCount})
              </button>
            )}
          </div>

          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-slate-400 block leading-tight">Total en la calle:</span>
            <span className="font-bold text-rose-400 text-xs">{formatCurrency(totalDeuda)}</span>
          </div>
        </div>
      </div>

      {/* Client Cards List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-1">
        {loading && clientes.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
            Cargando clientes...
          </div>
        ) : filteredClientes.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No se encontraron clientes con ese criterio.
          </div>
        ) : (
          filteredClientes.map((cliente) => {
            const saldoNum = parseFloat(cliente.saldo_actual);
            const isSelected = selectedClienteId === cliente.id;
            const hasDebt = saldoNum > 0;
            const isCredit = saldoNum < 0;

            return (
              <button
                key={cliente.id}
                onClick={() => {
                  hapticTap(15);
                  onSelectCliente(cliente);
                }}
                className={`w-full text-left p-3 rounded-xl transition flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-emerald-950/40 border border-emerald-500/40 shadow-sm'
                    : 'hover:bg-slate-800/60 border border-transparent'
                } ${!cliente.activo ? 'opacity-75' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Initials Avatar */}
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition ${
                      !cliente.activo
                        ? 'bg-slate-800 text-slate-500 border border-slate-700'
                        : hasDebt
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : isCredit
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {cliente.nombre.substring(0, 2).toUpperCase()}
                  </div>

                  {/* Name and Meta */}
                  <div className="min-w-0 truncate">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-white text-sm truncate">
                        {cliente.nombre}
                      </span>
                      {cliente.apodo && (
                        <span className="text-xs text-amber-400/90 font-medium shrink-0">
                          "{cliente.apodo}"
                        </span>
                      )}
                      {!cliente.activo && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      {cliente.telefono && (
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-slate-500" />
                          {normalizeArgentinePhone(cliente.telefono)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {timeAgo(cliente.ultima_actividad)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Saldo Badge */}
                <div className="text-right shrink-0">
                  <div
                    className={`text-sm font-bold tracking-tight ${
                      hasDebt
                        ? 'text-rose-400'
                        : isCredit
                        ? 'text-cyan-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {formatCurrency(cliente.saldo_actual)}
                  </div>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block ${
                      hasDebt
                        ? 'bg-rose-500/10 text-rose-300'
                        : isCredit
                        ? 'bg-cyan-500/10 text-cyan-300'
                        : 'bg-emerald-500/10 text-emerald-300'
                    }`}
                  >
                    {hasDebt ? 'Debe' : isCredit ? 'A favor' : 'Al día'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
