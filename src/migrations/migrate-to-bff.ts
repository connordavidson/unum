/**
 * Migration: Local Data to BFF Format
 *
 * Migrates existing local data to be compatible with the BFF layer.
 * - Converts legacy Upload format to BFFUpload format
 * - Generates device IDs for anonymous identity
 * - Prepares data for remote sync
 */

import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, BFF_STORAGE_KEYS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
import type { Upload, UserVotes, Coordinates } from '../shared/types';

// ============ Types ============

export interface MigrationResult {
  success: boolean;
  migratedUploads: number;
  migratedVotes: number;
  deviceId: string;
  errors: string[];
  warnings: string[];
}

export interface MigrationStatus {
  version: number;
  lastRun: string;
  deviceId: string;
}

// Current migration version
const MIGRATION_VERSION = 1;
const MIGRATION_STATUS_KEY = 'unum_migration_status';

// ============ Migration Helpers ============

/**
 * Get or create device ID
 */
async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getStoredJSON<string>(BFF_STORAGE_KEYS.DEVICE_ID);
  if (existing) {
    return existing;
  }

  const newId = Crypto.randomUUID();
  await setStoredJSON(BFF_STORAGE_KEYS.DEVICE_ID, newId);
  return newId;
}

/**
 * Get migration status
 */
async function getMigrationStatus(): Promise<MigrationStatus | null> {
  return getStoredJSON<MigrationStatus>(MIGRATION_STATUS_KEY);
}

/**
 * Save migration status
 */
async function saveMigrationStatus(status: MigrationStatus): Promise<void> {
  await setStoredJSON(MIGRATION_STATUS_KEY, status);
}

/**
 * Check if migration is needed
 */
export async function isMigrationNeeded(): Promise<boolean> {
  const status = await getMigrationStatus();
  return !status || status.version < MIGRATION_VERSION;
}

/**
 * Validate coordinates
 */
function isValidCoordinates(coords: unknown): coords is Coordinates {
  if (!Array.isArray(coords) || coords.length !== 2) {
    return false;
  }
  const [lat, lon] = coords;
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

/**
 * Validate upload data
 */
function isValidUpload(upload: unknown): upload is Upload {
  if (!upload || typeof upload !== 'object') {
    return false;
  }

  const u = upload as Record<string, unknown>;
  return (
    typeof u.id === 'number' &&
    (u.type === 'photo' || u.type === 'video') &&
    typeof u.data === 'string' &&
    isValidCoordinates(u.coordinates) &&
    typeof u.timestamp === 'string' &&
    typeof u.votes === 'number'
  );
}

// ============ Migration Functions ============

/**
 * Migrate uploads to BFF-compatible format
 * Currently the local format is already compatible, but this ensures data integrity
 */
async function migrateUploads(deviceId: string): Promise<{
  count: number;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const uploads = await getStoredJSON<Upload[]>(STORAGE_KEYS.UPLOADS);

    if (!uploads || uploads.length === 0) {
      return { count: 0, errors, warnings };
    }

    // Validate and clean uploads
    const validUploads: Upload[] = [];
    for (let i = 0; i < uploads.length; i++) {
      const upload = uploads[i];

      if (!isValidUpload(upload)) {
        warnings.push(`Upload at index ${i} has invalid format, skipping`);
        continue;
      }

      // Ensure required fields
      const cleanedUpload: Upload = {
        id: upload.id,
        type: upload.type,
        data: upload.data,
        coordinates: upload.coordinates,
        timestamp: upload.timestamp || new Date().toISOString(),
        caption: upload.caption,
        votes: upload.votes || 0,
      };

      validUploads.push(cleanedUpload);
    }

    // Save cleaned uploads
    await setStoredJSON(STORAGE_KEYS.UPLOADS, validUploads);

    if (validUploads.length < uploads.length) {
      warnings.push(
        `Cleaned ${uploads.length - validUploads.length} invalid uploads`
      );
    }

    return { count: validUploads.length, errors, warnings };
  } catch (error) {
    errors.push(`Failed to migrate uploads: ${error}`);
    return { count: 0, errors, warnings };
  }
}

/**
 * Migrate votes to BFF-compatible format
 */
