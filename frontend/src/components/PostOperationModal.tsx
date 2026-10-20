import React, { useEffect, useRef } from 'react';
import { CheckCircle2, Search, ArrowRight, RotateCcw } from 'lucide-react';
import { Cliente } from '../types';
import { formatCurrency } from '../utils/format';
import { hapticTap } from '../utils/haptics';

export interface PostOperationInfo {
  titulo: string;
  detalle: string;
  monto?: string;
  esCargo?: boolean;
}

interface PostOperationModalProps {
  isOpen: boolean;
  cliente: Cliente | null;
  operationInfo: PostOperationInfo | null;
  onContinueSameClient: () => void;
  onFinishAndSearchNew: () => void;
}

export const PostOperationModal: React.FC<PostOperationModalProps> = ({
  isOpen,
  cliente,
  operationInfo,
  onContinueSameClient,
  onFinishAndSearchNew,
}) => {
  const finishBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus the safe default action ("No, finalizar y buscar otro cliente")
      setTimeout(() => finishBtnRef.current?.focus(), 60);
    }
  }, [isOpen]);

  if (!isOpen || !cliente || !operationInfo) return null;

  const saldoMostrado = cliente.saldo_total || cliente.saldo_actual;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-800 border-2 border-emerald-500/40 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl relative text-center">
        {/* Success Icon */}
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        {/* Title */}
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          {operationInfo.titulo}
        </h2>

        {/* Operation & Client Summary Card */}
        <div className="mt-3.5 p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-left space-y-2">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <span className="text-xs text-slate-400">Cliente:</span>
            <div className="text-right">
              <span className="text-sm font-bold text-white">{cliente.nombre}</span>
              {cliente.apodo && (
                <span className="text-xs text-amber-400 font-semibold ml-1.5">
                  "{cliente.apodo}"
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">Operación:</span>
            <span className="text-xs sm:text-sm font-semibold text-slate-200 text-right">
              {operationInfo.detalle}
            </span>
          </div>

          {operationInfo.monto && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">Monto registrado:</span>
              <span
                className={`text-sm font-extrabold ${
                  operationInfo.esCargo ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {operationInfo.esCargo ? '+' : '-'}
                {formatCurrency(operationInfo.monto)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
            <span className="text-xs text-slate-400">Saldo total actual:</span>
            <span className="text-sm font-extrabold text-amber-300">
              {formatCurrency(saldoMostrado)}
            </span>
          </div>
        </div>

        {/* Core Question */}
        <div className="mt-5 mb-4">
          <p className="text-sm sm:text-base font-bold text-white">
            ¿Desea realizar otra operación dentro de este mismo cliente?
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Si ya terminó con <strong className="text-slate-200">{cliente.nombre}</strong>, cierre su ficha para evitar cargar por error al próximo cliente.
          </p>
        </div>

        {/* Decision Buttons */}
        <div className="space-y-2.5">
          <button
            ref={finishBtnRef}
            type="button"
            onClick={() => {
              hapticTap(20);
              onFinishAndSearchNew();
            }}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>No, finalizar y buscar otro cliente</span>
            <ArrowRight className="w-4 h-4 shrink-0 ml-0.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              hapticTap(15);
              onContinueSameClient();
            }}
            className="w-full py-3 px-4 rounded-xl bg-slate-700/80 hover:bg-slate-700 active:scale-98 border border-slate-600 text-slate-200 hover:text-white font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Sí, hacer otra operación con {cliente.nombre}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
