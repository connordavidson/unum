/**
 * useUploadSync Hook
 *
 * Handles syncing uploads from AWS backend.
 * Fetches uploads by location using bounding box queries.
 */

import { useCallback, useRef } from 'react';
import { FEATURE_FLAGS } from '../shared/constants';
import { getUploadService, UploadService } from '../services/upload.service';
import { getMediaService, MediaService } from '../services/media.service';
import type { Upload } from '../shared/types';

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface UseUploadSyncConfig {
  deviceId: string | null;
  deviceIdRef: React.MutableRefObject<string | null>;
}

interface UseUploadSyncResult {
  /** Fetch uploads from AWS by location */
  fetchFromAWS: (boundingBox: BoundingBox) => Promise<Upload[] | null>;
}

export function useUploadSync(config: UseUploadSyncConfig): UseUploadSyncResult {
  const { deviceId, deviceIdRef } = config;

  // Service references
  const uploadServiceRef = useRef<UploadService | null>(null);
  const mediaServiceRef = useRef<MediaService | null>(null);

  const getUploadSvc = useCallback(() => {
    const currentDeviceId = deviceIdRef.current || deviceId;
    if (!uploadServiceRef.current && currentDeviceId) {
      uploadServiceRef.current = getUploadService({
        deviceId: currentDeviceId,
        useRemote: FEATURE_FLAGS.USE_AWS_BACKEND
      });
    }
    return uploadServiceRef.current;
  }, [deviceId, deviceIdRef]);

  const getMediaSvc = useCallback(() => {
    if (!mediaServiceRef.current) {
      mediaServiceRef.current = getMediaService({
        useRemote: FEATURE_FLAGS.USE_AWS_BACKEND
      });
    }
    return mediaServiceRef.current;
  }, []);

  const fetchFromAWS = useCallback(async (boundingBox: BoundingBox): Promise<Upload[] | null> => {
    const currentDeviceId = deviceIdRef.current || deviceId;

    if (!FEATURE_FLAGS.USE_AWS_BACKEND || !currentDeviceId) {
      return null;
    }

    try {
      const uploadSvc = getUploadSvc();
      const mediaSvc = getMediaSvc();

      if (!uploadSvc || !mediaSvc) {
        return null;
      }

      // Fetch uploads by location from remote
      const result = await uploadSvc.getByLocation(boundingBox);

      // Convert BFF uploads to local format with resolved media URLs
      const newUploads: Upload[] = await Promise.all(
        result.uploads.map(async (bff) => {
          // Resolve media URL from mediaKey
          let mediaUrl = bff.mediaUrl;
          if (!mediaUrl && bff.mediaKey) {
            try {
              mediaUrl = await mediaSvc.getDisplayUrl(bff.mediaKey);
            } catch (err) {
              console.error('[useUploadSync] Failed to get display URL for', bff.mediaKey, err);
              mediaUrl = '';
            }
          }

          return {
            id: bff.id,
            type: bff.type,
            data: mediaUrl,
            coordinates: bff.coordinates,
            timestamp: bff.timestamp,
            caption: bff.caption,
            votes: bff.voteCount,
          };
        })
      );

      // Filter out uploads with empty media URLs
      const validUploads = newUploads.filter((u) => u.data && u.data.length > 0);

      // Sort by timestamp descending
      validUploads.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return validUploads;
    } catch (err) {
      console.error('[useUploadSync] Failed to fetch from AWS:', err);
      return null;
    }
  }, [deviceId, deviceIdRef, getUploadSvc, getMediaSvc]);

  return {
    fetchFromAWS,
  };
}
