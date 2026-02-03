# Fix Overlapping Cluster Circles

**Status:** Completed
**Files Modified:** `src/shared/utils/clustering.ts`, `src/shared/utils/__tests__/clustering.test.ts`

## Problem

When there's a lot of activity spread across a metro area (like downtown Minneapolis), the map showed multiple overlapping red circles instead of merging them into 1-2 big circles.

**Root cause:** The clustering algorithm used single-hop neighbor finding. For each seed upload, it found all unvisited uploads within 2000m of that seed but did not expand transitively from those neighbors. So if uploads A->B are 1500m apart and B->C are 1500m apart, but A->C are 2800m apart, A and C ended up in separate clusters whose circles overlapped on the map.

## Solution

Two changes to `src/shared/utils/clustering.ts`:

### 1. BFS Expansion (DBSCAN-style)

Replaced the single-hop neighbor finding in `clusterUploads()` with a BFS queue that transitively expands:

```
for each unvisited upload (seed):
  queue = [seed], mark seed visited
  clusterMembers = []
  while queue not empty:
    current = dequeue
    add current to clusterMembers
    neighbors = findNearbyUploads(current) // unvisited within 2000m
    for each neighbor:
      mark visited, enqueue
  categorize clusterMembers by size (large/small/single)
```

This ensures chains of uploads within 2000m of each other all merge into one cluster. The existing `findNearbyUploads()` and spatial grid index are reused unchanged — only the loop in `clusterUploads()` changed.

### 2. Post-Merge Overlapping Circles

After BFS clustering, a merge pass combines large clusters whose rendered circles overlap:

```
for each pair of large clusters (i, j):
  if distance(center_i, center_j) < radius_i + radius_j:
    merge i and j (union-find)
recalculate center + radius for merged groups
```

This handles the edge case where two clusters have no 2000m path connecting them but their visual circles still overlap on the map.

Uses union-find with path compression for efficient grouping. O(k^2) where k = number of large clusters (typically < 20).

## Implementation Details

### clustering.ts - `clusterUploads()` (main loop)

Replaced single-hop neighbor finding with BFS queue:

```typescript
const clusterMembers: Upload[] = [];
const queue: Upload[] = [upload];
visited.add(upload.id);

while (queue.length > 0) {
  const current = queue.shift()!;
  clusterMembers.push(current);
  const neighbors = findNearbyUploads(current, grid, cellSize, visited, CLUSTER_CONFIG.THRESHOLD_METERS);
  for (const neighbor of neighbors) {
    visited.add(neighbor.id);
    queue.push(neighbor);
  }
}
```

### clustering.ts - `mergeOverlappingClusters()` (new function)

- Takes `Cluster[]`, returns `Cluster[]`
- Union-find with path compression to group overlapping clusters
- For each merged group: combines uploads, recalculates center and radius
- Called on `largeClusters` before returning from `clusterUploads()`

## Tests Added

4 new tests in `clustering.test.ts`:

1. **Chain clustering** - 5 uploads spaced 1500m apart in a line. Each adjacent pair is within 2000m but first-to-last is 6000m. Produces 1 large cluster.
2. **Distant uploads stay separate** - Two groups 50km apart remain as separate clusters.
3. **Dense metro chaining** - Multiple groups connected by chain links merge into 1 cluster.
4. **No uploads lost** - Total upload count across all result categories equals input count.

All 324 tests pass (320 existing + 4 new).

## Configuration

Relevant constants from `src/shared/constants/index.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `THRESHOLD_METERS` | 2000 | Max distance between neighbors for clustering |
| `MIN_FOR_CIRCLE` | 4 | Min uploads to render as circle vs numbered marker |
| `RADIUS_PADDING` | 200 | Extra meters added to cluster circle radius |
