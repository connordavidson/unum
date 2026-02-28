/**
 * UploadQueueContext tests
 *
 * Tests the queue state machine logic by extracting it as pure functions.
 * Mirrors the pattern used in useUploadData.test.ts.
 */

import type { CreateUploadData } from '../../shared/types';
import type { UploadJob, UploadJobStatus } from '../UploadQueueContext';

// ============ Mocks ============

const mockRunUploadPipeline = jest.fn();

jest.mock('../../services/upload-pipeline', () => ({
  runUploadPipeline: (params: unknown) => mockRunUploadPipeline(params),
}));

const mockTrackUpload = jest.fn();

jest.mock('../../hooks/useAnalytics', () => ({
  useAnalytics: () => ({ trackUpload: mockTrackUpload }),
}));

// ============ Helpers ============

const mockUploadData: CreateUploadData = {
  type: 'photo',
  data: 'file://local/photo.jpg',
  coordinates: [37.7749, -122.4194],
  caption: 'Test',
};

/**
 * Simulates the UploadQueueContext queue state machine.
 * Mirrors the enqueue() logic and state transitions without React.
 */
function createQueueSimulator() {
  const jobs: Map<string, UploadJob> = new Map();
  let latestFinishedJob: UploadJob | null = null;
  let idCounter = 0;

  function getActiveCount() {
    return Array.from(jobs.values()).filter(j => j.status === 'uploading').length;
  }

  async function enqueue(params: {
    uploadData: CreateUploadData;
    userId: string;
    deviceId: string;
  }): Promise<void> {
    if (!params.userId) {
      throw new Error('User ID not available. Please sign in and try again.');
    }
    if (!params.deviceId) {
      throw new Error('Device ID not available. Please try again.');
    }

    const id = `job-${++idCounter}`;
    const job: UploadJob = {
      id,
      status: 'uploading',
      mediaType: params.uploadData.type,
      enqueuedAt: Date.now(),
    };

    jobs.set(id, job);

    try {
      await mockRunUploadPipeline({
        uploadData: params.uploadData,
        userId: params.userId,
        deviceId: params.deviceId,
      });
      const finished: UploadJob = { ...job, status: 'success' };
      jobs.set(id, finished);
      latestFinishedJob = finished;
      mockTrackUpload('complete', { media_type: params.uploadData.type, has_caption: !!params.uploadData.caption });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      const finished: UploadJob = { ...job, status: 'failed', error };
      jobs.set(id, finished);
      latestFinishedJob = finished;
      mockTrackUpload('fail', { media_type: params.uploadData.type, has_caption: !!params.uploadData.caption });
    }
  }

  function dismissToast() {
    latestFinishedJob = null;
    for (const [id, job] of jobs.entries()) {
      if (job.status !== 'uploading') {
        jobs.delete(id);
      }
    }
  }

  return {
    enqueue,
    dismissToast,
    get latestFinishedJob() { return latestFinishedJob; },
    get activeCount() { return getActiveCount(); },
    get jobCount() { return jobs.size; },
  };
}

// ============ Tests ============

