import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, LOCATION_CONFIG, MAP_CONFIG } from '../shared/constants';
import type { Coordinates } from '../shared/types';

interface UseLocationResult {
  position: Coordinates | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useLocation(): UseLocationResult {
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const getCachedLocation = useCallback(async (): Promise<Coordinates | null> => {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.LOCATION);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignore cache errors
    }
    return null;
  }, []);

  const cacheLocation = useCallback(async (coords: Coordinates) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LOCATION, JSON.stringify(coords));
    } catch {
      // Ignore cache errors
    }
  }, []);

  const fetchLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setError('Location permission denied');
        // Fall back to cached or default
        const cached = await getCachedLocation();
        setPosition(cached || MAP_CONFIG.DEFAULT_CENTER);
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords: Coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setPosition(coords);
      await cacheLocation(coords);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get location';
      setError(message);

      // Fall back to cached or default
      const cached = await getCachedLocation();
      setPosition(cached || MAP_CONFIG.DEFAULT_CENTER);
    } finally {
      setLoading(false);
    }
  }, [getCachedLocation, cacheLocation]);

  // Initial fetch
  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  // Periodic updates
  useEffect(() => {
    const interval = setInterval(fetchLocation, LOCATION_CONFIG.UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLocation]);

  return {
    position,
    error,
    loading,
    refresh: fetchLocation,
  };
}

/**
 * Get cached location synchronously for initial map center
 * Note: This is async in RN, so we return the default if not available
 */
export async function getCachedLocationAsync(): Promise<Coordinates> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.LOCATION);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore
  }
  return MAP_CONFIG.DEFAULT_CENTER;
}
