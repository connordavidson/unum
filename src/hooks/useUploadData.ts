import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, API_CONFIG, FEATURE_FLAGS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
import { TEST_UPLOADS } from '../data/testUploads';
import {
  getLocalUploadRepository,
  getLocalVoteRepository,
  LocalUploadRepository,
  LocalVoteRepository,
} from '../repositories/local';
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
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [userVotes, setUserVotes] = useState<UserVotes>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Repository references (for future use with FEATURE_FLAGS.USE_AWS_BACKEND)
  const uploadRepoRef = useRef<LocalUploadRepository | null>(null);
  const voteRepoRef = useRef<LocalVoteRepository | null>(null);

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
    try {
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
    } catch (err) {
      console.error('Failed to create upload:', err);
      setError('Failed to save upload');
      throw err;
    }
  }, [uploads, saveUploads]);

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
