/**
 * useMapSearch Hook
 *
 * Handles location search functionality for the map.
 * Uses Expo Location for geocoding search queries.
 */

import { useState, useCallback, RefObject } from 'react';
import * as Location from 'expo-location';
import type MapView from 'react-native-maps';

interface UseMapSearchConfig {
  mapRef: RefObject<MapView | null>;
}

interface UseMapSearchResult {
  /** Whether the search modal is visible */
  searchVisible: boolean;
  /** Show/hide the search modal */
  setSearchVisible: (visible: boolean) => void;
  /** Current search query text */
  searchQuery: string;
  /** Update the search query */
  setSearchQuery: (query: string) => void;
  /** Whether a search is in progress */
  searching: boolean;
  /** Error message from last search, if any */
  searchError: string | null;
  /** Execute the search and animate map to result */
  handleSearch: () => Promise<void>;
}

export function useMapSearch({ mapRef }: UseMapSearchConfig): UseMapSearchResult {
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);

    try {
      const results = await Location.geocodeAsync(searchQuery);
      if (results.length > 0) {
        const { latitude, longitude } = results[0];
        mapRef.current?.animateToRegion(
          {
            latitude,
            longitude,
            latitudeDelta: 0.15,
            longitudeDelta: 0.15,
          },
          500
        );
        setSearchVisible(false);
        setSearchQuery('');
      } else {
        setSearchError('Location not found');
      }
    } catch (error) {
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, mapRef]);

  return {
    searchVisible,
    setSearchVisible,
    searchQuery,
    setSearchQuery,
    searching,
    searchError,
    handleSearch,
  };
}
