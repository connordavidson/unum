import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
import type { SavedCity } from '../shared/types';

const MAX_RECENT_SEARCHES = 10;

interface UseSavedCitiesResult {
  recentSearches: SavedCity[];
  favoriteCity: SavedCity | null;
  loading: boolean;
  addRecentSearch: (city: SavedCity) => Promise<void>;
  toggleFavorite: (city: SavedCity) => Promise<void>;
  removeRecent: (name: string) => Promise<void>;
}

export function useSavedCities(): UseSavedCitiesResult {
  const [recentSearches, setRecentSearches] = useState<SavedCity[]>([]);
  const [favoriteCity, setFavoriteCity] = useState<SavedCity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [recents, favorite] = await Promise.all([
        getStoredJSON<SavedCity[]>(STORAGE_KEYS.RECENT_SEARCHES),
        getStoredJSON<SavedCity>(STORAGE_KEYS.FAVORITE_CITY),
      ]);
      setRecentSearches(recents || []);
      setFavoriteCity(favorite);
      setLoading(false);
    })();
  }, []);

  const addRecentSearch = useCallback(async (city: SavedCity) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter(
        (c) => c.name.toLowerCase() !== city.name.toLowerCase()
      );
      return [city, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    });
    // Persist outside setState to avoid async side effects in updater
    const current = await getStoredJSON<SavedCity[]>(STORAGE_KEYS.RECENT_SEARCHES) || [];
    const filtered = current.filter(
      (c) => c.name.toLowerCase() !== city.name.toLowerCase()
    );
    const updated = [city, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    await setStoredJSON(STORAGE_KEYS.RECENT_SEARCHES, updated);
  }, []);

  const toggleFavorite = useCallback(async (city: SavedCity) => {
    setFavoriteCity((prev) => {
      const isSame = prev?.name.toLowerCase() === city.name.toLowerCase();
      return isSame ? null : city;
    });
    // Persist
    const current = await getStoredJSON<SavedCity>(STORAGE_KEYS.FAVORITE_CITY);
    const isSame = current?.name.toLowerCase() === city.name.toLowerCase();
    if (isSame) {
      await AsyncStorage.removeItem(STORAGE_KEYS.FAVORITE_CITY);
    } else {
      await setStoredJSON(STORAGE_KEYS.FAVORITE_CITY, city);
    }
  }, []);

  const removeRecent = useCallback(async (name: string) => {
    setRecentSearches((prev) =>
      prev.filter((c) => c.name.toLowerCase() !== name.toLowerCase())
    );
    setFavoriteCity((prev) => {
      if (prev && prev.name.toLowerCase() === name.toLowerCase()) {
        return null;
      }
      return prev;
    });
    // Persist
    const current = await getStoredJSON<SavedCity[]>(STORAGE_KEYS.RECENT_SEARCHES) || [];
    await setStoredJSON(
      STORAGE_KEYS.RECENT_SEARCHES,
      current.filter((c) => c.name.toLowerCase() !== name.toLowerCase())
    );
    const currentFav = await getStoredJSON<SavedCity>(STORAGE_KEYS.FAVORITE_CITY);
    if (currentFav && currentFav.name.toLowerCase() === name.toLowerCase()) {
      await AsyncStorage.removeItem(STORAGE_KEYS.FAVORITE_CITY);
    }
  }, []);

  return {
    recentSearches,
    favoriteCity,
    loading,
    addRecentSearch,
    toggleFavorite,
    removeRecent,
  };
}
