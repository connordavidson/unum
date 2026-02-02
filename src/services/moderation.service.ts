/**
 * Content Moderation Service
 *
 * Uses AWS Rekognition to detect inappropriate content before upload.
 * Checks images for explicit, suggestive, violent, and other prohibited content.
 * For videos, extracts a thumbnail frame and checks that.
 */

import {
  RekognitionClient,
  DetectModerationLabelsCommand,
} from '@aws-sdk/client-rekognition';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { getAWSCredentialsService } from './aws-credentials.service';
import { getLoggingService } from './logging.service';
import type { MediaType } from '../shared/types';

const log = getLoggingService().createLogger('Moderation');

// ============ Types ============

export interface ModerationResult {
  approved: boolean;
  reason?: string;
  labels?: ModerationLabel[];
}

export interface ModerationLabel {
  name: string;
  parentName: string;
  confidence: number;
}

// ============ Constants ============

const CONFIDENCE_THRESHOLD = 75;

const BLOCKED_CATEGORIES = [
  'Explicit Nudity',
  'Non-Explicit Nudity of Intimate parts and Kissing',
  'Suggestive',
  'Violence',
  'Visually Disturbing',
  'Drugs & Tobacco & Alcohol',
  'Hate Symbols',
];

// ============ Service Implementation ============

class ModerationService {
  private client: RekognitionClient | null = null;

  /**
   * Get or create Rekognition client with current credentials
   */
  private async getClient(): Promise<RekognitionClient> {
    const credsSvc = getAWSCredentialsService();
    const creds = await credsSvc.getAuthenticatedCredentials();

    this.client = new RekognitionClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });

    return this.client;
  }

  /**
   * Moderate content before upload
   * Returns approval status and any detected labels
   */
  async moderate(localPath: string, mediaType: MediaType): Promise<ModerationResult> {
    try {
      if (mediaType === 'photo') {
        return await this.moderateImage(localPath);
      } else {
        return await this.moderateVideo(localPath);
      }
    } catch (error) {
      log.error('Moderation check failed', error);
      // On moderation failure, allow the upload to proceed
      // (better UX than blocking due to service issues)
      return { approved: true };
    }
  }

  /**
   * Check an image for inappropriate content using Rekognition
   */
  private async moderateImage(imageUri: string): Promise<ModerationResult> {
    log.debug('Moderating image', { path: imageUri });

    // Read image as base64 then convert to bytes
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const client = await this.getClient();

    const response = await client.send(
      new DetectModerationLabelsCommand({
        Image: {
          Bytes: bytes,
        },
        MinConfidence: CONFIDENCE_THRESHOLD,
      })
    );

    const labels: ModerationLabel[] = (response.ModerationLabels || []).map((label) => ({
      name: label.Name || 'Unknown',
      parentName: label.ParentName || '',
      confidence: label.Confidence || 0,
    }));

    // Check if any blocked categories were detected
    const blockedLabels = labels.filter((label) =>
      BLOCKED_CATEGORIES.some(
        (cat) =>
          label.name.includes(cat) ||
          label.parentName.includes(cat) ||
          cat.includes(label.name) ||
          cat.includes(label.parentName)
      )
    );

    if (blockedLabels.length > 0) {
      const reasons = [...new Set(blockedLabels.map((l) => l.parentName || l.name))];
      log.info('Content rejected', { reasons: reasons.join(', ') });

      return {
        approved: false,
        reason: `Content flagged for: ${reasons.join(', ')}`,
        labels,
      };
    }

    log.debug('Content approved', { labelCount: String(labels.length) });
    return { approved: true, labels };
  }

  /**
   * Check a video for inappropriate content
   * Extracts a thumbnail frame and checks that
   */
  private async moderateVideo(videoUri: string): Promise<ModerationResult> {
    log.debug('Moderating video via thumbnail', { path: videoUri });

    try {
      // Extract a thumbnail from the middle of the video
      const thumbnail = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: 1000, // 1 second in
        quality: 0.7,
      });

      return await this.moderateImage(thumbnail.uri);
    } catch (error) {
      log.warn('Video thumbnail extraction failed, skipping moderation', {
        error: String(error),
      });
      // If we can't extract a thumbnail, allow the upload
      return { approved: true };
    }
  }
}

// ============ Singleton ============

let instance: ModerationService | null = null;

export function getModerationService(): ModerationService {
  if (!instance) {
    instance = new ModerationService();
  }
  return instance;
}

export function resetModerationService(): void {
  instance = null;
}
