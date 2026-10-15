import React, { useState, useEffect } from 'react';
import { User, Lock, Delete, ArrowLeft, AlertCircle } from 'lucide-react';
import { Operador } from '../types';
import { api, authStorage } from '../api/client';

interface OperatorPinModalProps {
  isOpen: boolean;
  onSuccess: (operador: Operador) => void;
  onClose?: () => void;
  canClose?: boolean;
}

export const OperatorPinModal: React.FC<OperatorPinModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
  canClose = false,
}) => {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [selectedOperador, setSelectedOperador] = useState<Operador | null>(null);
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      api.getOperadores()
        .then((ops) => {
          setOperadores(ops);
          // If only 1 operator or previously stored operator, preselect
          const stored = authStorage.getOperator();
          if (stored) {
            const found = ops.find(o => o.id === stored.id);
            if (found) setSelectedOperador(found);
          }
        })
        .catch(() => setError('Error al cargar operadores. Verifique la conexión.'));
    }
  }, [isOpen]);

  // Handle keyboard typing on PC
  useEffect(() => {
    if (!isOpen || !selectedOperador) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape' && canClose && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedOperador, pin]);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(null);
      if (newPin.length === 4) {
        submitLogin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const submitLogin = async (enteredPin: string) => {
    if (!selectedOperador) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.loginPin(selectedOperador.id, enteredPin);
      authStorage.setToken(res.access_token);
      authStorage.setOperator(res.operador);
      onSuccess(res.operador);
    } catch (err: any) {
      setError(err.message || 'PIN incorrecto');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
        {canClose && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
          >
            ✕
          </button>
        )}

        {!selectedOperador ? (
          <div>
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white">¿Quién está atendiendo?</h2>
              <p className="text-sm text-slate-400 mt-1">
                Seleccione su usuario para registrar ventas
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {operadores.map((op) => (
                <button
                  key={op.id}
                  onClick={() => {
                    setSelectedOperador(op);
                    setPin('');
                    setError(null);
                  }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-700/60 hover:bg-slate-700 border border-slate-600/60 hover:border-emerald-500/50 text-left transition active:scale-98"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-600 text-white font-bold text-lg flex items-center justify-center shadow">
                    {op.nombre.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-base">{op.nombre}</h3>
                    <p className="text-xs text-slate-400">Ingresar con PIN de 4 dígitos</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  setSelectedOperador(null);
                  setPin('');
                  setError(null);
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
              >
                <ArrowLeft className="w-4 h-4" />
                Cambiar operador
              </button>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {selectedOperador.nombre}
              </span>
            </div>

            <div className="text-center mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-700 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white">Ingrese su PIN</h2>
              <p className="text-xs text-slate-400">4 dígitos numéricos</p>
            </div>

            {/* PIN Dots Display */}
            <div className="flex justify-center items-center gap-3 my-4">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full transition-all duration-150 ${
                    idx < pin.length
                      ? 'bg-emerald-400 scale-110 shadow-md shadow-emerald-500/50'
                      : 'bg-slate-700 border border-slate-600'
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 mb-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs justify-center animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleDigit(digit)}
                  disabled={loading}
                  className="h-14 rounded-xl bg-slate-700/80 hover:bg-slate-600 active:bg-emerald-600 border border-slate-600/50 text-xl font-bold text-white transition active:scale-95 flex items-center justify-center shadow-sm disabled:opacity-50"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={handleClear}
                disabled={loading}
                className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-400 transition flex items-center justify-center border border-slate-700 active:scale-95"
              >
                BORRAR
              </button>
              <button
                onClick={() => handleDigit('0')}
                disabled={loading}
                className="h-14 rounded-xl bg-slate-700/80 hover:bg-slate-600 active:bg-emerald-600 border border-slate-600/50 text-xl font-bold text-white transition active:scale-95 flex items-center justify-center shadow-sm disabled:opacity-50"
              >
                0
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition flex items-center justify-center border border-slate-700 active:scale-95"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
