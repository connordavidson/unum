/**
 * useUploadData Hook
 *
 * Main hook for managing upload data.
 * Thin wrapper around UploadDataProvider for reads.
 * Uses existing services for writes (create upload).
 * Composes useDeviceIdentity and useVoting for identity and voting.
 */

import { useState, useCallback, useEffect } from 'react';
import * as Crypto from 'expo-crypto';
import { FEATURE_FLAGS } from '../shared/constants';
import { getUploadDataProvider } from '../providers/UploadDataProvider';
import { getUploadService } from '../services/upload.service';
import { getMediaService } from '../services/media.service';
import { useDeviceIdentity } from './useDeviceIdentity';
import { useVoting } from './useVoting';
import type { Upload, CreateUploadData, VoteType, BoundingBox } from '../shared/types';

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

  // Compose existing hooks
  const { deviceId, deviceIdRef } = useDeviceIdentity();
  const { userVotes, handleVote: baseHandleVote, loadUserVotes } = useVoting();

  // Get singleton provider
  const provider = getUploadDataProvider();

  // Initial load - just load votes, data comes from refreshUploads
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadUserVotes();
      setLoading(false);
    };
    init();
  }, [loadUserVotes]);

  // Refresh uploads - delegates entirely to provider
  const refreshUploads = useCallback(async (bbox?: BoundingBox) => {
    console.log('[useUploadData] refreshUploads called', { hasBbox: !!bbox });
    try {
      const data = bbox
        ? await provider.getInBounds(bbox)
        : await provider.getAll();
      setUploads(data);
      setError(null);
    } catch (err) {
      console.error('[useUploadData] Refresh failed:', err);
      setError('Failed to load uploads');
    }
  }, [provider]);

  // Create upload - uses existing services
  const createUpload = useCallback(async (uploadData: CreateUploadData) => {
    const currentDeviceId = deviceIdRef.current || deviceId;

    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      if (!currentDeviceId) {
        // Wait briefly for device ID initialization
        let waitTime = 0;
        const maxWait = 3000;
        const checkInterval = 100;

        while (!deviceIdRef.current && waitTime < maxWait) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          waitTime += checkInterval;
        }

        if (!deviceIdRef.current) {
          throw new Error('Device ID not initialized. Please try again.');
        }
      }

      const finalDeviceId = deviceIdRef.current || deviceId;
      if (!finalDeviceId) {
        throw new Error('Device ID not available');
      }

      const uploadSvc = getUploadService({ deviceId: finalDeviceId, useRemote: true });
      const mediaSvc = getMediaService({ useRemote: true });
      const uploadId = Crypto.randomUUID();

      // Upload media to S3
      const mediaResult = await mediaSvc.upload({
        localPath: uploadData.data,
        uploadId,
        mediaType: uploadData.type,
      });

      // Create upload record in DynamoDB
      await uploadSvc.createUpload({
        type: uploadData.type,
        mediaUrl: mediaResult.url,
        mediaKey: mediaResult.key,
        coordinates: uploadData.coordinates,
        caption: uploadData.caption,
      });

      console.log('[useUploadData] Upload created successfully');
    }

    // Invalidate cache so next refresh gets new data
    provider.invalidate();
  }, [deviceId, deviceIdRef, provider]);

  // Vote handler - wraps useVoting
  const handleVote = useCallback(async (uploadId: string, voteType: VoteType) => {
    await baseHandleVote(uploadId, voteType, uploads, setUploads);
  }, [baseHandleVote, uploads]);

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
