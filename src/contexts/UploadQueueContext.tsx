/**
 * UploadQueueContext
 *
 * Manages background upload jobs. When the user presses "Post", CameraScreen
 * calls enqueue() and immediately navigates back to the Map. The pipeline
 * runs in the background and the UploadToast component reflects the result.
 *
 * This is "foreground-background": the upload continues while the app is
 * active. If the app is backgrounded by iOS, the upload may be suspended.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { runUploadPipeline } from '../services/upload-pipeline';
import { useAnalytics } from '../hooks/useAnalytics';
import type { CreateUploadData } from '../shared/types';
import type { UploadEventParams } from '../services/analytics.service';

// ============ Types ============

export type UploadJobStatus = 'uploading' | 'success' | 'failed';

export interface UploadJob {
  id: string;
  status: UploadJobStatus;
  mediaType: 'photo' | 'video';
  error?: string;
  enqueuedAt: number;
}

export interface EnqueueParams {
  uploadData: CreateUploadData;
  userId: string;
  deviceId: string;
}

interface UploadQueueContextValue {
  /** Start a background upload. Throws synchronously if userId or deviceId is missing. */
  enqueue: (params: EnqueueParams) => void;
  /** Number of jobs currently in progress. */
  activeCount: number;
  /** The most recently completed or failed job — drives the toast. */
  latestFinishedJob: UploadJob | null;
  /** Call after the toast finishes its exit animation to clear latestFinishedJob. */
  dismissToast: () => void;
  /** Increments each time an upload succeeds. Watch this to trigger a feed refresh. */
  uploadCompleteCount: number;
}

// ============ Context ============

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

// ============ Provider ============

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [latestFinishedJob, setLatestFinishedJob] = useState<UploadJob | null>(null);
  const [uploadCompleteCount, setUploadCompleteCount] = useState(0);
  const { trackUpload } = useAnalytics();

  // Stable ref so async callbacks always have access to trackUpload
  const trackUploadRef = useRef(trackUpload);
  trackUploadRef.current = trackUpload;

  const enqueue = useCallback(({ uploadData, userId, deviceId }: EnqueueParams) => {
    if (!userId) {
      throw new Error('User ID not available. Please sign in and try again.');
    }
    if (!deviceId) {
      throw new Error('Device ID not available. Please try again.');
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const job: UploadJob = {
      id,
      status: 'uploading',
      mediaType: uploadData.type,
      enqueuedAt: Date.now(),
    };

    setJobs(prev => [...prev, job]);

    const meta: UploadEventParams = {
      media_type: uploadData.type,
      has_caption: !!uploadData.caption,
    };

    runUploadPipeline({ uploadData, userId, deviceId })
      .then(() => {
        const finished: UploadJob = { ...job, status: 'success' };
        setJobs(prev => prev.map(j => j.id === id ? finished : j));
        setLatestFinishedJob(finished);
        setUploadCompleteCount(prev => prev + 1);
        trackUploadRef.current('complete', meta);
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : 'Upload failed. Please try again.';
        const finished: UploadJob = { ...job, status: 'failed', error };
        setJobs(prev => prev.map(j => j.id === id ? finished : j));
        setLatestFinishedJob(finished);
        trackUploadRef.current('fail', meta);
      });
  }, []);

  const dismissToast = useCallback(() => {
    setLatestFinishedJob(null);
    // Remove finished jobs from the list to keep memory bounded
    setJobs(prev => prev.filter(j => j.status === 'uploading'));
  }, []);

  const activeCount = jobs.filter(j => j.status === 'uploading').length;

  return (
    <UploadQueueContext.Provider value={{ enqueue, activeCount, latestFinishedJob, dismissToast, uploadCompleteCount }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

// ============ Hook ============

export function useUploadQueue(): UploadQueueContextValue {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) {
    throw new Error('useUploadQueue must be used within UploadQueueProvider');
  }
  return ctx;
}
