/**
 * Base Local Repository
 *
 * Provides common functionality for AsyncStorage-based repositories.
 * Handles device ID management and storage operations.
 */

import * as Crypto from 'expo-crypto';
import { getStoredJSON, setStoredJSON } from '../../shared/utils/storage';
import { BFF_STORAGE_KEYS } from '../../shared/constants';

/**
 * Abstract base class for local repositories.
 * Provides device ID management and common storage utilities.
 */
export abstract class BaseLocalRepository {
  protected deviceId: string = '';

  /**
   * Initialize the repository with a device ID
   */
  async initialize(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
  }

  /**
   * Get the current device ID.
   * Loads from storage or generates a new one if needed.
   */
  protected async ensureDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId;

    // Try to load from storage
    const stored = await getStoredJSON<string>(BFF_STORAGE_KEYS.DEVICE_ID);
    if (stored) {
      this.deviceId = stored;
      return stored;
    }

    // Generate new device ID
    this.deviceId = Crypto.randomUUID();
    await setStoredJSON(BFF_STORAGE_KEYS.DEVICE_ID, this.deviceId);
    return this.deviceId;
  }

  /**
   * Load data from storage with type safety
   */
  protected async loadFromStorage<T>(key: string, defaultValue: T): Promise<T> {
    const stored = await getStoredJSON<T>(key);
    return stored ?? defaultValue;
  }

  /**
   * Save data to storage
   */
  protected async saveToStorage<T>(key: string, data: T): Promise<void> {
    await setStoredJSON(key, data);
  }
}
