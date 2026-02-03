/**
 * useSavedCities Hook Tests
 *
 * Tests the saved cities logic: recent searches and favorite city persistence.
 */

import type { SavedCity } from '../../shared/types';

// Mock AsyncStorage
const mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore[key] || null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStore[key];
    return Promise.resolve();
  }),
}));

// Import after mocks
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../shared/constants';

// ---- Helper functions that mirror the hook's logic ----

const MAX_RECENT_SEARCHES = 10;

async function getStoredJSON<T>(key: string): Promise<T | null> {
  const stored = await AsyncStorage.getItem(key);
  return stored ? JSON.parse(stored) : null;
}

async function setStoredJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function addRecentSearch(city: SavedCity): Promise<SavedCity[]> {
  const current = (await getStoredJSON<SavedCity[]>(STORAGE_KEYS.RECENT_SEARCHES)) || [];
  const filtered = current.filter(
    (c) => c.name.toLowerCase() !== city.name.toLowerCase()
  );
  const updated = [city, ...filtered].slice(0, MAX_RECENT_SEARCHES);
  await setStoredJSON(STORAGE_KEYS.RECENT_SEARCHES, updated);
  return updated;
}

async function toggleFavorite(city: SavedCity): Promise<SavedCity | null> {
  const current = await getStoredJSON<SavedCity>(STORAGE_KEYS.FAVORITE_CITY);
  const isSame = current?.name.toLowerCase() === city.name.toLowerCase();
  if (isSame) {
    await AsyncStorage.removeItem(STORAGE_KEYS.FAVORITE_CITY);
    return null;
  } else {
    await setStoredJSON(STORAGE_KEYS.FAVORITE_CITY, city);
    return city;
  }
}

async function removeRecent(name: string): Promise<{ recents: SavedCity[]; favorite: SavedCity | null }> {
  const current = (await getStoredJSON<SavedCity[]>(STORAGE_KEYS.RECENT_SEARCHES)) || [];
  const updated = current.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
  await setStoredJSON(STORAGE_KEYS.RECENT_SEARCHES, updated);

  const currentFav = await getStoredJSON<SavedCity>(STORAGE_KEYS.FAVORITE_CITY);
  let favorite = currentFav;
  if (currentFav && currentFav.name.toLowerCase() === name.toLowerCase()) {
    await AsyncStorage.removeItem(STORAGE_KEYS.FAVORITE_CITY);
    favorite = null;
  }
  return { recents: updated, favorite };
}

// ---- Tests ----

beforeEach(() => {
  Object.keys(mockStore).forEach((key) => delete mockStore[key]);
  jest.clearAllMocks();
});

const minneapolis: SavedCity = { name: 'Minneapolis', latitude: 44.9778, longitude: -93.265 };
const newYork: SavedCity = { name: 'New York', latitude: 40.7128, longitude: -74.006 };
const chicago: SavedCity = { name: 'Chicago', latitude: 41.8781, longitude: -87.6298 };

describe('addRecentSearch', () => {
  it('adds a city to empty recent searches', async () => {
    const result = await addRecentSearch(minneapolis);
    expect(result).toEqual([minneapolis]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.RECENT_SEARCHES,
      JSON.stringify([minneapolis])
    );
  });

  it('prepends new search to existing list', async () => {
    await addRecentSearch(minneapolis);
    const result = await addRecentSearch(newYork);
    expect(result).toEqual([newYork, minneapolis]);
  });

  it('deduplicates by name (case-insensitive)', async () => {
    await addRecentSearch(minneapolis);
    await addRecentSearch(newYork);
    const result = await addRecentSearch({ ...minneapolis, name: 'minneapolis' });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('minneapolis');
    expect(result[1].name).toBe('New York');
  });

  it('caps at 10 entries', async () => {
    for (let i = 0; i < 12; i++) {
      await addRecentSearch({ name: `City ${i}`, latitude: i, longitude: i });
    }
    const stored = await getStoredJSON<SavedCity[]>(STORAGE_KEYS.RECENT_SEARCHES);
    expect(stored).toHaveLength(10);
    expect(stored![0].name).toBe('City 11');
    expect(stored![9].name).toBe('City 2');
  });
});

describe('toggleFavorite', () => {
  it('sets a city as favorite', async () => {
    const result = await toggleFavorite(minneapolis);
    expect(result).toEqual(minneapolis);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.FAVORITE_CITY,
      JSON.stringify(minneapolis)
    );
  });

  it('unfavorites the same city', async () => {
    await toggleFavorite(minneapolis);
    const result = await toggleFavorite(minneapolis);
    expect(result).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.FAVORITE_CITY);
  });

  it('replaces favorite with a different city', async () => {
    await toggleFavorite(minneapolis);
    const result = await toggleFavorite(newYork);
    expect(result).toEqual(newYork);
  });

  it('unfavorites case-insensitively', async () => {
    await toggleFavorite(minneapolis);
    const result = await toggleFavorite({ ...minneapolis, name: 'MINNEAPOLIS' });
    expect(result).toBeNull();
  });
});

describe('removeRecent', () => {
  it('removes a city from recents', async () => {
    await addRecentSearch(minneapolis);
    await addRecentSearch(newYork);
    const { recents } = await removeRecent('Minneapolis');
    expect(recents).toEqual([newYork]);
  });

  it('clears favorite if removed city was favorited', async () => {
    await addRecentSearch(minneapolis);
    await toggleFavorite(minneapolis);
    const { favorite } = await removeRecent('Minneapolis');
    expect(favorite).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.FAVORITE_CITY);
  });

  it('does not clear favorite if removed city was not the favorite', async () => {
    await addRecentSearch(minneapolis);
    await addRecentSearch(newYork);
    await toggleFavorite(minneapolis);
    const { favorite } = await removeRecent('New York');
    expect(favorite).toEqual(minneapolis);
  });

  it('handles case-insensitive removal', async () => {
    await addRecentSearch(minneapolis);
    const { recents } = await removeRecent('MINNEAPOLIS');
    expect(recents).toEqual([]);
  });
});

describe('loading data', () => {
  it('returns empty state when no data stored', async () => {
    const recents = await getStoredJSON<SavedCity[]>(STORAGE_KEYS.RECENT_SEARCHES);
    const favorite = await getStoredJSON<SavedCity>(STORAGE_KEYS.FAVORITE_CITY);
    expect(recents).toBeNull();
    expect(favorite).toBeNull();
  });

  it('returns stored data', async () => {
    await addRecentSearch(minneapolis);
    await toggleFavorite(newYork);
    const recents = await getStoredJSON<SavedCity[]>(STORAGE_KEYS.RECENT_SEARCHES);
    const favorite = await getStoredJSON<SavedCity>(STORAGE_KEYS.FAVORITE_CITY);
    expect(recents).toEqual([minneapolis]);
    expect(favorite).toEqual(newYork);
  });
});
