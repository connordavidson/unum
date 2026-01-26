/**
 * useUploadData Hook
 *
 * Main hook for managing upload data.
 * Composes useDeviceIdentity, useVoting, and useUploadSync for a unified API.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS, API_CONFIG, FEATURE_FLAGS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
import { TEST_UPLOADS } from '../data/testUploads';
import {
  getLocalUploadRepository,
  LocalUploadRepository,
} from '../repositories/local';
import { getUploadService } from '../services/upload.service';
import { getMediaService } from '../services/media.service';
import { useDeviceIdentity } from './useDeviceIdentity';
import { useVoting } from './useVoting';
import { useUploadSync } from './useUploadSync';
import type { Upload, CreateUploadData, VoteType } from '../shared/types';

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface UseUploadDataResult {
  uploads: Upload[];
  userVotes: Record<string, VoteType>;
  loading: boolean;
  error: string | null;
  createUpload: (data: CreateUploadData) => Promise<void>;
  handleVote: (uploadId: string, voteType: VoteType) => Promise<void>;
  refreshUploads: (boundingBox?: BoundingBox) => Promise<void>;
}

export function useUploadData(): UseUploadDataResult {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compose hooks
  const { deviceId, deviceIdRef, isReady: awsReady } = useDeviceIdentity();
  const { userVotes, handleVote: baseHandleVote, loadUserVotes } = useVoting();
  const { fetchFromAWS } = useUploadSync({ deviceId, deviceIdRef });

  // Repository reference
  const uploadRepoRef = useRef<LocalUploadRepository | null>(null);

  const getUploadRepo = useCallback(() => {
    if (!uploadRepoRef.current) {
      uploadRepoRef.current = getLocalUploadRepository();
    }
    return uploadRepoRef.current;
  }, []);

  // Load uploads from storage (or seed with test data)
  const loadUploads = useCallback(async () => {
    try {
      if (API_CONFIG.USE_TEST_DATA) {
        await AsyncStorage.removeItem(STORAGE_KEYS.UPLOADS);
        setUploads(TEST_UPLOADS);
        await setStoredJSON(STORAGE_KEYS.UPLOADS, TEST_UPLOADS);
      } else {
        const repo = getUploadRepo();
        const storedUploads = await repo.getAllLegacy();
        setUploads(storedUploads);
      }
      setError(null);
    } catch (err) {
      console.error('[useUploadData] Failed to load uploads:', err);
      setError('Failed to load uploads');
    }
  }, [getUploadRepo]);

  // Save uploads to storage
  const saveUploads = useCallback(async (newUploads: Upload[]) => {
    const repo = getUploadRepo();
    await repo.saveAllLegacy(newUploads);
    setUploads(newUploads);
  }, [getUploadRepo]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadUploads(), loadUserVotes()]);
      setLoading(false);
    };
    init();
  }, [loadUploads, loadUserVotes]);

  // Create a new upload
  const createUpload = useCallback(async (uploadData: CreateUploadData) => {
    try {
      // Wait for AWS initialization if needed
      if (FEATURE_FLAGS.USE_AWS_BACKEND && !deviceIdRef.current) {
        let waitTime = 0;
        const maxWait = 3000;
        const checkInterval = 100;

        while (!deviceIdRef.current && waitTime < maxWait) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          waitTime += checkInterval;
        }

        if (!deviceIdRef.current) {
          throw new Error('AWS services failed to initialize. Please restart the app.');
        }
      }

      const currentDeviceId = deviceIdRef.current || deviceId;

      if (FEATURE_FLAGS.USE_AWS_BACKEND && currentDeviceId) {
        // AWS path
        const uploadSvc = getUploadService({
          deviceId: currentDeviceId,
          useRemote: true
        });
        const mediaSvc = getMediaService({ useRemote: true });

        const uploadId = Crypto.randomUUID();

        // Upload media to S3
        const mediaResult = await mediaSvc.upload({
          localPath: uploadData.data,
          uploadId,
          mediaType: uploadData.type,
        });

        // Create upload record in DynamoDB
        const bffUpload = await uploadSvc.createUpload({
          type: uploadData.type,
          mediaUrl: mediaResult.url,
          mediaKey: mediaResult.key,
          coordinates: uploadData.coordinates,
          caption: uploadData.caption,
        });

        const newUpload: Upload = {
          id: bffUpload.id,
          type: bffUpload.type,
          data: bffUpload.mediaUrl,
          coordinates: bffUpload.coordinates,
          timestamp: bffUpload.timestamp,
          caption: bffUpload.caption,
          votes: bffUpload.voteCount,
        };

        await saveUploads([newUpload, ...uploads]);
      } else {
        // Local-only path
        const newUpload: Upload = {
          id: Crypto.randomUUID(),
          type: uploadData.type,
          data: uploadData.data,
          coordinates: uploadData.coordinates,
          timestamp: new Date().toISOString(),
          caption: uploadData.caption,
          votes: 0,
        };

        await saveUploads([newUpload, ...uploads]);
      }

      setError(null);
    } catch (err) {
      console.error('[useUploadData] Failed to create upload:', err);
      setError('Failed to save upload');
      throw err;
    }
  }, [uploads, saveUploads, deviceId, deviceIdRef]);

  // Wrapper for vote handler
  const handleVote = useCallback(async (uploadId: string, voteType: VoteType) => {
    await baseHandleVote(uploadId, voteType, uploads, saveUploads);
  }, [baseHandleVote, uploads, saveUploads]);

  // Refresh uploads from AWS or local storage
  const refreshUploads = useCallback(async (boundingBox?: BoundingBox) => {
    if (boundingBox) {
      const awsUploads = await fetchFromAWS(boundingBox);
      if (awsUploads) {
        setUploads(awsUploads);
        return;
      }
    }

    // Fall back to local storage
    await loadUploads();
  }, [loadUploads, fetchFromAWS]);

  return {
    uploads,
    userVotes,
    loading,
    error,
    createUpload,
    handleVote,
    refreshUploads,
  };
}
