import React, { useState, useEffect } from 'react';
import { Package, X, AlertCircle, Plus, Minus, Tag } from 'lucide-react';
import { Cliente, Producto, ClienteArticulo } from '../types';
import { api } from '../api/client';
import { formatCurrency } from '../utils/format';
import { hapticTap, hapticSuccess, hapticError } from '../utils/haptics';

interface AddArticleModalProps {
  isOpen: boolean;
  cliente: Cliente | null;
  onClose: () => void;
  onSuccess: (articulo: ClienteArticulo) => void;
}

export const AddArticleModal: React.FC<AddArticleModalProps> = ({
  isOpen,
  cliente,
  onClose,
  onSuccess,
}) => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [selectedProductoId, setSelectedProductoId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState<number>(1);
  const [nota, setNota] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      cargarProductos();
      setCantidad(1);
      setNota('');
      setError(null);
    }
  }, [isOpen]);

  const cargarProductos = async () => {
    setLoading(true);
    try {
      const data = await api.getProductos(false);
      setProductos(data);
      if (data.length > 0) {
        setSelectedProductoId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !cliente) return null;

  const selectedProd = productos.find((p) => p.id === selectedProductoId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductoId) {
      setError('Debes seleccionar un producto.');
      return;
    }
    if (cantidad <= 0) {
      setError('La cantidad debe ser mayor a 0.');
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const created = await api.createClienteArticulo(cliente.id, {
        producto_id: selectedProductoId,
        cantidad: cantidad.toString(),
        nota: nota.trim() || undefined,
      });
      hapticSuccess();
      onClose();
      onSuccess(created);
    } catch (err: any) {
      hapticError();
      setError(err.message || 'Error al anotar producto');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Anotar Producto Fijo</h2>
            <p className="text-xs text-slate-400">
              Libreta de: <strong className="text-white">{cliente.nombre}</strong>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selector de Producto */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Seleccionar Producto
            </label>
            {loading ? (
              <div className="p-3 text-xs text-slate-400 text-center">Cargando productos...</div>
            ) : productos.length === 0 ? (
              <div className="p-3 text-xs text-amber-300 bg-amber-500/10 rounded-xl border border-amber-500/20">
                No hay productos configurados aún. Agrega productos desde el menú "Productos" en la barra superior.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {productos.map((p) => {
                  const isSelected = selectedProductoId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        hapticTap(15);
                        setSelectedProductoId(p.id);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500 text-white shadow-sm'
                          : 'bg-slate-850 hover:bg-slate-700/60 border-slate-700 text-slate-300'
                      }`}
                    >
                      <span className="font-semibold text-xs leading-tight line-clamp-1">{p.nombre}</span>
                      <span className="text-xs font-mono font-bold text-emerald-400 mt-1">
                        {formatCurrency(p.precio_actual)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cantidad Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Cantidad ({selectedProd?.unidad || 'unidades'})
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  hapticTap(15);
                  if (cantidad > 1) setCantidad(cantidad - 1);
                }}
                disabled={cantidad <= 1}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white flex items-center justify-center font-bold text-lg transition"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="flex-1 py-2 rounded-xl bg-slate-900 border border-slate-700 text-center font-mono font-extrabold text-xl text-white">
                {cantidad}
              </div>

              <button
                type="button"
                onClick={() => {
                  hapticTap(15);
                  setCantidad(cantidad + 1);
                }}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center font-bold text-lg transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Nota Opcional */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Nota / Detalle <span className="text-slate-500 text-[10px]">(Opcional)</span>
            </label>
            <div className="relative">
              <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ej: Envase azul YPF, Dejó seña"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Explicación de cotización dinámica */}
          <div className="p-3 rounded-xl bg-slate-850/80 border border-slate-700/60 text-slate-300 text-xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span>Cotización de referencia actual:</span>
              <strong className="text-emerald-400 font-mono">
                {selectedProd ? formatCurrency(parseFloat(selectedProd.precio_actual) * cantidad) : '$0,00'}
              </strong>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              💡 <strong>Regla contable:</strong> Este producto no congela pesos hoy. Se asentará al valor vigente de la garrafa en el momento exacto en que se liquide o cobre la cuenta.
            </p>
          </div>

          {/* Submit buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || !selectedProductoId}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-950/40 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {guardando ? 'Anotando...' : 'Anotar en Libreta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
