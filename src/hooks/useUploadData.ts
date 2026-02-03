/**
 * useUploadData Hook
 *
 * Main hook for managing upload data.
 * Thin wrapper around UploadDataProvider for reads.
 * Uses existing services for writes (create upload).
 * Composes useDeviceIdentity and useVoting for identity and voting.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import { FEATURE_FLAGS, UPLOAD_CONFIG } from '../shared/constants';
import { getUploadDataProvider } from '../providers/UploadDataProvider';
import { getUploadService } from '../services/upload.service';
import { getMediaService } from '../services/media.service';
import { getModerationService } from '../services/moderation.service';
import { useUserIdentity } from './useUserIdentity';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compose existing hooks
  const { userId, userIdRef, deviceId, deviceIdRef } = useUserIdentity();
  const { handleVote: baseHandleVote, isVoting } = useVoting({ userId: userId || undefined });

  // Derive userVotes from uploads' userVote property
  const userVotes = useMemo(() => {
    const votes: Record<string, VoteType> = {};
    for (const upload of uploads) {
      if (upload.userVote) {
        votes[upload.id] = upload.userVote;
      }
    }
    return votes;
  }, [uploads]);

  // Get singleton provider
  const provider = getUploadDataProvider();

  // Request versioning to handle race conditions
  // Only the latest request's result is applied to state
  const requestVersionRef = useRef(0);

  // Refresh uploads - delegates entirely to provider
  // Uses request versioning to ensure only the latest request wins
  const refreshUploads = useCallback(async (bbox?: BoundingBox) => {
    const currentVersion = ++requestVersionRef.current;
    const currentUserId = userIdRef.current;

    if (__DEV__) console.log('[useUploadData] refreshUploads called', { version: currentVersion, hasBbox: !!bbox });

    if (currentVersion === requestVersionRef.current) {
      setLoading(true);
    }

    try {
      const data = bbox
        ? await provider.getInBounds(bbox, currentUserId || undefined)
        : await provider.getAll(currentUserId || undefined);

      // Only apply if this is still the latest request
      if (currentVersion === requestVersionRef.current) {
        setUploads(data);
        setError(null);
        if (__DEV__) console.log('[useUploadData] Applied result for version', currentVersion, ':', data.length, 'uploads');
      } else {
        if (__DEV__) console.log('[useUploadData] Ignoring stale result for version', currentVersion);
      }
    } catch (err) {
      // Only set error if this is still the latest request
      if (currentVersion === requestVersionRef.current) {
        if (__DEV__) console.error('[useUploadData] Refresh failed:', err);
        setError('Failed to load uploads');
        // Do NOT call setUploads([]) — keep showing previous data
      }
    } finally {
      if (currentVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [provider, userIdRef]);

  // Create upload - uses existing services
  const createUpload = useCallback(async (uploadData: CreateUploadData) => {
    if (__DEV__) console.log('[useUploadData] createUpload', { type: uploadData.type, hasCoords: !!uploadData.coordinates });

    const currentUserId = userIdRef.current || userId;

    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      if (!currentUserId) {
        // Wait briefly for user ID initialization
        let waitTime = 0;

        while (!userIdRef.current && waitTime < UPLOAD_CONFIG.USER_ID_WAIT_MS) {
          await new Promise(resolve => setTimeout(resolve, UPLOAD_CONFIG.USER_ID_CHECK_INTERVAL_MS));
          waitTime += UPLOAD_CONFIG.USER_ID_CHECK_INTERVAL_MS;
        }

        if (!userIdRef.current) {
          throw new Error('User ID not initialized. Please sign in and try again.');
        }
      }

      const finalUserId = userIdRef.current || userId;
      if (!finalUserId) {
        throw new Error('User ID not available. Please sign in and try again.');
      }

      const finalDeviceId = deviceIdRef.current || deviceId;
      if (!finalDeviceId) {
        throw new Error('Device ID not available. Please try again.');
      }

      const uploadSvc = getUploadService({ useRemote: true });
      const mediaSvc = getMediaService({ useRemote: true });
      const uploadId = Crypto.randomUUID();

      // Content moderation check before upload
      const moderationResult = await getModerationService().moderate(
        uploadData.data,
        uploadData.type,
      );
      if (!moderationResult.approved) {
        throw new Error(moderationResult.reason || 'Content was flagged as inappropriate and cannot be uploaded.');
      }

      // Upload media to S3 (with EXIF metadata for photos)
      const mediaResult = await mediaSvc.upload({
        localPath: uploadData.data,
        uploadId,
        mediaType: uploadData.type,
        coordinates: uploadData.coordinates,
        timestamp: new Date().toISOString(),
        uploaderId: finalUserId,
      });

      // Create upload record in DynamoDB
      await uploadSvc.createUpload({
        type: uploadData.type,
        mediaUrl: mediaResult.url,
        mediaKey: mediaResult.key,
        coordinates: uploadData.coordinates,
        caption: uploadData.caption,
        userId: finalUserId,
        deviceId: finalDeviceId,
      });

      if (__DEV__) console.log('[useUploadData] Upload created successfully');
    }

    // Invalidate cache so next refresh gets new data
    provider.invalidate();
  }, [userId, userIdRef, deviceId, deviceIdRef, provider]);

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
