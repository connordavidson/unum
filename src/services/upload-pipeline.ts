/**
 * Upload Pipeline
 *
 * Pure async function that orchestrates the full upload pipeline:
 * content moderation → S3 upload → DynamoDB record → cache invalidation.
 *
 * No React dependencies — safe to call from a context, hook, or service.
 * All services used are singletons.
 */

import * as Crypto from 'expo-crypto';
import { FEATURE_FLAGS } from '../shared/constants';
import { getUploadDataProvider } from '../providers/UploadDataProvider';
import { getUploadService } from './upload.service';
import { getMediaService } from './media.service';
import { getModerationService } from './moderation.service';
import type { CreateUploadData } from '../shared/types';

export interface RunUploadPipelineParams {
  uploadData: CreateUploadData;
  userId: string;
  deviceId: string;
}

/**
 * Runs the full upload pipeline for a single post.
 *
 * Steps (when USE_AWS_BACKEND is enabled):
 * 1. Content moderation via Rekognition
 * 2. EXIF embed + S3 upload
 * 3. DynamoDB record creation
 * 4. Feed cache invalidation
 *
 * Throws on moderation rejection or any service failure.
 */
export async function runUploadPipeline({
  uploadData,
  userId,
  deviceId,
}: RunUploadPipelineParams): Promise<void> {
  if (FEATURE_FLAGS.USE_AWS_BACKEND) {
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
      uploaderId: userId,
    });

    // Create upload record in DynamoDB
    await uploadSvc.createUpload({
      type: uploadData.type,
      mediaUrl: mediaResult.url,
      mediaKey: mediaResult.key,
      coordinates: uploadData.coordinates,
      caption: uploadData.caption,
      userId,
      deviceId,
    });
  }

  // Invalidate feed cache so the next refresh picks up the new post
  getUploadDataProvider().invalidate();
}
