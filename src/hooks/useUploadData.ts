import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, API_CONFIG } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
import { TEST_UPLOADS } from '../data/testUploads';
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

  // Load uploads from storage (or seed with test data)
  const loadUploads = useCallback(async () => {
    try {
      // When using test data, always clear and reseed to ensure correct format
      if (API_CONFIG.USE_TEST_DATA) {
        await AsyncStorage.removeItem(STORAGE_KEYS.UPLOADS);
        setUploads(TEST_UPLOADS);
        await setStoredJSON(STORAGE_KEYS.UPLOADS, TEST_UPLOADS);
      } else {
        const stored = await getStoredJSON<Upload[]>(STORAGE_KEYS.UPLOADS);
        if (stored) {
          setUploads(stored);
        }
      }
      setError(null);
    } catch (err) {
      console.error('Failed to load uploads:', err);
      setError('Failed to load uploads');
    }
  }, []);

  // Load user votes from storage
  const loadUserVotes = useCallback(async () => {
    try {
      const stored = await getStoredJSON<UserVotes>(STORAGE_KEYS.USER_VOTES);
      if (stored) {
        setUserVotes(stored);
      }
    } catch (err) {
      console.error('Failed to load user votes:', err);
    }
  }, []);

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
    await setStoredJSON(STORAGE_KEYS.UPLOADS, newUploads);
    setUploads(newUploads);
  }, []);

  // Save user votes to storage
  const saveUserVotes = useCallback(async (newVotes: UserVotes) => {
    await setStoredJSON(STORAGE_KEYS.USER_VOTES, newVotes);
    setUserVotes(newVotes);
  }, []);

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
      const currentVote = userVotes[uploadId];
      let voteDelta = 0;
      let newUserVotes = { ...userVotes };

      if (currentVote === voteType) {
        // Remove vote
        delete newUserVotes[uploadId];
        voteDelta = voteType === 'up' ? -1 : 1;
      } else if (currentVote) {
        // Change vote
        newUserVotes[uploadId] = voteType;
        voteDelta = voteType === 'up' ? 2 : -2;
      } else {
        // New vote
        newUserVotes[uploadId] = voteType;
        voteDelta = voteType === 'up' ? 1 : -1;
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
  }, [uploads, userVotes, saveUploads, saveUserVotes]);

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