describe('UploadQueueContext state machine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunUploadPipeline.mockResolvedValue(undefined);
  });

  describe('enqueue validation', () => {
    it('rejects when userId is empty string', async () => {
      const queue = createQueueSimulator();
      await expect(
        queue.enqueue({ uploadData: mockUploadData, userId: '', deviceId: 'device-456' })
      ).rejects.toThrow('User ID not available');
    });

    it('rejects when deviceId is empty string', async () => {
      const queue = createQueueSimulator();
      await expect(
        queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: '' })
      ).rejects.toThrow('Device ID not available');
    });

    it('resolves when both userId and deviceId are provided', async () => {
      const queue = createQueueSimulator();
      await expect(
        queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' })
      ).resolves.toBeUndefined();
    });
  });

  describe('job lifecycle - success', () => {
    it('latestFinishedJob is null while the job is in-flight', async () => {
      let resolveJob!: () => void;
      const pendingPipeline = new Promise<void>((resolve) => { resolveJob = resolve; });
      mockRunUploadPipeline.mockReturnValue(pendingPipeline);
      const queue = createQueueSimulator();

      // Start but don't await — check state while in-flight
      const jobPromise = queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      // Still in-flight — latestFinishedJob should be null
      expect(queue.latestFinishedJob).toBeNull();

      // Resolve so the test can clean up
      resolveJob();
      await jobPromise;
    });

    it('sets latestFinishedJob to success after pipeline resolves', async () => {
      const queue = createQueueSimulator();
      await queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      expect(queue.latestFinishedJob).not.toBeNull();
      expect(queue.latestFinishedJob!.status).toBe('success');
      expect(queue.latestFinishedJob!.mediaType).toBe('photo');
    });

    it('calls trackUpload complete on success', async () => {
      const queue = createQueueSimulator();
      await queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      expect(mockTrackUpload).toHaveBeenCalledWith('complete', {
        media_type: 'photo',
        has_caption: true,
      });
    });
  });

  describe('job lifecycle - failure', () => {
    it('sets latestFinishedJob to failed after pipeline rejects', async () => {
      mockRunUploadPipeline.mockRejectedValue(new Error('S3 upload failed'));
      const queue = createQueueSimulator();

      await queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      expect(queue.latestFinishedJob).not.toBeNull();
      expect(queue.latestFinishedJob!.status).toBe('failed');
      expect(queue.latestFinishedJob!.error).toBe('S3 upload failed');
    });

    it('calls trackUpload fail on failure', async () => {
      mockRunUploadPipeline.mockRejectedValue(new Error('Network error'));
      const queue = createQueueSimulator();

      await queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      expect(mockTrackUpload).toHaveBeenCalledWith('fail', {
        media_type: 'photo',
        has_caption: true,
      });
    });

    it('uses fallback error message when error is not an Error instance', async () => {
      mockRunUploadPipeline.mockRejectedValue('something went wrong');
      const queue = createQueueSimulator();

      await queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      expect(queue.latestFinishedJob!.error).toBe('Upload failed. Please try again.');
    });
  });

  describe('activeCount', () => {
    it('is 0 before any jobs are enqueued', () => {
      const queue = createQueueSimulator();
      expect(queue.activeCount).toBe(0);
    });

    it('increments when a job is enqueued', async () => {
      let resolveJob!: () => void;
      const pendingPipeline = new Promise<void>((resolve) => { resolveJob = resolve; });
      mockRunUploadPipeline.mockReturnValue(pendingPipeline);
      const queue = createQueueSimulator();

      const jobPromise = queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      expect(queue.activeCount).toBe(1);

      resolveJob();
      await jobPromise;
    });

    it('decrements when a job completes', async () => {
      const queue = createQueueSimulator();
      await queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      expect(queue.activeCount).toBe(0);
    });

    it('tracks multiple concurrent jobs independently', async () => {
      const queue = createQueueSimulator();

      // Enqueue two jobs simultaneously
      await Promise.all([
        queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' }),
        queue.enqueue({
          uploadData: { ...mockUploadData, type: 'video' },
          userId: 'user-123',
          deviceId: 'device-456',
        }),
      ]);

      expect(queue.activeCount).toBe(0);
      // Both jobs should have completed
      expect(mockRunUploadPipeline).toHaveBeenCalledTimes(2);
    });
  });

  describe('dismissToast', () => {
    it('clears latestFinishedJob', async () => {
      const queue = createQueueSimulator();
      await queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      expect(queue.latestFinishedJob).not.toBeNull();
      queue.dismissToast();
      expect(queue.latestFinishedJob).toBeNull();
    });

    it('removes finished jobs from the job list', async () => {
      const queue = createQueueSimulator();
      await queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });

      expect(queue.jobCount).toBe(1);
      queue.dismissToast();
      expect(queue.jobCount).toBe(0);
    });

    it('does not remove in-flight jobs when dismissing', async () => {
      let resolveJob!: () => void;
      const pendingPipeline = new Promise<void>((resolve) => { resolveJob = resolve; });
      mockRunUploadPipeline.mockReturnValue(pendingPipeline);
      const queue = createQueueSimulator();

      const jobPromise = queue.enqueue({ uploadData: mockUploadData, userId: 'user-123', deviceId: 'device-456' });
      queue.dismissToast(); // nothing finished to dismiss yet

      expect(queue.activeCount).toBe(1);

      resolveJob();
      await jobPromise;
    });
  });
});
