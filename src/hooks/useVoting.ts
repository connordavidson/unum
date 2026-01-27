/**
 * useVoting Hook
 *
 * Manages user votes on uploads using individual vote items in DynamoDB.
 * Vote items are the source of truth; voteCount on uploads is cached.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  castVote,
  removeVote,
  getVoteCountForUpload,
  type VoteResult,
} from '../api/clients/dynamodb.client';
import { FEATURE_FLAGS } from '../shared/constants';
import type { VoteType, Upload } from '../shared/types';

interface UseVotingResult {
  /** Handle a vote on an upload */
  handleVote: (
    uploadId: string,
    voteType: VoteType,
    currentUploads: Upload[],
    onUploadsChange: (uploads: Upload[]) => void
  ) => Promise<void>;
  /** Check if a vote operation is in progress */
  isVoting: boolean;
}

interface UseVotingOptions {
  userId?: string;
}

export function useVoting(options: UseVotingOptions = {}): UseVotingResult {
  const [isVoting, setIsVoting] = useState(false);
  const userIdRef = useRef(options.userId || '');

  // Update userId ref when it changes
  useEffect(() => {
    userIdRef.current = options.userId || '';
  }, [options.userId]);

  const handleVote = useCallback(async (
    uploadId: string,
    voteType: VoteType,
    currentUploads: Upload[],
    onUploadsChange: (uploads: Upload[]) => void
  ) => {
    const userId = userIdRef.current;
    if (!userId) {
      console.error('[useVoting] No user ID available - user must be signed in to vote');
      return;
    }

    if (!FEATURE_FLAGS.USE_AWS_BACKEND) {
      console.warn('[useVoting] AWS backend not enabled');
      return;
    }

    setIsVoting(true);

    try {
      // Get current vote state from the upload
      const upload = currentUploads.find(u => u.id === uploadId);
      const currentVote = upload?.userVote;
      let result: VoteResult;

      if (voteType === 'up') {
        if (currentVote === 'up') {
          // Remove upvote
          result = await removeVote(uploadId, userId);
        } else {
          // Add upvote (replaces downvote if present)
          result = await castVote(uploadId, userId, 'up');
        }
      } else {
        // voteType === 'down'
        if (currentVote === 'down') {
          // Remove downvote
          result = await removeVote(uploadId, userId);
        } else {
          // Add downvote (replaces upvote if present)
          result = await castVote(uploadId, userId, 'down');
        }
      }

      // Update uploads with new vote count and user vote state from database
      const newUploads = currentUploads.map((u) =>
        u.id === uploadId
          ? { ...u, votes: result.voteCount, userVote: result.userVote }
          : u
      );
      onUploadsChange(newUploads);

      console.log('[useVoting] Vote updated:', {
        uploadId,
        voteType,
        newCount: result.voteCount,
        userVote: result.userVote,
      });
    } catch (err) {
      console.error('[useVoting] Failed to update vote:', err);
      throw err;
    } finally {
      setIsVoting(false);
    }
  }, []);

  return {
    handleVote,
    isVoting,
  };
}
