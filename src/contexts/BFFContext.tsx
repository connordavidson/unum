/**
 * BFF Context
 *
 * React context provider for the BFF layer.
 * Provides initialization state and services to the app.
 */

import React, {
  createContext,
  useContext,
  ReactNode,
} from 'react';
import { useBFFInit, BFFInitState } from '../hooks/useBFFInit';
import { useNetworkStatus, UseNetworkStatusResult } from '../hooks/useNetworkStatus';
import { useSync, UseSyncResult } from '../hooks/useSync';
import { FEATURE_FLAGS } from '../shared/constants';

// ============ Types ============

export interface BFFContextValue {
  // Initialization
  init: BFFInitState & {
    initialize: () => Promise<void>;
    reset: () => Promise<void>;
  };
  // Network
  network: UseNetworkStatusResult;
  // Sync (only available when initialized)
  sync: UseSyncResult | null;
  // Feature flags
  features: typeof FEATURE_FLAGS;
}

// ============ Context ============

const BFFContext = createContext<BFFContextValue | null>(null);

// ============ Provider ============

export interface BFFProviderProps {
  children: ReactNode;
  enableBackgroundSync?: boolean;
}

export function BFFProvider({
  children,
  enableBackgroundSync = false,
}: BFFProviderProps): React.ReactElement {
  // Initialize BFF layer
  const init = useBFFInit({
    autoInit: true,
    enableBackgroundSync,
  });

  // Network status
  const network = useNetworkStatus();

  // Sync (only when initialized and deviceId is available)
  const sync = init.isInitialized && init.deviceId
    ? useSyncInternal(init.deviceId)
    : null;

  const value: BFFContextValue = {
    init,
    network,
    sync,
    features: FEATURE_FLAGS,
  };

  return (
    <BFFContext.Provider value={value}>
      {children}
    </BFFContext.Provider>
  );
}

// Internal hook to avoid conditional hook call
function useSyncInternal(deviceId: string): UseSyncResult {
  return useSync({ deviceId, autoStart: false });
}

// ============ Hooks ============

/**
 * Access the BFF context
 */
export function useBFF(): BFFContextValue {
  const context = useContext(BFFContext);
  if (!context) {
    throw new Error('useBFF must be used within a BFFProvider');
  }
  return context;
}

/**
 * Check if BFF is initialized
 */
export function useBFFReady(): boolean {
  const { init } = useBFF();
  return init.isInitialized;
}

/**
 * Get the current device ID
 */
export function useBFFDeviceId(): string | null {
  const { init } = useBFF();
  return init.deviceId;
}

/**
 * Get network status
 */
export function useBFFNetwork(): UseNetworkStatusResult {
  const { network } = useBFF();
  return network;
}

/**
 * Get sync utilities (throws if not initialized)
 */
export function useBFFSync(): UseSyncResult {
  const { sync, init } = useBFF();
  if (!sync) {
    throw new Error('BFF is not initialized or deviceId is not available');
  }
  return sync;
}

// ============ Utility Component ============

/**
 * Component that only renders children when BFF is initialized
 */
export function BFFReady({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}): React.ReactElement | null {
  const { init } = useBFF();

  if (init.isInitializing) {
    return fallback as React.ReactElement | null;
  }

  if (init.error) {
    console.error('BFF initialization error:', init.error);
    return fallback as React.ReactElement | null;
  }

  if (!init.isInitialized) {
    return fallback as React.ReactElement | null;
  }

  return <>{children}</>;
}
