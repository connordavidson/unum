/**
 * Ranking Algorithm for Unum
 *
 * A time-decay ranking algorithm that:
 * - Promotes recent content (24-48 hours)
 * - Boosts upvoted posts proportionally to engagement
 * - Demotes downvoted posts more aggressively
 */

export interface RankingConfig {
  downvotePenalty: number;
  engagementBoost: number;
  minScore: number;
  maxScore: number;
  peakWindowHours: number;
  gracePeriodHours: number;
  decayPeriodHours: number;
}

export const DEFAULT_RANKING_CONFIG: RankingConfig = {
  downvotePenalty: 1.5, // Downvotes hurt 50% more than upvotes help
  engagementBoost: 0.3, // Logarithmic boost for popular content
  minScore: -100, // Floor to prevent extreme negative scores
  maxScore: 1000, // Ceiling to prevent runaway scores
  peakWindowHours: 24,
  gracePeriodHours: 48,
  decayPeriodHours: 168, // 1 week
};

/**
 * Calculate time-based decay factor
 *
 * Time windows:
 * - 0-12h: Very recent boost (1.0 to 1.5)
 * - 12-24h: Peak window (1.0)
 * - 24-48h: Grace period (0.5 to 1.0)
 * - 48-168h: Steep decay (0.05 to 0.5)
 * - 168h+: Archive (0.05)
 */
export function getTimeFactor(
  ageInHours: number,
  config: RankingConfig = DEFAULT_RANKING_CONFIG
): number {
  if (ageInHours < 0) {
    // Future timestamps get max boost
    return 1.5;
  }

  if (ageInHours <= 12) {
    // Very recent: boost from 1.5 (at 0h) to 1.0 (at 12h)
    return 1.5 - (ageInHours / 12) * 0.5;
  }

  if (ageInHours <= config.peakWindowHours) {
    // Peak window: stable at 1.0
    return 1.0;
  }

  if (ageInHours <= config.gracePeriodHours) {
    // Grace period: gradual decay from 1.0 to 0.5
    const decayProgress =
      (ageInHours - config.peakWindowHours) /
      (config.gracePeriodHours - config.peakWindowHours);
    return 1.0 - decayProgress * 0.5;
  }

  if (ageInHours <= config.decayPeriodHours) {
    // Decay period: exponential decay from 0.5 to ~0.05
    const decayProgress =
      (ageInHours - config.gracePeriodHours) /
      (config.decayPeriodHours - config.gracePeriodHours);
    return 0.5 * Math.pow(0.1, decayProgress);
  }

  // Archive: minimal visibility
  return 0.05;
}

/**
 * Calculate ranking score for a single upload
 *
 * Formula:
 * score = (voteScore + 1) * timeFactor
 *
 * where voteScore applies asymmetric penalty for downvotes
 * and logarithmic boost for high-engagement content
 */
export function calculateRankingScore(
  votes: number,
  timestamp: string,
  config: RankingConfig = DEFAULT_RANKING_CONFIG
): number {
  const now = Date.now();
  const postTime = new Date(timestamp).getTime();
  const ageInHours = (now - postTime) / (1000 * 60 * 60);

  // Calculate vote score with asymmetric penalty
  let voteScore: number;

  if (votes >= 0) {
    // Positive votes: apply engagement multiplier
    const absVotes = Math.abs(votes);
    const engagementMultiplier =
      1 + Math.log10(Math.max(absVotes, 1)) * config.engagementBoost;
    voteScore = votes * engagementMultiplier;
  } else {
    // Negative votes: amplified by penalty
    voteScore = votes * config.downvotePenalty;
  }

  // Calculate time factor
  const timeFactor = getTimeFactor(ageInHours, config);

  // Final score: +1 gives new posts (0 votes) a fair chance
  const rawScore = (voteScore + 1) * timeFactor;

  // Clamp to bounds
  return Math.max(config.minScore, Math.min(config.maxScore, rawScore));
}

/**
 * Sort uploads by ranking score (descending)
 * Does not mutate the original array
 */
export function rankUploads<T extends { votes: number; timestamp: string }>(
  uploads: T[],
  config: RankingConfig = DEFAULT_RANKING_CONFIG
): T[] {
  return [...uploads].sort((a, b) => {
    const scoreA = calculateRankingScore(a.votes, a.timestamp, config);
    const scoreB = calculateRankingScore(b.votes, b.timestamp, config);
    return scoreB - scoreA; // Descending order (highest score first)
  });
}
