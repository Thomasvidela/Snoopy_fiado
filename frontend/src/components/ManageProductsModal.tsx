import React, { useState, useEffect } from 'react';
import { Package, X, Plus, Edit2, Check, AlertCircle, Trash2, Power, DollarSign } from 'lucide-react';
import { Producto } from '../types';
import { api } from '../api/client';
import { formatCurrency } from '../utils/format';
import { hapticTap, hapticSuccess, hapticError } from '../utils/haptics';

interface ManageProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductsUpdated?: () => void;
}

export const ManageProductsModal: React.FC<ManageProductsModalProps> = ({
  isOpen,
  onClose,
  onProductsUpdated,
}) => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // New product form
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [nuevoNombre, setNuevoNombre] = useState<string>('');
  const [nuevoPrecio, setNuevoPrecio] = useState<string>('');
  const [nuevaUnidad, setNuevaUnidad] = useState<string>('unidad');
  const [guardando, setGuardando] = useState<boolean>(false);

  // Editing price inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingPrecio, setEditingPrecio] = useState<string>('');

  const cargarProductos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProductos(true);
      setProductos(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      cargarProductos();
      setShowAddForm(false);
      setEditingId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCrearProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim() || !nuevoPrecio.trim()) {
      setError('Nombre y precio son obligatorios.');
      return;
    }

    const precioNum = parseFloat(nuevoPrecio.replace(',', '.'));
    if (isNaN(precioNum) || precioNum <= 0) {
      setError('El precio debe ser un número mayor a cero.');
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      await api.createProducto({
        nombre: nuevoNombre.trim(),
        precio_actual: precioNum.toString(),
        unidad: nuevaUnidad.trim() || 'unidad',
      });
      hapticSuccess();
      setNuevoNombre('');
      setNuevoPrecio('');
      setNuevaUnidad('unidad');
      setShowAddForm(false);
      await cargarProductos();
      if (onProductsUpdated) onProductsUpdated();
    } catch (err: any) {
      hapticError();
      setError(err.message || 'Error al crear producto');
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardarPrecio = async (producto: Producto) => {
    const precioNum = parseFloat(editingPrecio.replace(',', '.'));
    if (isNaN(precioNum) || precioNum <= 0) {
      hapticError();
      setError('Ingrese un precio válido mayor a 0');
      return;
    }

    try {
      await api.updateProducto(producto.id, {
        precio_actual: precioNum.toString(),
      });
      hapticSuccess();
      setEditingId(null);
      await cargarProductos();
      if (onProductsUpdated) onProductsUpdated();
    } catch (err: any) {
      hapticError();
      setError(err.message || 'Error al actualizar precio');
    }
  };

  const handleToggleActivo = async (producto: Producto) => {
    hapticTap(15);
    try {
      await api.updateProducto(producto.id, {
        activo: !producto.activo,
      });
      await cargarProductos();
      if (onProductsUpdated) onProductsUpdated();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar estado');
    }
  };

  const handleEliminar = async (producto: Producto) => {
    if (!window.confirm(`¿Seguro que deseas eliminar o desactivar "${producto.nombre}"?`)) {
      return;
    }
    hapticTap(20);
    try {
      await api.deleteProducto(producto.id);
      await cargarProductos();
      if (onProductsUpdated) onProductsUpdated();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar producto');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Productos y Precios Dinámicos</h2>
              <p className="text-xs text-slate-400">
                Artículos fijos cotizados al valor actual al momento de cobrar (Garrafas, etc.)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Content list */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          {loading && productos.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
              Cargando productos...
            </div>
          ) : productos.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm bg-slate-850/60 rounded-xl border border-slate-700/60">
              No hay productos registrados aún. Agrega productos como "Garrafa de gas 10kg".
            </div>
          ) : (
            productos.map((prod) => {
              const isEditing = editingId === prod.id;
              return (
                <div
                  key={prod.id}
                  className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    prod.activo
                      ? 'bg-slate-850/80 border-slate-700 hover:border-slate-600'
                      : 'bg-slate-900/60 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{prod.nombre}</span>
                      {!prod.activo && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Inactivo
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700/60">
                        {prod.unidad}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-slate-400">Cotización vigente:</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            autoFocus
                            value={editingPrecio}
                            onChange={(e) => setEditingPrecio(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleGuardarPrecio(prod);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="w-28 px-2 py-1 rounded bg-slate-900 border border-emerald-500 text-white font-mono text-sm focus:outline-none"
                            placeholder="0.00"
                          />
                          <button
                            onClick={() => handleGuardarPrecio(prod)}
                            className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                            title="Guardar precio"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded bg-slate-700 text-slate-300 hover:text-white"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-emerald-400 font-mono">
                            {formatCurrency(prod.precio_actual)}
                          </span>
                          <button
                            onClick={() => {
                              hapticTap(15);
                              setEditingId(prod.id);
                              setEditingPrecio(prod.precio_actual);
                            }}
                            className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-700/60 rounded transition"
                            title="Modificar precio actual"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => handleToggleActivo(prod)}
                      className={`p-2 rounded-xl border text-xs font-medium transition ${
                        prod.activo
                          ? 'bg-slate-700/50 hover:bg-slate-700 text-slate-300 border-slate-600'
                          : 'bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-400 border-emerald-600/40'
                      }`}
                      title={prod.activo ? 'Desactivar producto' : 'Activar producto'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEliminar(prod)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-600/40 transition"
                      title="Eliminar producto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* New product form toggle */}
          {!showAddForm ? (
            <button
              onClick={() => {
                hapticTap(15);
                setShowAddForm(true);
              }}
              className="w-full py-3 px-4 rounded-xl border border-dashed border-slate-700 hover:border-emerald-500/60 text-slate-300 hover:text-white bg-slate-850/40 hover:bg-slate-800 transition flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>+ Agregar Nuevo Producto Fijo</span>
            </button>
          ) : (
            <form onSubmit={handleCrearProducto} className="p-4 rounded-xl bg-slate-850 border border-slate-700 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Nuevo Producto de Precio Dinámico
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nombre del Producto <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Garrafa de gas 10kg, Bidón 20L"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Precio Actual ($) <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="12000.00"
                      value={nuevoPrecio}
                      onChange={(e) => setNuevoPrecio(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Unidad / Presentación
                  </label>
                  <input
                    type="text"
                    placeholder="unidad, garrafa, bidón"
                    value={nuevaUnidad}
                    onChange={(e) => setNuevaUnidad(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Crear Producto'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-850 border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-400 px-5">
          <span>Cuando cambias un precio, se actualiza automáticamente en las libretas pendientes.</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
