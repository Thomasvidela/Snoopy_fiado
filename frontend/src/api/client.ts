import {
  CerrarMesResponse,
  Cliente,
  ClienteArticulo,
  ClienteArticuloCreatePayload,
  ClienteCreatePayload,
  ListadoClientesResponse,
  LoginResponse,
  Movimiento,
  MovimientoCreatePayload,
  Operador,
  OperadorCreatePayload,
  Producto,
  ProductoCreatePayload,
  ProductoUpdatePayload,
  ResumenMensual,
} from '../types';

const TOKEN_KEY = 'fiados_auth_token';
const OPERATOR_KEY = 'fiados_current_operator';
const STORE_KEY = 'snoopy_store_key';

export const storeAuth = {
  getStoreKey(): string | null {
    return localStorage.getItem(STORE_KEY);
  },
  setStoreKey(key: string): void {
    localStorage.setItem(STORE_KEY, key);
  },
  isAuthorized(): boolean {
    return !!localStorage.getItem(STORE_KEY);
  },
  clear(): void {
    localStorage.removeItem(STORE_KEY);
  }
};

export const authStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  removeToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
  getOperator(): Operador | null {
    const raw = localStorage.getItem(OPERATOR_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setOperator(op: Operador): void {
    localStorage.setItem(OPERATOR_KEY, JSON.stringify(op));
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(OPERATOR_KEY);
  }
};

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const storeKey = storeAuth.getStoreKey();
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (storeKey) {
    headers.set('X-Store-Key', storeKey);
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `Error HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.detail) {
        errorMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // Ignore fallback
    }

    if (response.status === 401) {
      if (errorMsg.includes('Dispositivo no autorizado')) {
        storeAuth.clear();
        window.dispatchEvent(new CustomEvent('store:unauthorized'));
      } else {
        authStorage.clear();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }

    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // Autenticación de Comercio y Operadores
  verificarClaveLocal: (clave: string) =>
    apiRequest<{ ok: boolean; mensaje: string }>('/auth/verificar-clave-local', {
      method: 'POST',
      body: JSON.stringify({ clave }),
    }),
  getOperadores: (incluirInactivos: boolean = false) =>
    apiRequest<Operador[]>(`/auth/operadores${incluirInactivos ? '?incluir_inactivos=true' : ''}`),
  createOperador: (payload: OperadorCreatePayload) =>
    apiRequest<Operador>('/auth/operadores', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteOperador: (operadorId: number) =>
    apiRequest<{ ok: boolean; mensaje: string; eliminado_fisicamente: boolean }>(
      `/auth/operadores/${operadorId}`,
      { method: 'DELETE' }
    ),
  loginPin: (usuario_id: number, pin: string) =>
    apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario_id, pin }),
    }),
  getMe: () => apiRequest<Operador>('/auth/me'),

  // Clientes
  getClientes: (q?: string, soloActivos?: boolean) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (soloActivos !== undefined) params.set('solo_activos', String(soloActivos));
    params.set('limite', '200');
    return apiRequest<ListadoClientesResponse>(`/clientes?${params.toString()}`);
  },
  getCliente: (id: number) => apiRequest<Cliente>(`/clientes/${id}`),
  createCliente: (payload: ClienteCreatePayload) =>
    apiRequest<Cliente>('/clientes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCliente: (id: number, payload: Partial<ClienteCreatePayload> & { activo?: boolean }) =>
    apiRequest<Cliente>(`/clientes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  toggleClienteActivo: (id: number) =>
    apiRequest<Cliente>(`/clientes/${id}/toggle-activo`, {
      method: 'PATCH',
    }),
  getResumen: (clienteId: number, mes?: string) => {
    const params = new URLSearchParams();
    if (mes) params.set('mes', mes);
    return apiRequest<ResumenMensual>(`/clientes/${clienteId}/resumen?${params.toString()}`);
  },
  cerrarMesCliente: (clienteId: number, nota_cierre?: string) =>
    apiRequest<CerrarMesResponse>(`/clientes/${clienteId}/cerrar-mes`, {
      method: 'POST',
      body: JSON.stringify({ nota_cierre }),
    }),

  // Movimientos
  getMovimientos: (clienteId: number) =>
    apiRequest<Movimiento[]>(`/clientes/${clienteId}/movimientos?limite=100`),
  createMovimiento: (clienteId: number, payload: MovimientoCreatePayload) =>
    apiRequest<Movimiento>(`/clientes/${clienteId}/movimientos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  anularMovimiento: (movimientoId: number) =>
    apiRequest<Movimiento>(`/movimientos/${movimientoId}/anular`, {
      method: 'POST',
    }),
  exportarExcel: async (clienteId: number, mes?: string, clienteNombre?: string) => {
    const params = new URLSearchParams();
    if (mes) params.set('mes', mes);
    const token = authStorage.getToken();
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`/api/clientes/${clienteId}/exportar-excel?${params.toString()}`, {
      headers,
    });

    if (!response.ok) {
      throw new Error('Error al descargar el archivo Excel');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sufijo = mes || 'Completo';
    const nombreLimpio = (clienteNombre || `Cliente_${clienteId}`).replace(/\s+/g, '_');
    a.download = `Libreta_${nombreLimpio}_${sufijo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  // Productos de Precio Dinámico
  getProductos: (incluirInactivos: boolean = false) =>
    apiRequest<Producto[]>(`/productos${incluirInactivos ? '?incluir_inactivos=true' : ''}`),
  createProducto: (payload: ProductoCreatePayload) =>
    apiRequest<Producto>('/productos', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProducto: (id: number, payload: ProductoUpdatePayload) =>
    apiRequest<Producto>(`/productos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteProducto: (id: number) =>
    apiRequest<{ ok: boolean; mensaje: string; eliminado_fisicamente: boolean }>(
      `/productos/${id}`,
      { method: 'DELETE' }
    ),

  // Artículos Dinámicos por Cliente (Fiados en Especies)
  getClienteArticulos: (clienteId: number, soloPendientes: boolean = true) =>
    apiRequest<ClienteArticulo[]>(
      `/clientes/${clienteId}/articulos${soloPendientes ? '?solo_pendientes=true' : '?solo_pendientes=false'}`
    ),
  createClienteArticulo: (clienteId: number, payload: ClienteArticuloCreatePayload) =>
    apiRequest<ClienteArticulo>(`/clientes/${clienteId}/articulos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  liquidarClienteArticulos: (
    clienteId: number,
    payload: { articulo_ids?: number[]; nota_adicional?: string } = {}
  ) =>
    apiRequest<{
      ok: boolean;
      mensaje: string;
      total_liquidado: string;
      nuevo_saldo_actual: string;
      articulos_liquidados: ClienteArticulo[];
    }>(`/clientes/${clienteId}/articulos/liquidar`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cancelarClienteArticulo: (articuloId: number) =>
    apiRequest<{ ok: boolean; mensaje: string }>(`/articulos/${articuloId}`, {
      method: 'DELETE',
    }),
};
