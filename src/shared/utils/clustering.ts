import { CLUSTER_CONFIG } from '../constants';
import type { Upload, Coordinates, Cluster, ClusterResult } from '../types';

/**
 * Calculate distance between two coordinates in meters using Haversine formula
 */
export function getDistanceMeters(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const R = 6371000; // Earth's radius in meters
  const lat1Rad = (coord1[0] * Math.PI) / 180;
  const lat2Rad = (coord2[0] * Math.PI) / 180;
  const deltaLat = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const deltaLon = ((coord2[1] - coord1[1]) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate the center point of a group of coordinates
 */
export function calculateCenter(uploads: Upload[]): Coordinates {
  if (uploads.length === 0) {
    return [0, 0];
  }

  const sum = uploads.reduce(
    (acc, upload) => [
      acc[0] + upload.coordinates[0],
      acc[1] + upload.coordinates[1],
    ],
    [0, 0] as Coordinates
  );

  return [sum[0] / uploads.length, sum[1] / uploads.length];
}

/**
 * Calculate the radius needed to encompass all points from center
 */
export function calculateRadius(uploads: Upload[], center: Coordinates): number {
  if (uploads.length === 0) return 0;

  const maxDistance = Math.max(
    ...uploads.map((upload) => getDistanceMeters(center, upload.coordinates))
  );

  return maxDistance + CLUSTER_CONFIG.RADIUS_PADDING;
}

/**
 * Convert meters to approximate degrees at a given latitude
 * (Used for grid cell sizing)
 */
function metersToDegrees(meters: number, latitude: number): { lat: number; lon: number } {
  const latDegrees = meters / 111320; // ~111.32 km per degree latitude
  const lonDegrees = meters / (111320 * Math.cos((latitude * Math.PI) / 180));
  return { lat: latDegrees, lon: lonDegrees };
}

/**
 * Get grid cell key for a coordinate
 */
function getGridCell(coord: Coordinates, cellSize: { lat: number; lon: number }): string {
  const cellLat = Math.floor(coord[0] / cellSize.lat);
  const cellLon = Math.floor(coord[1] / cellSize.lon);
  return `${cellLat},${cellLon}`;
}

/**
 * Get all adjacent cell keys (including the cell itself)
 */
function getAdjacentCells(cellKey: string): string[] {
  const [cellLat, cellLon] = cellKey.split(',').map(Number);
  const cells: string[] = [];
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLon = -1; dLon <= 1; dLon++) {
      cells.push(`${cellLat + dLat},${cellLon + dLon}`);
    }
  }
  return cells;
}

/**
 * Build a spatial index (grid) for efficient neighbor lookup
 * Complexity: O(n) to build
 */
function buildSpatialIndex(
  uploads: Upload[],
  cellSize: { lat: number; lon: number }
): Map<string, Upload[]> {
  const grid = new Map<string, Upload[]>();

  for (const upload of uploads) {
    const cellKey = getGridCell(upload.coordinates, cellSize);
    if (!grid.has(cellKey)) {
      grid.set(cellKey, []);
    }
    grid.get(cellKey)!.push(upload);
  }

  return grid;
}

/**
 * Find nearby uploads using spatial index
 * Only checks uploads in adjacent grid cells
 */
function findNearbyUploads(
  upload: Upload,
  grid: Map<string, Upload[]>,
  cellSize: { lat: number; lon: number },
  visited: Set<string>,
  thresholdMeters: number
): Upload[] {
  const cellKey = getGridCell(upload.coordinates, cellSize);
  const adjacentCells = getAdjacentCells(cellKey);

  const nearby: Upload[] = [];

  for (const adjCellKey of adjacentCells) {
    const cellUploads = grid.get(adjCellKey);
    if (!cellUploads) continue;

    for (const other of cellUploads) {
      if (visited.has(other.id)) continue;
      if (getDistanceMeters(upload.coordinates, other.coordinates) <= thresholdMeters) {
        nearby.push(other);
      }
    }
  }

  return nearby;
}

/**
 * Merge large clusters whose rendered circles overlap.
 * Uses union-find to group overlapping clusters, then recalculates center/radius.
 */
function mergeOverlappingClusters(clusters: Cluster[]): Cluster[] {
  if (clusters.length <= 1) return clusters;

  const parent = clusters.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]; // path compression
      i = parent[i];
    }
    return i;
  }

  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  // Check all pairs for circle overlap
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const dist = getDistanceMeters(clusters[i].center, clusters[j].center);
      if (dist < clusters[i].radius + clusters[j].radius) {
        union(i, j);
      }
    }
  }

  // Group clusters by their root
  const groups = new Map<number, Cluster[]>();
  for (let i = 0; i < clusters.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(clusters[i]);
  }

  // Merge each group into a single cluster
  const merged: Cluster[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
    } else {
      const allUploads = group.flatMap((c) => c.uploads);
      const center = calculateCenter(allUploads);
      const radius = calculateRadius(allUploads, center);
      merged.push({
        center,
        count: allUploads.length,
        radius,
        uploads: allUploads,
      });
    }
  }

  return merged;
}

/**
 * Group uploads into clusters based on proximity
 * Uses grid-based spatial indexing with BFS expansion for transitive clustering.
 * Uploads connected by chains of neighbors within THRESHOLD_METERS merge into one cluster.
 */
export function clusterUploads(uploads: Upload[]): ClusterResult {
  if (uploads.length === 0) {
    return { largeClusters: [], smallClusters: [], unclustered: [] };
  }

  // Calculate average latitude for degree conversion
  const avgLat = uploads.reduce((sum, u) => sum + u.coordinates[0], 0) / uploads.length;
  const cellSize = metersToDegrees(CLUSTER_CONFIG.THRESHOLD_METERS, avgLat);

  // Build spatial index
  const grid = buildSpatialIndex(uploads, cellSize);

  const visited = new Set<string>();
  const largeClusters: Cluster[] = [];
  const smallClusters: Cluster[] = [];
  const unclustered: Upload[] = [];

  for (const upload of uploads) {
    if (visited.has(upload.id)) continue;

    // BFS expansion: find all transitively connected uploads
    const clusterMembers: Upload[] = [];
    const queue: Upload[] = [upload];
    visited.add(upload.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      clusterMembers.push(current);

      const neighbors = findNearbyUploads(
        current,
        grid,
        cellSize,
        visited,
        CLUSTER_CONFIG.THRESHOLD_METERS
      );

      for (const neighbor of neighbors) {
        visited.add(neighbor.id);
        queue.push(neighbor);
      }
    }

    if (clusterMembers.length >= CLUSTER_CONFIG.MIN_FOR_CIRCLE) {
      // Large cluster - show as circle
      const center = calculateCenter(clusterMembers);
      const radius = calculateRadius(clusterMembers, center);

      largeClusters.push({
        center,
        count: clusterMembers.length,
        radius,
        uploads: clusterMembers,
      });
    } else if (clusterMembers.length > 1) {
      // Small cluster - show as numbered marker
      const center = calculateCenter(clusterMembers);
      const radius = calculateRadius(clusterMembers, center);

      smallClusters.push({
        center,
        count: clusterMembers.length,
        radius,
        uploads: clusterMembers,
      });
    } else {
      // Single upload - unclustered
      unclustered.push(upload);
    }
  }

  // Post-merge: combine large clusters whose circles overlap
  const mergedLarge = mergeOverlappingClusters(largeClusters);

  return { largeClusters: mergedLarge, smallClusters, unclustered };
}
