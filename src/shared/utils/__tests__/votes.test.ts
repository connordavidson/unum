/**
 * Vote Utility Tests
 */

import { createVoteId, calculateVoteDelta } from '../votes';

describe('votes utilities', () => {
  describe('createVoteId', () => {
    it('should create a vote ID from upload and device IDs', () => {
      const result = createVoteId('upload-123', 'device-456');
      expect(result).toBe('upload-123#device-456');
    });

    it('should handle empty strings', () => {
      const result = createVoteId('', '');
      expect(result).toBe('#');
    });

    it('should handle IDs with special characters', () => {
      const result = createVoteId('upload-abc-123', 'device_xyz_789');
      expect(result).toBe('upload-abc-123#device_xyz_789');
    });

    it('should handle UUIDs', () => {
      const uploadId = '550e8400-e29b-41d4-a716-446655440000';
      const deviceId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      const result = createVoteId(uploadId, deviceId);
      expect(result).toBe(`${uploadId}#${deviceId}`);
    });
  });

  describe('calculateVoteDelta', () => {
    describe('new votes', () => {
      it('should return 1 for new upvote', () => {
        const result = calculateVoteDelta(null, 'up');
        expect(result).toBe(1);
      });

      it('should return -1 for new downvote', () => {
        const result = calculateVoteDelta(null, 'down');
        expect(result).toBe(-1);
      });
    });

    describe('removed votes', () => {
      it('should return -1 when removing an upvote', () => {
        const result = calculateVoteDelta('up', null);
        expect(result).toBe(-1);
      });

      it('should return 1 when removing a downvote', () => {
        const result = calculateVoteDelta('down', null);
        expect(result).toBe(1);
      });
    });

    describe('changed votes', () => {
      it('should return 2 when changing from downvote to upvote', () => {
        const result = calculateVoteDelta('down', 'up');
        expect(result).toBe(2);
      });

      it('should return -2 when changing from upvote to downvote', () => {
        const result = calculateVoteDelta('up', 'down');
        expect(result).toBe(-2);
      });
    });

    describe('no change', () => {
      it('should return 0 when vote type is the same (upvote)', () => {
        const result = calculateVoteDelta('up', 'up');
        expect(result).toBe(0);
      });

      it('should return 0 when vote type is the same (downvote)', () => {
        const result = calculateVoteDelta('down', 'down');
        expect(result).toBe(0);
      });

      it('should return 0 when both are null', () => {
        const result = calculateVoteDelta(null, null);
        expect(result).toBe(0);
      });
    });

    describe('edge cases - vote count tracking', () => {
      it('should correctly track count through a full vote lifecycle', () => {
        let count = 0;

        // User upvotes
        count += calculateVoteDelta(null, 'up');
        expect(count).toBe(1);

        // User changes to downvote
        count += calculateVoteDelta('up', 'down');
        expect(count).toBe(-1);

        // User removes downvote
        count += calculateVoteDelta('down', null);
        expect(count).toBe(0);
      });

      it('should handle multiple users voting', () => {
        let count = 0;

        // User 1 upvotes
        count += calculateVoteDelta(null, 'up');
        // User 2 upvotes
        count += calculateVoteDelta(null, 'up');
        // User 3 downvotes
        count += calculateVoteDelta(null, 'down');

        expect(count).toBe(1); // 2 upvotes - 1 downvote = 1
      });
    });
  });
});
