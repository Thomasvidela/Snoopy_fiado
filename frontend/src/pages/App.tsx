import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { ClientList } from '../components/ClientList';
import { ClientDetail } from '../components/ClientDetail';
import { OperatorPinModal } from '../components/OperatorPinModal';
import { MovementModal } from '../components/MovementModal';
import { WhatsAppModal } from '../components/WhatsAppModal';
import { NewClientModal } from '../components/NewClientModal';
import { ManageOperatorsModal } from '../components/ManageOperatorsModal';
import { Cliente, Movimiento, MovimientoCreatePayload, Operador } from '../types';
import { api, authStorage } from '../api/client';

export const App: React.FC = () => {
  const [currentOperator, setCurrentOperator] = useState<Operador | null>(authStorage.getOperator());
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(!authStorage.getToken());
  
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loadingClientes, setLoadingClientes] = useState<boolean>(false);
  const [loadingMovimientos, setLoadingMovimientos] = useState<boolean>(false);

  // Network online/offline status
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showBackOnlineToast, setShowBackOnlineToast] = useState<boolean>(false);

  // Modals state
  const [movementModalOpen, setMovementModalOpen] = useState<boolean>(false);
  const [movementDefaultTipo, setMovementDefaultTipo] = useState<'CARGO' | 'PAGO'>('CARGO');
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState<boolean>(false);
  const [newClientModalOpen, setNewClientModalOpen] = useState<boolean>(false);
  const [manageOperatorsOpen, setManageOperatorsOpen] = useState<boolean>(false);

  // Mobile view state: 'list' or 'detail'
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Load clients
  const fetchClientes = useCallback(async (query?: string) => {
    setLoadingClientes(true);
    try {
      const res = await api.getClientes(query);
      setClientes(res.items);
      // If a client was selected, update its reference
      setSelectedCliente((prev) => {
        if (!prev) return res.items.length > 0 && window.innerWidth >= 768 ? res.items[0] : null;
        const updated = res.items.find((c) => c.id === prev.id);
        return updated || prev;
      });
    } catch (err) {
      console.error('Error al cargar clientes:', err);
    } finally {
      setLoadingClientes(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClientes(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchClientes]);

  // Load movements when selected client changes
  const fetchMovimientos = useCallback(async (clienteId: number) => {
    setLoadingMovimientos(true);
    try {
      const data = await api.getMovimientos(clienteId);
      setMovimientos(data);
    } catch (err) {
      console.error('Error al cargar movimientos:', err);
    } finally {
      setLoadingMovimientos(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCliente) {
      fetchMovimientos(selectedCliente.id);
    } else {
      setMovimientos([]);
    }
  }, [selectedCliente, fetchMovimientos]);

  // Handle auth expiration
  useEffect(() => {
    const handleAuthExpired = () => {
      setCurrentOperator(null);
      setPinModalOpen(true);
    };
    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, []);

  // Listen to network status changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBackOnlineToast(true);
      const timer = setTimeout(() => setShowBackOnlineToast(false), 3500);
      return () => clearTimeout(timer);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Selection handler
  const handleSelectCliente = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setMobileView('detail');
  };

  // Create movement handler
  const handleCreateMovimiento = async (payload: MovimientoCreatePayload) => {
    if (!selectedCliente) return;
    await api.createMovimiento(selectedCliente.id, payload);
    // Refresh both client data (for saldo_actual) and movements
    await Promise.all([
      fetchClientes(searchQuery),
      fetchMovimientos(selectedCliente.id),
    ]);
  };

  // Annul movement handler
  const handleAnularMovimiento = async (movimientoId: number) => {
    if (!selectedCliente) return;
    await api.anularMovimiento(movimientoId);
    await Promise.all([
      fetchClientes(searchQuery),
      fetchMovimientos(selectedCliente.id),
    ]);
  };

  // Toggle active status for client
  const handleToggleClienteActivo = async (clienteId: number) => {
    const updated = await api.toggleClienteActivo(clienteId);
    setClientes((prev) => prev.map((c) => (c.id === clienteId ? updated : c)));
    setSelectedCliente((prev) => (prev && prev.id === clienteId ? updated : prev));
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* Top Navigation */}
      <Navbar
        currentOperator={currentOperator}
        onSwitchOperator={() => setPinModalOpen(true)}
        onManageOperators={() => setManageOperatorsOpen(true)}
        onNewClient={() => setNewClientModalOpen(true)}
      />

      {/* Offline / Online Network Status Banner */}
      {!isOnline && (
        <div className="bg-amber-600/95 text-white text-xs py-1.5 px-4 text-center font-medium flex items-center justify-center gap-2 shadow-sm animate-pulse z-20">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Sin conexión a internet. Verifique su red Wi-Fi o datos móviles.</span>
        </div>
      )}
      {showBackOnlineToast && (
        <div className="bg-emerald-600 text-white text-xs py-1.5 px-4 text-center font-medium flex items-center justify-center gap-2 shadow-sm z-20 transition-all animate-in fade-in">
          <Wifi className="w-4 h-4 shrink-0" />
          <span>Conexión restablecida con éxito</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Desktop Split-View / Mobile Toggle */}
        <div className="w-full h-full flex flex-col md:flex-row">
          {/* Left Panel: Client List */}
          <div
            className={`w-full md:w-5/12 lg:w-4/12 h-full ${
              mobileView === 'detail' ? 'hidden md:flex' : 'flex'
            } flex-col`}
          >
            <ClientList
              clientes={clientes}
              selectedClienteId={selectedCliente?.id || null}
              onSelectCliente={handleSelectCliente}
              loading={loadingClientes}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>

          {/* Right Panel: Client Ledger Detail */}
          <div
            className={`w-full md:w-7/12 lg:w-8/12 h-full ${
              mobileView === 'list' ? 'hidden md:flex' : 'flex'
            } flex-col`}
          >
            <ClientDetail
              cliente={selectedCliente}
              movimientos={movimientos}
              loadingMovimientos={loadingMovimientos}
              onBack={() => setMobileView('list')}
              onOpenMovementModal={(tipo) => {
                setMovementDefaultTipo(tipo);
                setMovementModalOpen(true);
              }}
              onOpenWhatsAppModal={() => setWhatsAppModalOpen(true)}
              onAnularMovimiento={handleAnularMovimiento}
              onToggleActivo={handleToggleClienteActivo}
            />
          </div>
        </div>
      </main>

      {/* Operator PIN Modal */}
      <OperatorPinModal
        isOpen={pinModalOpen}
        canClose={Boolean(currentOperator)}
        onClose={() => setPinModalOpen(false)}
        onSuccess={(op) => {
          setCurrentOperator(op);
          setPinModalOpen(false);
          fetchClientes(searchQuery);
        }}
      />

      {/* Manage Operators Modal */}
      <ManageOperatorsModal
        isOpen={manageOperatorsOpen}
        currentOperator={currentOperator}
        onClose={() => setManageOperatorsOpen(false)}
        onOperatorsChanged={() => {
          // If current operator was modified, verify credentials
          api.getMe()
            .then((op) => setCurrentOperator(op))
            .catch(() => {
              // Current operator was disabled or removed
              authStorage.clear();
              setCurrentOperator(null);
              setPinModalOpen(true);
            });
        }}
      />

      {/* 3-Touch Fast Movement Modal */}
      <MovementModal
        isOpen={movementModalOpen}
        cliente={selectedCliente}
        defaultTipo={movementDefaultTipo}
        onClose={() => setMovementModalOpen(false)}
        onSubmit={handleCreateMovimiento}
      />

      {/* WhatsApp Monthly Statement Modal */}
      <WhatsAppModal
        isOpen={whatsAppModalOpen}
        cliente={selectedCliente}
        onClose={() => setWhatsAppModalOpen(false)}
      />

      {/* New Client Modal */}
      <NewClientModal
        isOpen={newClientModalOpen}
        onClose={() => setNewClientModalOpen(false)}
        onSuccess={(nuevo) => {
          fetchClientes('');
          setSelectedCliente(nuevo);
          setMobileView('detail');
        }}
      />
    </div>
  );
};
