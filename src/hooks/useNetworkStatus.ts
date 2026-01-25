/**
 * useNetworkStatus Hook
 *
 * React hook for monitoring network connectivity.
 * Uses expo-network for reliable cross-platform network detection.
 */

import { useState, useEffect, useCallback } from 'react';
import * as Network from 'expo-network';

// ============ Types ============

export type NetworkType = 'wifi' | 'cellular' | 'unknown' | 'none';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: NetworkType;
}

export interface UseNetworkStatusResult {
  // State
  isOnline: boolean;
  isConnected: boolean;
  isInternetReachable: boolean | null;
  networkType: NetworkType;

  // Actions
  refresh: () => Promise<void>;
}

// ============ Hook Implementation ============

/**
 * Hook for monitoring network connectivity
 */
export function useNetworkStatus(): UseNetworkStatusResult {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: null,
    type: 'unknown',
  });

  // Fetch current network state
  const fetchNetworkState = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();

      let type: NetworkType = 'unknown';
      if (state.type === Network.NetworkStateType.WIFI) {
        type = 'wifi';
      } else if (state.type === Network.NetworkStateType.CELLULAR) {
        type = 'cellular';
      } else if (state.type === Network.NetworkStateType.NONE) {
        type = 'none';
      }

      setStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? null,
        type,
      });
    } catch (error) {
      console.error('Failed to get network state:', error);
      // Assume connected on error (optimistic)
      setStatus({
        isConnected: true,
        isInternetReachable: null,
        type: 'unknown',
      });
    }
  }, []);

  // Initial fetch and subscribe to changes
  useEffect(() => {
    fetchNetworkState();

    // Poll for network changes (expo-network doesn't have a subscription API)
    // In a production app, consider using react-native-netinfo for real-time updates
    const interval = setInterval(fetchNetworkState, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchNetworkState]);

  // Computed online status
  const isOnline = status.isConnected && (status.isInternetReachable !== false);

  return {
    isOnline,
    isConnected: status.isConnected,
    isInternetReachable: status.isInternetReachable,
    networkType: status.type,
    refresh: fetchNetworkState,
  };
}

/**
 * Hook that triggers a callback when network status changes
 */
export function useNetworkStatusChange(
  onChange: (isOnline: boolean) => void
): void {
  const { isOnline } = useNetworkStatus();
  const [prevIsOnline, setPrevIsOnline] = useState(isOnline);

  useEffect(() => {
    if (isOnline !== prevIsOnline) {
      setPrevIsOnline(isOnline);
      onChange(isOnline);
    }
  }, [isOnline, prevIsOnline, onChange]);
}
