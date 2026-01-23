import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { Upload, CreateUploadData, VoteType, UserVotes } from '../shared/types';

interface UseUploadDataResult {
  uploads: Upload[];
  userVotes: UserVotes;
  loading: boolean;
  error: string | null;
  createUpload: (data: CreateUploadData) => Promise<void>;
  handleVote: (uploadId: string, voteType: VoteType) => Promise<void>;
  refreshUploads: () => Promise<void>;
}

// Generate a simple unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function useUploadData(): UseUploadDataResult {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [userVotes, setUserVotes] = useState<UserVotes>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load uploads from storage
  const loadUploads = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.UPLOADS);
      if (stored) {
        setUploads(JSON.parse(stored));
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
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USER_VOTES);
      if (stored) {
        setUserVotes(JSON.parse(stored));
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
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.UPLOADS, JSON.stringify(newUploads));
      setUploads(newUploads);
    } catch (err) {
      console.error('Failed to save uploads:', err);
      throw err;
    }
  }, []);

  // Save user votes to storage
  const saveUserVotes = useCallback(async (newVotes: UserVotes) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_VOTES, JSON.stringify(newVotes));
      setUserVotes(newVotes);
    } catch (err) {
      console.error('Failed to save user votes:', err);
      throw err;
    }
  }, []);

  // Create a new upload
  const createUpload = useCallback(async (data: CreateUploadData) => {
    try {
      const newUpload: Upload = {
        id: generateId(),
        type: data.type,
        uri: data.uri,
        coordinates: data.coordinates,
        timestamp: Date.now(),
        caption: data.caption,
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
  const handleVote = useCallback(async (uploadId: string, voteType: VoteType) => {
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
