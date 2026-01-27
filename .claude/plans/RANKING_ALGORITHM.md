# Ranking Algorithm

## Overview

The ranking algorithm determines the order in which uploads appear in the feed. It balances **recency** (newer content gets priority) with **engagement** (upvoted content rises, downvoted sinks).

**Location**: `src/shared/utils/ranking.ts`

---

## Formula

```
score = (voteScore + 1) * timeFactor
```

Where:
- `voteScore` = adjusted vote count based on engagement
- `timeFactor` = multiplier based on post age (0.05 to 1.5)

---

## Time Factor

Posts decay over time through defined windows:

```
Time Factor
    ^
1.5 |  *****        <- Fresh boost (0-12h)
    |       ****
1.0 |-----------****  <- Peak window (12-24h)
    |               \
0.5 |                \____  <- Grace period (24-48h)
    |                     \____
0.05|                          \______  <- Decay/Archive (48h+)
    +----+----+----+----+----+----+----> Hours
    0   12   24   48   96  168
```

| Window | Hours | Time Factor | Description |
|--------|-------|-------------|-------------|
| Fresh | 0-12h | 1.5 → 1.0 | New posts get visibility boost |
| Peak | 12-24h | 1.0 | Full weight, fair competition |
| Grace | 24-48h | 1.0 → 0.5 | Gradual decline |
| Decay | 48-168h | 0.5 → 0.05 | Exponential decay |
| Archive | 168h+ | 0.05 | Minimal visibility |

---

## Vote Score

Votes are weighted asymmetrically:

**Upvotes** get an engagement multiplier:
```typescript
engagementMultiplier = 1 + log10(max(|votes|, 1)) * ENGAGEMENT_BOOST
voteScore = votes * engagementMultiplier
```

**Downvotes** hurt more than upvotes help:
```typescript
voteScore = votes * DOWNVOTE_PENALTY  // 1.5x penalty
```

This means:
- A post with +10 votes scores ~13 (with engagement boost)
- A post with -10 votes scores -15 (with penalty)

---

## Configuration

```typescript
const DEFAULT_CONFIG = {
  downvotePenalty: 1.5,      // Downvotes hurt 50% more
  engagementBoost: 0.3,      // Logarithmic boost factor
  minScore: -100,            // Floor for negative scores
  maxScore: 1000,            // Ceiling for positive scores
  peakWindowHours: 24,       // End of peak window
  gracePeriodHours: 48,      // End of grace period
  decayPeriodHours: 168,     // End of decay (1 week)
};
```

---

## Example Rankings

| Post | Age | Votes | Time Factor | Vote Score | Final Score |
|------|-----|-------|-------------|------------|-------------|
| Fresh viral | 2h | +50 | 1.42 | 75.5 | 108.6 |
| Peak popular | 18h | +100 | 1.0 | 160.0 | 161.0 |
| Grace period | 36h | +200 | 0.75 | 338.0 | 254.3 |
| Old mega-viral | 72h | +1000 | 0.31 | 1900.0 | 589.3 |
| Fresh downvoted | 4h | -10 | 1.33 | -15.0 | -18.7 |

---

## Usage

```typescript
import { rankUploads, calculateRankingScore } from '../shared/utils/ranking';

// Rank an array of uploads
const ranked = rankUploads(uploads);

// Get score for a single upload
const score = calculateRankingScore(votes, timestamp);
```

---

## Integration

The algorithm is applied in `UploadDataProvider.ts`:

```typescript
// In getAll() method:
uploads = rankUploads(uploads);
```

This replaces the previous simple timestamp sort.

---

## Tuning Guide

| Want to... | Adjust |
|------------|--------|
| Make downvotes hurt more | Increase `downvotePenalty` |
| Boost viral content more | Increase `engagementBoost` |
| Keep content fresh longer | Increase `peakWindowHours` |
| Decay content faster | Decrease `gracePeriodHours` |

---

## Testing

33 unit tests in `src/shared/utils/__tests__/ranking.test.ts`:

```bash
npm test -- ranking
```

Tests cover:
- Time factor calculations for all windows
- Vote score with positive/negative votes
- Engagement multiplier scaling
- Edge cases (zero votes, very old posts)
- Ranking order scenarios
