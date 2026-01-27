# Voting System Architecture

## Overview

The voting system uses individual vote items in DynamoDB as the source of truth. This design scales well because we never transfer voter lists - only the current user's votes and derived counts.

## Data Model

### Vote Item

```
PK: UPLOAD#<uploadId>
SK: VOTE#<userId>
GSI1PK: USER#<userId>
GSI1SK: VOTE#<uploadId>#<timestamp>
```

| Field | Type | Description |
|-------|------|-------------|
| `uploadId` | string | The upload being voted on |
| `userId` | string | Apple user ID of the voter |
| `voteType` | 'up' \| 'down' | The vote direction |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

### Upload Item (relevant fields)

| Field | Type | Description |
|-------|------|-------------|
| `voteCount` | number (optional) | Cached vote count for display. Source of truth is vote items. |

## Key Files

| File | Purpose |
|------|---------|
| `src/api/clients/dynamodb.client.ts` | DynamoDB operations for votes |
| `src/hooks/useVoting.ts` | React hook for vote interactions |
| `src/hooks/useUploadData.ts` | Manages uploads and derives userVotes |
| `src/providers/UploadDataProvider.ts` | Fetches uploads + user's votes |
| `src/components/VoteButtons.tsx` | UI component with vote buttons |

## Operations

### Loading the Feed

1. **Fetch uploads** - Scan for all uploads (metadata only, no voter lists)
2. **Fetch user's votes** - Single GSI query: `GSI1PK = USER#<userId>`
3. **Merge client-side** - Mark each upload with `userVote` from the votes map
4. **Display count** - Use cached `voteCount` from upload item (defaults to 0)

```typescript
// In UploadDataProvider.fetchFromAWS()
const [items, userVotesMap] = await Promise.all([
  getAllUploads(),
  userId ? getUserVotesMap(userId) : {},
]);
```

### Casting a Vote

1. User taps upvote/downvote button
2. Determine action based on current state:
   - Same vote type → Remove vote
   - Different/no vote → Cast new vote
3. Create/update/delete vote item in DynamoDB
4. Query all vote items for that upload to get fresh count
5. Update UI with new count and vote state

```typescript
// In useVoting.handleVote()
if (voteType === 'up') {
  if (currentVote === 'up') {
    result = await removeVote(uploadId, userId);
  } else {
    result = await castVote(uploadId, userId, 'up');
  }
}
```

### Vote Count Calculation

Vote count is derived by querying vote items:

```typescript
// In dynamodb.client.ts
export async function getVoteCountForUpload(uploadId: string): Promise<number> {
  // Query all vote items for this upload
  // Count: upvotes - downvotes
  return upvotes - downvotes;
}
```

## GSI Design

The GSI enables efficient "get all votes by user" queries:

```
GSI1PK: USER#<userId>
GSI1SK: VOTE#<uploadId>#<timestamp>
```

This allows fetching all of a user's votes in a single query, regardless of how many uploads exist.

## UI Behavior

| State | Upvote Button | Downvote Button |
|-------|---------------|-----------------|
| No vote | Gray | Gray |
| Upvoted | Green (SUCCESS color) | Gray |
| Downvoted | Gray | Red (DANGER color) |

Defined in `src/shared/constants/index.ts`:
- `SUCCESS: "#4CAF50"` - Green for upvotes
- `DANGER: "#f44336"` - Red for downvotes
- `UPVOTE_BG: "#e8f5e9"` - Light green background
- `DOWNVOTE_BG: "#ffebee"` - Light red background

## Scalability Considerations

### Current Design (works for moderate scale)

| Operation | DynamoDB Cost |
|-----------|---------------|
| Load feed | 1 scan + 1 GSI query |
| Cast vote | 1 put + 1 query (count) |

### For High Scale

For truly high-traffic scenarios (viral content with thousands of concurrent votes):

1. **DynamoDB Streams + Lambda**:
   - Vote items trigger stream events
   - Lambda aggregates counts asynchronously
   - Updates cached `voteCount` on upload item
   - Accept eventual consistency (counts may lag by seconds)

2. **Sharded Counters**:
   - Split vote count across multiple items
   - Aggregate on read
   - Reduces hot partition issues

3. **Caching Layer**:
   - Cache vote counts in Redis/ElastiCache
   - TTL-based invalidation
   - Fall back to DynamoDB on cache miss

## Trade-offs

| Aspect | Current Design | Alternative |
|--------|----------------|-------------|
| Consistency | Strong (count from items) | Eventual (cached count) |
| Latency | Higher (query on vote) | Lower (pre-computed) |
| Complexity | Simpler | Requires infrastructure |
| Scale limit | Moderate (~1000s votes/sec) | Higher with Streams |

## Authentication Requirement

Voting requires authentication (Apple Sign-In). The `userId` is the Apple user ID, ensuring:
- One vote per user per upload
- Votes persist across devices (same Apple ID)
- Anonymous users cannot vote (but can browse)

## Future Improvements

- [ ] Add DynamoDB Streams for async count aggregation
- [ ] Add optimistic UI updates (update locally, sync in background)
- [ ] Add vote analytics (trending content, vote velocity)
- [ ] Consider rate limiting to prevent vote manipulation
