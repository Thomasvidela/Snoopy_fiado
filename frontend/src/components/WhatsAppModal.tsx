import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { Cliente, ResumenMensual } from '../types';
import { api } from '../api/client';
import { formatCurrency, getWhatsAppCleanNumber, normalizeArgentinePhone } from '../utils/format';

interface WhatsAppModalProps {
  isOpen: boolean;
  cliente: Cliente | null;
  onClose: () => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  cliente,
  onClose,
}) => {
  const [currentPeriod, setCurrentPeriod] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [resumen, setResumen] = useState<ResumenMensual | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [descargandoExcel, setDescargandoExcel] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && cliente) {
      loadResumen(currentPeriod);
    }
  }, [isOpen, cliente, currentPeriod]);

  const loadResumen = async (mes: string) => {
    if (!cliente) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getResumen(cliente.id, mes);
      setResumen(data);
    } catch (err: any) {
      setError(err.message || 'Error al obtener resumen');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => {
    const [y, m] = currentPeriod.split('-').map(Number);
    const date = new Date(y, m - 2, 1);
    setCurrentPeriod(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = currentPeriod.split('-').map(Number);
    const date = new Date(y, m, 1);
    setCurrentPeriod(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleCopy = () => {
    if (!resumen) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(resumen.texto_whatsapp)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => fallbackCopy(resumen.texto_whatsapp));
    } else {
      fallbackCopy(resumen.texto_whatsapp);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignorar fallback
    }
  };

  const handleOpenWhatsApp = () => {
    if (!resumen) return;
    const cleanPhone = getWhatsAppCleanNumber(cliente?.telefono);
    const encodedText = encodeURIComponent(resumen.texto_whatsapp);
    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank');
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
    }
  };

  const handleDownloadExcelMes = async () => {
    if (!cliente || !currentPeriod) return;
    setDescargandoExcel(true);
    try {
      await api.exportarExcel(cliente.id, currentPeriod, cliente.nombre);
    } catch (err: any) {
      alert(err.message || 'Error al descargar Excel del mes');
    } finally {
      setDescargandoExcel(false);
    }
  };

  if (!isOpen || !cliente) return null;

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
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-1.5">
              Resumen de Cuenta WhatsApp
            </h2>
            <p className="text-xs text-slate-400">
              Cliente: <strong className="text-white">{cliente.nombre}</strong>
              {cliente.telefono && (
                <span className="text-emerald-400 ml-1.5 font-mono">
                  ({normalizeArgentinePhone(cliente.telefono)})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex items-center justify-between bg-slate-900/80 p-2 rounded-xl border border-slate-700/60 mb-3">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">
            Período: {currentPeriod}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Cargando estado de cuenta...
          </div>
        ) : error ? (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        ) : resumen ? (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block">Saldo Ant.</span>
                <span className="text-xs font-bold text-slate-200">
                  {formatCurrency(resumen.saldo_anterior)}
                </span>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block">(+) Compras</span>
                <span className="text-xs font-bold text-rose-400">
                  +{formatCurrency(resumen.total_cargos_periodo)}
                </span>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block">(-) Pagos</span>
                <span className="text-xs font-bold text-emerald-400">
                  -{formatCurrency(resumen.total_pagos_periodo)}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2.5 rounded-xl border border-emerald-500/30">
                <span className="text-[10px] text-emerald-400 block font-semibold">Total a Pagar</span>
                <span className="text-xs font-bold text-white">
                  {formatCurrency(resumen.saldo_final_periodo)}
                </span>
              </div>
            </div>

            {/* Formatted Message Preview */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Texto listo para enviar:
              </label>
              <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto select-all">
                {resumen.texto_whatsapp}
              </pre>
            </div>
          </div>
        ) : null}

        {/* Footer Actions */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-700/60">
          <button
            onClick={handleCopy}
            disabled={!resumen || loading}
            className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copiar
              </>
            )}
          </button>

          <button
            onClick={handleDownloadExcelMes}
            disabled={!resumen || loading || descargandoExcel}
            className="py-2.5 rounded-xl bg-emerald-800/40 hover:bg-emerald-800/60 border border-emerald-600/40 text-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            title="Descargar Excel (.xlsx) de este mes"
          >
            {descargandoExcel ? (
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            )}
            Excel Mes
          </button>

          <button
            onClick={handleOpenWhatsApp}
            disabled={!resumen || loading}
            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-emerald-950/40 disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};
