/**
 * useVoting Hook
 *
 * Manages user votes on uploads.
 * Handles local persistence and vote delta calculations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLocalVoteRepository,
  LocalVoteRepository,
} from '../repositories/local';
import { calculateVoteDelta } from '../shared/utils/votes';
import type { VoteType, UserVotes, Upload } from '../shared/types';

interface UseVotingResult {
  /** Map of upload IDs to user's vote on each */
  userVotes: UserVotes;
  /** Handle a vote on an upload, returns the vote delta */
  handleVote: (
    uploadId: string,
    voteType: VoteType,
    currentUploads: Upload[],
    onUploadsChange: (uploads: Upload[]) => void
  ) => Promise<void>;
  /** Load user votes from storage */
  loadUserVotes: () => Promise<void>;
  /** Save user votes to storage */
  saveUserVotes: (votes: UserVotes) => Promise<void>;
}

export function useVoting(): UseVotingResult {
  const [userVotes, setUserVotes] = useState<UserVotes>({});
  const voteRepoRef = useRef<LocalVoteRepository | null>(null);

  const getVoteRepo = useCallback(() => {
    if (!voteRepoRef.current) {
      voteRepoRef.current = getLocalVoteRepository();
    }
    return voteRepoRef.current;
  }, []);

  const loadUserVotes = useCallback(async () => {
    try {
      const repo = getVoteRepo();
      const storedVotes = await repo.getUserVotesLegacy();
      setUserVotes(storedVotes);
    } catch (err) {
      console.error('[useVoting] Failed to load user votes:', err);
    }
  }, [getVoteRepo]);

  const saveUserVotes = useCallback(async (newVotes: UserVotes) => {
    const repo = getVoteRepo();
    await repo.saveUserVotesLegacy(newVotes);
    setUserVotes(newVotes);
  }, [getVoteRepo]);

  // Load votes on mount
  useEffect(() => {
    loadUserVotes();
  }, [loadUserVotes]);

  const handleVote = useCallback(async (
    uploadId: string,
    voteType: VoteType,
    currentUploads: Upload[],
    onUploadsChange: (uploads: Upload[]) => void
  ) => {
    try {
      const currentVote = userVotes[uploadId];
      let voteDelta = 0;
      let newUserVotes = { ...userVotes };

      if (currentVote === voteType) {
        // Remove vote
        delete newUserVotes[uploadId];
        voteDelta = calculateVoteDelta(currentVote, null);
      } else if (currentVote) {
        // Change vote
        newUserVotes[uploadId] = voteType;
        voteDelta = calculateVoteDelta(currentVote, voteType);
      } else {
        // New vote
        newUserVotes[uploadId] = voteType;
        voteDelta = calculateVoteDelta(null, voteType);
      }

      // Update uploads with new vote count
      const newUploads = currentUploads.map((upload) =>
        upload.id === uploadId
          ? { ...upload, votes: upload.votes + voteDelta }
          : upload
      );

      // Save both changes
      await saveUserVotes(newUserVotes);
      onUploadsChange(newUploads);
    } catch (err) {
      console.error('[useVoting] Failed to update vote:', err);
      throw err;
    }
  }, [userVotes, saveUserVotes]);

  return {
    userVotes,
    handleVote,
    loadUserVotes,
    saveUserVotes,
  };
}
