/**
 * Vote Utility Functions
 *
 * Shared functions for vote-related operations.
 */

import type { VoteType } from '../types';

/**
 * Create a vote ID from upload and device IDs
 */
export function createVoteId(uploadId: string, deviceId: string): string {
  return `${uploadId}#${deviceId}`;
}

/**
 * Calculate vote delta for updating upload vote count
 *
 * @param previousVoteType - The previous vote type (null if no previous vote)
 * @param newVoteType - The new vote type (null if removing vote)
 * @returns The delta to apply to the vote count
 */
export function calculateVoteDelta(
  previousVoteType: VoteType | null,
  newVoteType: VoteType | null
): number {
  if (previousVoteType === newVoteType) {
    return 0; // No change
  }

  if (previousVoteType === null) {
    // New vote
    return newVoteType === 'up' ? 1 : -1;
  }

  if (newVoteType === null) {
    // Removed vote
    return previousVoteType === 'up' ? -1 : 1;
  }

  // Changed vote (up to down or down to up)
  return newVoteType === 'up' ? 2 : -2;
}
