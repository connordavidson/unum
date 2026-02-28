/**
 * upload-pipeline tests
 *
 * Tests the pure runUploadPipeline function which orchestrates
 * moderation → S3 upload → DynamoDB write → cache invalidation.
 */

import type { CreateUploadData } from '../../shared/types';

// ============ Mocks ============

const mockModerate = jest.fn();
const mockMediaUpload = jest.fn();
const mockCreateUpload = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('../../services/moderation.service', () => ({
  getModerationService: () => ({ moderate: mockModerate }),
}));

jest.mock('../../services/media.service', () => ({
  getMediaService: () => ({ upload: mockMediaUpload }),
}));

jest.mock('../../services/upload.service', () => ({
  getUploadService: () => ({ createUpload: mockCreateUpload }),
}));

jest.mock('../../providers/UploadDataProvider', () => ({
  getUploadDataProvider: () => ({ invalidate: mockInvalidate }),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-upload-id',
}));

let mockUseAwsBackend = true;

jest.mock('../../shared/constants', () => ({
  get FEATURE_FLAGS() {
    return { USE_AWS_BACKEND: mockUseAwsBackend };
  },
}));

// ============ Helpers ============

const mockUploadData: CreateUploadData = {
  type: 'photo',
  data: 'file://local/photo.jpg',
  coordinates: [37.7749, -122.4194],
  caption: 'Hello world',
};

const defaultParams = {
  uploadData: mockUploadData,
  userId: 'user-123',
  deviceId: 'device-456',
};

// Import after mocks are set up
import { runUploadPipeline } from '../upload-pipeline';

// ============ Tests ============

describe('runUploadPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAwsBackend = true;
    mockModerate.mockResolvedValue({ approved: true });
    mockMediaUpload.mockResolvedValue({
      url: 'https://s3.example.com/photo.jpg',
      key: 'photos/2024/01/01/test-upload-id.jpg',
    });
    mockCreateUpload.mockResolvedValue(undefined);
  });

  describe('happy path', () => {
    it('calls moderation, media upload, record creation, and cache invalidation in order', async () => {
      const callOrder: string[] = [];
      mockModerate.mockImplementation(async () => { callOrder.push('moderate'); return { approved: true }; });
      mockMediaUpload.mockImplementation(async () => { callOrder.push('mediaUpload'); return { url: 'https://s3.example.com/photo.jpg', key: 'key' }; });
      mockCreateUpload.mockImplementation(async () => { callOrder.push('createUpload'); });
      mockInvalidate.mockImplementation(() => { callOrder.push('invalidate'); });

      await runUploadPipeline(defaultParams);

      expect(callOrder).toEqual(['moderate', 'mediaUpload', 'createUpload', 'invalidate']);
    });

    it('passes the correct params to moderation', async () => {
      await runUploadPipeline(defaultParams);

      expect(mockModerate).toHaveBeenCalledWith(
        mockUploadData.data,
        mockUploadData.type,
      );
    });

    it('passes the correct params to media upload', async () => {
      await runUploadPipeline(defaultParams);

      expect(mockMediaUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          localPath: mockUploadData.data,
          uploadId: 'test-upload-id',
          mediaType: mockUploadData.type,
          coordinates: mockUploadData.coordinates,
          uploaderId: defaultParams.userId,
        }),
      );
    });

    it('passes media result and identity to record creation', async () => {
      await runUploadPipeline(defaultParams);

      expect(mockCreateUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          type: mockUploadData.type,
          mediaUrl: 'https://s3.example.com/photo.jpg',
          mediaKey: 'photos/2024/01/01/test-upload-id.jpg',
          coordinates: mockUploadData.coordinates,
          caption: mockUploadData.caption,
          userId: defaultParams.userId,
          deviceId: defaultParams.deviceId,
        }),
      );
    });

    it('invalidates the feed cache on success', async () => {
      await runUploadPipeline(defaultParams);

      expect(mockInvalidate).toHaveBeenCalledTimes(1);
    });
  });

  describe('moderation rejection', () => {
    it('throws if moderation rejects the content', async () => {
      mockModerate.mockResolvedValue({ approved: false, reason: 'Explicit content detected' });

      await expect(runUploadPipeline(defaultParams)).rejects.toThrow('Explicit content detected');
    });

    it('does NOT call media upload when moderation rejects', async () => {
      mockModerate.mockResolvedValue({ approved: false, reason: 'Rejected' });

      await expect(runUploadPipeline(defaultParams)).rejects.toThrow();

      expect(mockMediaUpload).not.toHaveBeenCalled();
      expect(mockCreateUpload).not.toHaveBeenCalled();
      expect(mockInvalidate).not.toHaveBeenCalled();
    });

    it('uses fallback message when moderation reason is empty', async () => {
      mockModerate.mockResolvedValue({ approved: false });

      await expect(runUploadPipeline(defaultParams)).rejects.toThrow(
        'Content was flagged as inappropriate and cannot be uploaded.'
      );
    });
  });

  describe('service errors', () => {
    it('propagates media upload errors', async () => {
      mockMediaUpload.mockRejectedValue(new Error('S3 upload failed'));

      await expect(runUploadPipeline(defaultParams)).rejects.toThrow('S3 upload failed');
      expect(mockCreateUpload).not.toHaveBeenCalled();
    });

    it('propagates DynamoDB write errors', async () => {
      mockCreateUpload.mockRejectedValue(new Error('DynamoDB write failed'));

      await expect(runUploadPipeline(defaultParams)).rejects.toThrow('DynamoDB write failed');
    });
  });

  describe('USE_AWS_BACKEND = false', () => {
    beforeEach(() => {
      mockUseAwsBackend = false;
    });

    it('only calls provider.invalidate() — skips all AWS calls', async () => {
      await runUploadPipeline(defaultParams);

      expect(mockModerate).not.toHaveBeenCalled();
      expect(mockMediaUpload).not.toHaveBeenCalled();
      expect(mockCreateUpload).not.toHaveBeenCalled();
      expect(mockInvalidate).toHaveBeenCalledTimes(1);
    });
  });

  describe('upload without caption', () => {
    it('passes undefined caption through to record creation', async () => {
      await runUploadPipeline({
        ...defaultParams,
        uploadData: { ...mockUploadData, caption: undefined },
      });

      expect(mockCreateUpload).toHaveBeenCalledWith(
        expect.objectContaining({ caption: undefined }),
      );
    });
  });
});
