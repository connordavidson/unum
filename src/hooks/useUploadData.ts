import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS, API_CONFIG, FEATURE_FLAGS, BFF_STORAGE_KEYS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
import { TEST_UPLOADS } from '../data/testUploads';
import {
  getLocalUploadRepository,
  getLocalVoteRepository,
  LocalUploadRepository,
  LocalVoteRepository,
} from '../repositories/local';
import { getUploadService, UploadService } from '../services/upload.service';
import { getMediaService, MediaService } from '../services/media.service';
import type { Upload, CreateUploadData, VoteType, UserVotes } from '../shared/types';

interface UseUploadDataResult {
  uploads: Upload[];
  userVotes: UserVotes;
  loading: boolean;
  error: string | null;
  createUpload: (data: CreateUploadData) => Promise<void>;
  handleVote: (uploadId: number, voteType: VoteType) => Promise<void>;
  refreshUploads: () => Promise<void>;
}

// Generate a simple unique ID
function generateId(): number {
  return Date.now();
}

export function useUploadData(): UseUploadDataResult {
  // Debug: Log feature flags on every render (remove in production)
  console.log('[useUploadData] Rendering, USE_AWS_BACKEND:', FEATURE_FLAGS.USE_AWS_BACKEND);

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [userVotes, setUserVotes] = useState<UserVotes>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // Track if AWS services are ready (deviceId loaded)
  const [awsReady, setAwsReady] = useState(!FEATURE_FLAGS.USE_AWS_BACKEND);

  // Repository references (for local-only mode)
  const uploadRepoRef = useRef<LocalUploadRepository | null>(null);
  const voteRepoRef = useRef<LocalVoteRepository | null>(null);

  // Service references (for AWS mode)
  const uploadServiceRef = useRef<UploadService | null>(null);
  const mediaServiceRef = useRef<MediaService | null>(null);

  // Ref to track deviceId for async checks (refs update immediately, state doesn't)
  const deviceIdRef = useRef<string | null>(null);

  // Initialize device ID for AWS mode
  useEffect(() => {
    console.log('[Upload] useEffect running, USE_AWS_BACKEND:', FEATURE_FLAGS.USE_AWS_BACKEND);

    const initDeviceId = async () => {
      if (FEATURE_FLAGS.USE_AWS_BACKEND) {
        try {
          console.log('[Upload] Initializing AWS mode...');
          let id = await getStoredJSON<string>(BFF_STORAGE_KEYS.DEVICE_ID);
          console.log('[Upload] Got stored deviceId:', id);
          if (!id) {
            id = Crypto.randomUUID();
            await setStoredJSON(BFF_STORAGE_KEYS.DEVICE_ID, id);
            console.log('[Upload] Created new deviceId:', id);
          } else {
            console.log('[Upload] Loaded existing deviceId:', id);
          }
          deviceIdRef.current = id;  // Update ref immediately
          setDeviceId(id);
          setAwsReady(true);
          console.log('[Upload] AWS mode ready, deviceIdRef.current:', deviceIdRef.current);
        } catch (err) {
          console.error('[Upload] Failed to initialize AWS mode:', err);
        }
      } else {
        console.log('[Upload] AWS mode disabled, skipping initialization');
      }
    };
    initDeviceId();
  }, []);

  // Get or create repository instances
  const getUploadRepo = useCallback(() => {
    if (!uploadRepoRef.current) {
      uploadRepoRef.current = getLocalUploadRepository();
    }
    return uploadRepoRef.current;
  }, []);

  const getVoteRepo = useCallback(() => {
    if (!voteRepoRef.current) {
      voteRepoRef.current = getLocalVoteRepository();
    }
    return voteRepoRef.current;
  }, []);

  // Get or create service instances (for AWS mode)
  const getUploadSvc = useCallback(() => {
    // Use ref for most current deviceId value
    const currentDeviceId = deviceIdRef.current || deviceId;
    if (!uploadServiceRef.current && currentDeviceId) {
      uploadServiceRef.current = getUploadService({
        deviceId: currentDeviceId,
        useRemote: FEATURE_FLAGS.USE_AWS_BACKEND
      });
    }
    return uploadServiceRef.current;
  }, [deviceId]);

  const getMediaSvc = useCallback(() => {
    if (!mediaServiceRef.current) {
      mediaServiceRef.current = getMediaService({
        useRemote: FEATURE_FLAGS.USE_AWS_BACKEND
      });
    }
    return mediaServiceRef.current;
  }, []);

  // Load uploads from storage (or seed with test data)
  const loadUploads = useCallback(async () => {
    try {
      // When using test data, always clear and reseed to ensure correct format
      if (API_CONFIG.USE_TEST_DATA) {
        await AsyncStorage.removeItem(STORAGE_KEYS.UPLOADS);
        setUploads(TEST_UPLOADS);
        await setStoredJSON(STORAGE_KEYS.UPLOADS, TEST_UPLOADS);
      } else {
        // Use repository for loading
        const repo = getUploadRepo();
        const storedUploads = await repo.getAllLegacy();
        setUploads(storedUploads);
      }
      setError(null);
    } catch (err) {
      console.error('Failed to load uploads:', err);
      setError('Failed to load uploads');
    }
  }, [getUploadRepo]);

  // Load user votes from storage
  const loadUserVotes = useCallback(async () => {
    try {
      const repo = getVoteRepo();
      const storedVotes = await repo.getUserVotesLegacy();
      setUserVotes(storedVotes);
    } catch (err) {
      console.error('Failed to load user votes:', err);
    }
  }, [getVoteRepo]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadUploads(), loadUserVotes()]);
      setLoading(false);
    };
    init();
  }, [loadUploads, loadUserVotes]);

  // Save uploads to storage
  const saveUploads = useCallback(async (newUploads: Upload[]) => {
    const repo = getUploadRepo();
    await repo.saveAllLegacy(newUploads);
    setUploads(newUploads);
  }, [getUploadRepo]);

  // Save user votes to storage
  const saveUserVotes = useCallback(async (newVotes: UserVotes) => {
    const repo = getVoteRepo();
    await repo.saveUserVotesLegacy(newVotes);
    setUserVotes(newVotes);
  }, [getVoteRepo]);

  // Create a new upload
  const createUpload = useCallback(async (uploadData: CreateUploadData) => {
    console.log('[Upload] Starting upload...');
    console.log('[Upload] USE_AWS_BACKEND:', FEATURE_FLAGS.USE_AWS_BACKEND);
    console.log('[Upload] awsReady:', awsReady);
    console.log('[Upload] deviceId:', deviceId);

    try {
      // Wait for AWS initialization if needed (with timeout)
      // Use deviceIdRef.current since refs update immediately (state doesn't)
      if (FEATURE_FLAGS.USE_AWS_BACKEND && !deviceIdRef.current) {
        console.log('[Upload] Waiting for AWS initialization...');
        // Wait up to 3 seconds for initialization
        let waitTime = 0;
        const maxWait = 3000;
        const checkInterval = 100;

        while (!deviceIdRef.current && waitTime < maxWait) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          waitTime += checkInterval;
        }

        // Check again after waiting
        if (!deviceIdRef.current) {
          throw new Error('AWS services failed to initialize. Please restart the app.');
        }
        console.log('[Upload] AWS initialization complete after', waitTime, 'ms');
      }

      // Use AWS services if enabled (use ref for most current value)
      const currentDeviceId = deviceIdRef.current || deviceId;
      if (FEATURE_FLAGS.USE_AWS_BACKEND && currentDeviceId) {
        console.log('[Upload] Using AWS path');
        const uploadSvc = getUploadSvc();
        const mediaSvc = getMediaSvc();

        if (!uploadSvc || !mediaSvc) {
          throw new Error('Services not initialized');
        }

        // Generate upload ID
        const uploadId = Crypto.randomUUID();

        // Step 1: Upload media to S3
        console.log('Uploading media to S3...', uploadData.data);
        const mediaResult = await mediaSvc.upload({
          localPath: uploadData.data,
          uploadId,
          mediaType: uploadData.type,
          onProgress: (progress) => {
            console.log(`Upload progress: ${Math.round(progress * 100)}%`);
          },
        });
        console.log('Media uploaded:', mediaResult);

        // Step 2: Create upload record in DynamoDB
        console.log('Creating upload record in DynamoDB...');
        const bffUpload = await uploadSvc.createUpload({
          type: uploadData.type,
          mediaUrl: mediaResult.url,
          mediaKey: mediaResult.key,
          coordinates: uploadData.coordinates,
          caption: uploadData.caption,
        });
        console.log('Upload record created:', bffUpload);

        // Convert BFF upload to local format and add to state
        const newUpload: Upload = {
          id: parseInt(bffUpload.id.slice(-8), 16) || Date.now(), // Convert UUID to number for compatibility
          type: bffUpload.type,
          data: bffUpload.mediaUrl,
          coordinates: bffUpload.coordinates,
          timestamp: bffUpload.timestamp,
          caption: bffUpload.caption,
          votes: bffUpload.voteCount,
        };

        const newUploads = [newUpload, ...uploads];
        await saveUploads(newUploads);
        setError(null);
      } else {
        // Local-only mode
        console.log('[Upload] Using LOCAL-ONLY path (AWS not enabled or deviceId missing)');
        const newUpload: Upload = {
          id: generateId(),
          type: uploadData.type,
          data: uploadData.data,
          coordinates: uploadData.coordinates,
          timestamp: new Date().toISOString(),
          caption: uploadData.caption,
          votes: 0,
        };

        const newUploads = [newUpload, ...uploads];
        await saveUploads(newUploads);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to create upload:', err);
      setError('Failed to save upload');
      throw err;
    }
  }, [uploads, saveUploads, deviceId, awsReady, getUploadSvc, getMediaSvc]);

  // Vote on an upload
  const handleVote = useCallback(async (uploadId: number, voteType: VoteType) => {
    try {
      const voteRepo = getVoteRepo();
      const currentVote = userVotes[uploadId];
      let voteDelta = 0;
      let newUserVotes = { ...userVotes };

      if (currentVote === voteType) {
        // Remove vote
        delete newUserVotes[uploadId];
        voteDelta = voteRepo.calculateVoteDelta(currentVote, null);
      } else if (currentVote) {
        // Change vote
        newUserVotes[uploadId] = voteType;
        voteDelta = voteRepo.calculateVoteDelta(currentVote, voteType);
      } else {
        // New vote
        newUserVotes[uploadId] = voteType;
        voteDelta = voteRepo.calculateVoteDelta(null, voteType);
      }

      const newUploads = uploads.map((upload) =>
        upload.id === uploadId
          ? { ...upload, votes: upload.votes + voteDelta }
          : upload
      );

      await Promise.all([
        saveUploads(newUploads),
        saveUserVotes(newUserVotes),
      ]);

      setError(null);
    } catch (err) {
      console.error('Failed to update vote:', err);
      setError('Failed to update vote');
      throw err;
    }
  }, [uploads, userVotes, saveUploads, saveUserVotes, getVoteRepo]);

  // Refresh uploads
  const refreshUploads = useCallback(async () => {
    await loadUploads();
  }, [loadUploads]);

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
