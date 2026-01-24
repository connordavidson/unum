import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getStoredJSON<T>(key: string): Promise<T | null> {
  try {
    const stored = await AsyncStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (err) {
    console.error(`Failed to get ${key}:`, err);
    return null;
  }
}

export async function setStoredJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to set ${key}:`, err);
    throw err;
  }
}