async function migrateVotes(): Promise<{
  count: number;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const votes = await getStoredJSON<UserVotes>(STORAGE_KEYS.USER_VOTES);

    if (!votes || Object.keys(votes).length === 0) {
      return { count: 0, errors, warnings };
    }

    // Validate vote entries
    const validVotes: UserVotes = {};
    let invalidCount = 0;

    for (const [uploadId, voteType] of Object.entries(votes)) {
      if (voteType !== 'up' && voteType !== 'down') {
        invalidCount++;
        continue;
      }

      const numericId = parseInt(uploadId, 10);
      if (isNaN(numericId)) {
        invalidCount++;
        continue;
      }

      validVotes[numericId] = voteType;
    }

    // Save cleaned votes
    await setStoredJSON(STORAGE_KEYS.USER_VOTES, validVotes);

    if (invalidCount > 0) {
      warnings.push(`Cleaned ${invalidCount} invalid vote entries`);
    }

    return { count: Object.keys(validVotes).length, errors, warnings };
  } catch (error) {
    errors.push(`Failed to migrate votes: ${error}`);
    return { count: 0, errors, warnings };
  }
}

/**
 * Initialize sync queue
 */
async function initializeSyncQueue(): Promise<void> {
  const existing = await getStoredJSON(BFF_STORAGE_KEYS.SYNC_QUEUE);
  if (!existing) {
    await setStoredJSON(BFF_STORAGE_KEYS.SYNC_QUEUE, []);
  }
}

// ============ Main Migration ============

/**
 * Run the migration
 */
export async function runMigration(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    migratedUploads: 0,
    migratedVotes: 0,
    deviceId: '',
    errors: [],
    warnings: [],
  };

  try {
    console.log('Starting BFF migration...');

    // Check if migration is needed
    const status = await getMigrationStatus();
    if (status && status.version >= MIGRATION_VERSION) {
      console.log('Migration already completed');
      result.success = true;
      result.deviceId = status.deviceId;
      return result;
    }

    // Step 1: Get or create device ID
    console.log('Step 1: Setting up device identity...');
    result.deviceId = await getOrCreateDeviceId();

    // Step 2: Migrate uploads
    console.log('Step 2: Migrating uploads...');
    const uploadResult = await migrateUploads(result.deviceId);
    result.migratedUploads = uploadResult.count;
    result.errors.push(...uploadResult.errors);
    result.warnings.push(...uploadResult.warnings);

    // Step 3: Migrate votes
    console.log('Step 3: Migrating votes...');
    const voteResult = await migrateVotes();
    result.migratedVotes = voteResult.count;
    result.errors.push(...voteResult.errors);
    result.warnings.push(...voteResult.warnings);

    // Step 4: Initialize sync queue
    console.log('Step 4: Initializing sync queue...');
    await initializeSyncQueue();

    // Step 5: Save migration status
    console.log('Step 5: Saving migration status...');
    await saveMigrationStatus({
      version: MIGRATION_VERSION,
      lastRun: new Date().toISOString(),
      deviceId: result.deviceId,
    });

    result.success = result.errors.length === 0;
    console.log('Migration completed:', result);

    return result;
  } catch (error) {
    result.errors.push(`Migration failed: ${error}`);
    console.error('Migration failed:', error);
    return result;
  }
}

/**
 * Reset migration (for testing)
 */
export async function resetMigration(): Promise<void> {
  await AsyncStorage.removeItem(MIGRATION_STATUS_KEY);
  await AsyncStorage.removeItem(BFF_STORAGE_KEYS.DEVICE_ID);
  await AsyncStorage.removeItem(BFF_STORAGE_KEYS.SYNC_QUEUE);
  await AsyncStorage.removeItem(BFF_STORAGE_KEYS.LAST_SYNC);
  console.log('Migration reset completed');
}

/**
 * Get current migration status
 */
export async function getMigrationInfo(): Promise<{
  isNeeded: boolean;
  currentVersion: number;
  status: MigrationStatus | null;
}> {
  const status = await getMigrationStatus();
  return {
    isNeeded: !status || status.version < MIGRATION_VERSION,
    currentVersion: MIGRATION_VERSION,
    status,
  };
}
