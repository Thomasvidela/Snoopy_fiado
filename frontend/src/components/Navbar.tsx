import React from 'react';
import { Store, UserCheck, RefreshCw, UserPlus, Users } from 'lucide-react';
import { Operador } from '../types';

interface NavbarProps {
  currentOperator: Operador | null;
  onSwitchOperator: () => void;
  onManageOperators: () => void;
  onNewClient: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentOperator,
  onSwitchOperator,
  onManageOperators,
  onNewClient,
}) => {
  return (
    <header className="bg-slate-800/90 backdrop-blur border-b border-slate-700/60 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        {/* Logo & Store Name */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-900/30">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
              Libreta de Fiados
              <span className="hidden sm:inline-block text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Despensa Snoopy
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 hidden xs:block">
              Despensa Snoopy - Cuentas Corrientes & Mostrador
            </p>
          </div>
        </div>

        {/* Actions & Operator */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Manage Operators Button */}
          <button
            onClick={onManageOperators}
            title="Administrar Operadores"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-700 border border-slate-600/70 text-slate-300 hover:text-white transition active:scale-95 text-xs font-medium"
          >
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="hidden md:inline">Operadores</span>
          </button>

          <button
            onClick={onNewClient}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-medium text-xs sm:text-sm shadow-sm transition"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Cliente</span>
            <span className="sm:hidden">Nuevo</span>
          </button>

          {/* Operator Switcher Pill */}
          {currentOperator ? (
            <button
              onClick={onSwitchOperator}
              title="Cambiar de Operador"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 transition active:scale-95"
            >
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                {currentOperator.nombre.charAt(0)}
              </div>
              <div className="text-left leading-tight hidden xs:block">
                <span className="text-[10px] text-slate-400 block">Operador</span>
                <span className="text-xs font-semibold text-white">{currentOperator.nombre}</span>
              </div>
              <RefreshCw className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>
          ) : (
            <button
              onClick={onSwitchOperator}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition"
            >
              <UserCheck className="w-4 h-4" />
              <span>Ingresar PIN</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
