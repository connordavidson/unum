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
 * Group uploads into clusters based on proximity
 */
export function clusterUploads(uploads: Upload[]): ClusterResult {
  const visited = new Set<string>();
  const largeClusters: Cluster[] = [];
  const smallClusters: Cluster[] = [];
  const unclustered: Upload[] = [];

  for (const upload of uploads) {
    if (visited.has(upload.id)) continue;

    // Find all uploads within threshold distance
    const nearby = uploads.filter(
      (other) =>
        !visited.has(other.id) &&
        getDistanceMeters(upload.coordinates, other.coordinates) <=
          CLUSTER_CONFIG.THRESHOLD_METERS
    );

    if (nearby.length >= CLUSTER_CONFIG.MIN_FOR_CIRCLE) {
      // Large cluster - show as circle
      const center = calculateCenter(nearby);
      const radius = calculateRadius(nearby, center);

      largeClusters.push({
        center,
        count: nearby.length,
        radius,
        uploads: nearby,
      });

      nearby.forEach((u) => visited.add(u.id));
    } else if (nearby.length > 1) {
      // Small cluster - show as numbered marker
      const center = calculateCenter(nearby);
      const radius = calculateRadius(nearby, center);

      smallClusters.push({
        center,
        count: nearby.length,
        radius,
        uploads: nearby,
      });

      nearby.forEach((u) => visited.add(u.id));
    } else {
      // Single upload - unclustered
      unclustered.push(upload);
      visited.add(upload.id);
    }
  }

  return { largeClusters, smallClusters, unclustered };
}
