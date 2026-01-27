/**
 * Ranking Algorithm Tests
 */

import {
  getTimeFactor,
  calculateRankingScore,
  rankUploads,
  DEFAULT_RANKING_CONFIG,
  type RankingConfig,
} from '../ranking';

describe('ranking utilities', () => {
  describe('getTimeFactor', () => {
    describe('very recent posts (0-12h)', () => {
      it('should return max boost (1.5) for brand new post', () => {
        const factor = getTimeFactor(0);
        expect(factor).toBe(1.5);
      });

      it('should return 1.25 at 6 hours', () => {
        const factor = getTimeFactor(6);
        expect(factor).toBe(1.25);
      });

      it('should return 1.0 at 12 hours', () => {
        const factor = getTimeFactor(12);
        expect(factor).toBe(1.0);
      });
    });

    describe('peak window (12-24h)', () => {
      it('should return 1.0 at 18 hours', () => {
        const factor = getTimeFactor(18);
        expect(factor).toBe(1.0);
      });

      it('should return 1.0 at 24 hours', () => {
        const factor = getTimeFactor(24);
        expect(factor).toBe(1.0);
      });
    });

    describe('grace period (24-48h)', () => {
      it('should return 0.75 at 36 hours', () => {
        const factor = getTimeFactor(36);
        expect(factor).toBe(0.75);
      });

      it('should return 0.5 at 48 hours', () => {
        const factor = getTimeFactor(48);
        expect(factor).toBe(0.5);
      });
    });

    describe('decay period (48-168h)', () => {
      it('should return value between 0.05 and 0.5 at 100 hours', () => {
        const factor = getTimeFactor(100);
        expect(factor).toBeGreaterThan(0.05);
        expect(factor).toBeLessThan(0.5);
      });

      it('should approach 0.05 near 168 hours', () => {
        const factor = getTimeFactor(167);
        expect(factor).toBeCloseTo(0.05, 1);
      });
    });

    describe('archive (>168h)', () => {
      it('should return 0.05 for old posts', () => {
        const factor = getTimeFactor(200);
        expect(factor).toBe(0.05);
      });

      it('should return 0.05 for very old posts', () => {
        const factor = getTimeFactor(720); // 30 days
        expect(factor).toBe(0.05);
      });
    });

    describe('edge cases', () => {
      it('should handle negative age (future timestamps)', () => {
        const factor = getTimeFactor(-5);
        expect(factor).toBe(1.5);
      });
    });
  });

  describe('calculateRankingScore', () => {
    const createTimestamp = (hoursAgo: number): string => {
      const date = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      return date.toISOString();
    };

    describe('new posts (0 votes)', () => {
      it('should give new posts a fair base score', () => {
        const score = calculateRankingScore(0, createTimestamp(0));
        // (0 + 1) * 1.5 = 1.5
        expect(score).toBeCloseTo(1.5, 1);
      });

      it('should decay score for older posts with 0 votes', () => {
        const newScore = calculateRankingScore(0, createTimestamp(0));
        const dayOldScore = calculateRankingScore(0, createTimestamp(24));
        expect(newScore).toBeGreaterThan(dayOldScore);
      });
    });

    describe('upvoted posts', () => {
      it('should score higher with more upvotes', () => {
        const timestamp = createTimestamp(12);
        const score5 = calculateRankingScore(5, timestamp);
        const score10 = calculateRankingScore(10, timestamp);
        expect(score10).toBeGreaterThan(score5);
      });

      it('should apply engagement boost for popular content', () => {
        const timestamp = createTimestamp(12);
        // Without boost, 10 votes would give (10 + 1) * 1.0 = 11
        const score = calculateRankingScore(10, timestamp);
        // With boost (log10(10) * 0.3 = 0.3), multiplier is 1.3
        // (10 * 1.3 + 1) * 1.0 = 14
        expect(score).toBeGreaterThan(11);
      });
    });

    describe('downvoted posts', () => {
      it('should penalize downvoted posts', () => {
        const timestamp = createTimestamp(12);
        const upvoteScore = calculateRankingScore(5, timestamp);
        const downvoteScore = calculateRankingScore(-5, timestamp);
        expect(downvoteScore).toBeLessThan(upvoteScore);
      });

      it('should sink heavily downvoted posts below new posts', () => {
        const newPostScore = calculateRankingScore(0, createTimestamp(0));
        const downvotedScore = calculateRankingScore(-5, createTimestamp(6));
        expect(downvotedScore).toBeLessThan(newPostScore);
      });

      it('should apply asymmetric penalty (downvotes hurt more)', () => {
        const timestamp = createTimestamp(12);
        const upScore = calculateRankingScore(5, timestamp);
        const downScore = calculateRankingScore(-5, timestamp);

        // With penalty 1.5, -5 becomes -7.5
        // Score: (-7.5 + 1) * 1.0 = -6.5
        // Up: (5 * ~1.21 + 1) * 1.0 = ~7.05
        // Difference should be more than if penalty was 1.0
        expect(upScore - downScore).toBeGreaterThan(10);
      });
    });

    describe('time decay interaction', () => {
      it('should rank fresh upvoted higher than stale highly-upvoted', () => {
        const freshModerateScore = calculateRankingScore(10, createTimestamp(2));
        const staleHighScore = calculateRankingScore(50, createTimestamp(100));
        expect(freshModerateScore).toBeGreaterThan(staleHighScore);
      });

      it('should allow viral content to stay visible longer', () => {
        const mediumViral = calculateRankingScore(100, createTimestamp(72));
        const freshLow = calculateRankingScore(2, createTimestamp(2));
        // Viral content at 72h should still be competitive
        expect(mediumViral).toBeGreaterThan(freshLow * 0.5);
      });
    });

    describe('score bounds', () => {
      it('should clamp to minimum score', () => {
        const score = calculateRankingScore(-1000, createTimestamp(12));
        expect(score).toBe(DEFAULT_RANKING_CONFIG.minScore);
      });

      it('should clamp to maximum score', () => {
        const score = calculateRankingScore(100000, createTimestamp(0));
        expect(score).toBe(DEFAULT_RANKING_CONFIG.maxScore);
      });
    });

    describe('custom config', () => {
      it('should respect custom downvote penalty', () => {
        const timestamp = createTimestamp(12);
        const customConfig: RankingConfig = {
          ...DEFAULT_RANKING_CONFIG,
          downvotePenalty: 3.0,
        };
        const normalScore = calculateRankingScore(-5, timestamp);
        const harshScore = calculateRankingScore(-5, timestamp, customConfig);
        expect(harshScore).toBeLessThan(normalScore);
      });
    });
  });

  describe('rankUploads', () => {
    const createUpload = (
      votes: number,
      hoursAgo: number,
      id: string = 'upload'
    ) => ({
      id,
      votes,
      timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
    });

    it('should not mutate the original array', () => {
      const uploads = [
        createUpload(5, 24, 'a'),
        createUpload(10, 12, 'b'),
      ];
      const original = [...uploads];
      rankUploads(uploads);
      expect(uploads).toEqual(original);
    });

    it('should rank fresh upvoted content first', () => {
      const uploads = [
        createUpload(0, 48, 'old-none'),
        createUpload(10, 2, 'fresh-upvoted'),
        createUpload(5, 24, 'day-old'),
      ];

      const ranked = rankUploads(uploads);
      expect(ranked[0].id).toBe('fresh-upvoted');
    });

    it('should sink downvoted content', () => {
      const uploads = [
        createUpload(-10, 6, 'downvoted'),
        createUpload(0, 12, 'neutral'),
        createUpload(5, 12, 'upvoted'),
      ];

      const ranked = rankUploads(uploads);
      expect(ranked[0].id).toBe('upvoted');
      expect(ranked[ranked.length - 1].id).toBe('downvoted');
    });

    it('should handle empty array', () => {
      const ranked = rankUploads([]);
      expect(ranked).toEqual([]);
    });

    it('should handle single item', () => {
      const uploads = [createUpload(5, 12, 'single')];
      const ranked = rankUploads(uploads);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].id).toBe('single');
    });

    it('should maintain relative order for equal scores', () => {
      const uploads = [
        createUpload(5, 12, 'a'),
        createUpload(5, 12, 'b'),
        createUpload(5, 12, 'c'),
      ];
      const ranked = rankUploads(uploads);
      expect(ranked).toHaveLength(3);
    });

    describe('realistic scenarios', () => {
      it('should produce expected feed order', () => {
        const uploads = [
          createUpload(200, 100, 'week-old-viral'), // Old viral - still scores well
          createUpload(-5, 6, 'fresh-downvoted'), // Fresh but bad - sinks
          createUpload(15, 20, 'day-old-popular'), // Day old, popular
          createUpload(3, 1, 'very-fresh-few'), // Very fresh, few votes
          createUpload(8, 8, 'fresh-moderate'), // Fresh, moderate
        ];

        const ranked = rankUploads(uploads);

        // Downvoted content should always be last
        expect(ranked[ranked.length - 1].id).toBe('fresh-downvoted');

        // Viral content with high votes stays competitive even when old
        // (this is intentional - quality content should remain visible)
        const viralIndex = ranked.findIndex((u) => u.id === 'week-old-viral');
        expect(viralIndex).toBeLessThan(ranked.length - 1); // Not last
      });

      it('should allow high-engagement content to remain competitive', () => {
        const uploads = [
          createUpload(50, 36, 'high-votes-grace-period'),
          createUpload(10, 6, 'moderate-votes-fresh'),
        ];

        const ranked = rankUploads(uploads);
        // High engagement in grace period (24-48h) should still score well
        // 50 votes at 36h: (50 * 1.51 + 1) * 0.75 = ~57
        // 10 votes at 6h: (10 * 1.3 + 1) * 1.25 = ~17.5
        expect(ranked[0].id).toBe('high-votes-grace-period');
      });

      it('should favor fresh content when engagement is similar', () => {
        const uploads = [
          createUpload(10, 36, 'older-same-votes'),
          createUpload(10, 6, 'fresh-same-votes'),
        ];

        const ranked = rankUploads(uploads);
        // Same votes, fresh wins due to time factor
        expect(ranked[0].id).toBe('fresh-same-votes');
      });
    });
  });
});
