/**
 * Clustering Utility Tests
 */

import {
  getDistanceMeters,
  calculateCenter,
  calculateRadius,
  clusterUploads,
  generateClusterId,
} from '../clustering';
import { mockUpload, mockUploadsAtLocations } from '../../../__tests__/utils/testUtils';
import type { Upload, Coordinates } from '../../types';
import { CLUSTER_CONFIG } from '../../constants';

describe('clustering utilities', () => {
  describe('getDistanceMeters', () => {
    it('should return 0 for the same point', () => {
      const coord: Coordinates = [37.7749, -122.4194];
      const result = getDistanceMeters(coord, coord);
      expect(result).toBe(0);
    });

    it('should calculate distance between San Francisco and Los Angeles', () => {
      const sf: Coordinates = [37.7749, -122.4194];
      const la: Coordinates = [34.0522, -118.2437];

      const result = getDistanceMeters(sf, la);

      // Approximate distance is ~559 km
      expect(result).toBeGreaterThan(550000);
      expect(result).toBeLessThan(570000);
    });

    it('should calculate distance between New York and London', () => {
      const nyc: Coordinates = [40.7128, -74.006];
      const london: Coordinates = [51.5074, -0.1278];

      const result = getDistanceMeters(nyc, london);

      // Approximate distance is ~5570 km
      expect(result).toBeGreaterThan(5500000);
      expect(result).toBeLessThan(5600000);
    });

    it('should be symmetric (A to B = B to A)', () => {
      const coord1: Coordinates = [37.7749, -122.4194];
      const coord2: Coordinates = [40.7128, -74.006];

      const distance1 = getDistanceMeters(coord1, coord2);
      const distance2 = getDistanceMeters(coord2, coord1);

      expect(distance1).toBeCloseTo(distance2, 5);
    });

    it('should calculate short distances accurately', () => {
      // Two points approximately 100 meters apart
      const coord1: Coordinates = [37.7749, -122.4194];
      const coord2: Coordinates = [37.7758, -122.4194]; // ~100m north

      const result = getDistanceMeters(coord1, coord2);

      // Should be approximately 100 meters (1 degree latitude ≈ 111km)
      expect(result).toBeGreaterThan(90);
      expect(result).toBeLessThan(110);
    });

    it('should handle crossing the equator', () => {
      const north: Coordinates = [1, 0];
      const south: Coordinates = [-1, 0];

      const result = getDistanceMeters(north, south);

      // 2 degrees latitude ≈ 222km
      expect(result).toBeGreaterThan(220000);
      expect(result).toBeLessThan(225000);
    });

    it('should handle crossing the prime meridian', () => {
      const east: Coordinates = [51.5, 1];
      const west: Coordinates = [51.5, -1];

      const result = getDistanceMeters(east, west);

      // Should be a reasonable distance
      expect(result).toBeGreaterThan(100000);
      expect(result).toBeLessThan(200000);
    });

    it('should handle extreme latitudes (near poles)', () => {
      const arctic1: Coordinates = [89, 0];
      const arctic2: Coordinates = [89, 180];

      const result = getDistanceMeters(arctic1, arctic2);

      // Near the pole, 180 degrees longitude difference is small
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(500000); // Much less than at equator
    });
  });

  describe('calculateCenter', () => {
    it('should return [0, 0] for empty array', () => {
      const result = calculateCenter([]);
      expect(result).toEqual([0, 0]);
    });

    it('should return the same coordinates for a single upload', () => {
      const upload = mockUpload({ coordinates: [37.7749, -122.4194] });
      const result = calculateCenter([upload]);

      expect(result).toEqual([37.7749, -122.4194]);
    });

    it('should calculate center of two uploads', () => {
      const uploads = [
        mockUpload({ coordinates: [37, -122] }),
        mockUpload({ coordinates: [39, -120] }),
      ];

      const result = calculateCenter(uploads);

      expect(result[0]).toBeCloseTo(38, 5);
      expect(result[1]).toBeCloseTo(-121, 5);
    });

    it('should calculate center of multiple uploads', () => {
      const uploads = [
        mockUpload({ coordinates: [0, 0] }),
        mockUpload({ coordinates: [10, 0] }),
        mockUpload({ coordinates: [0, 10] }),
        mockUpload({ coordinates: [10, 10] }),
      ];

      const result = calculateCenter(uploads);

      expect(result[0]).toBeCloseTo(5, 5);
      expect(result[1]).toBeCloseTo(5, 5);
    });

    it('should handle negative coordinates', () => {
      const uploads = [
        mockUpload({ coordinates: [-10, -10] }),
        mockUpload({ coordinates: [10, 10] }),
      ];

      const result = calculateCenter(uploads);

      expect(result[0]).toBeCloseTo(0, 5);
      expect(result[1]).toBeCloseTo(0, 5);
    });
  });

  describe('calculateRadius', () => {
    it('should return 0 for empty array', () => {
      const result = calculateRadius([], [0, 0]);
      expect(result).toBe(0);
    });

    it('should include padding for single upload at center', () => {
      const upload = mockUpload({ coordinates: [37.7749, -122.4194] });
      const center: Coordinates = [37.7749, -122.4194];

      const result = calculateRadius([upload], center);

      // Distance is 0, so radius should just be the padding
      expect(result).toBe(CLUSTER_CONFIG.RADIUS_PADDING);
    });

    it('should calculate radius to encompass all uploads', () => {
      const uploads = [
        mockUpload({ coordinates: [37.77, -122.42] }),
        mockUpload({ coordinates: [37.78, -122.41] }),
      ];
      const center: Coordinates = [37.775, -122.415];

      const result = calculateRadius(uploads, center);

      // Should be the max distance plus padding
      expect(result).toBeGreaterThan(CLUSTER_CONFIG.RADIUS_PADDING);
    });

    it('should use the farthest point for radius calculation', () => {
      const center: Coordinates = [37.7749, -122.4194];
      const uploads = [
        mockUpload({ coordinates: [37.7749, -122.4194] }), // At center
        mockUpload({ coordinates: [37.7759, -122.4194] }), // ~100m away
        mockUpload({ coordinates: [37.7849, -122.4194] }), // ~1km away (farthest)
      ];

      const result = calculateRadius(uploads, center);

      // Should be approximately 1km + padding
      expect(result).toBeGreaterThan(1000);
    });
  });

  describe('clusterUploads', () => {
    it('should return empty result for empty array', () => {
      const result = clusterUploads([]);

      expect(result).toEqual({
        largeClusters: [],
        smallClusters: [],
        unclustered: [],
      });
    });

    it('should put single upload in unclustered', () => {
      const upload = mockUpload({ id: 'single' });
      const result = clusterUploads([upload]);

      expect(result.largeClusters).toHaveLength(0);
      expect(result.smallClusters).toHaveLength(0);
      expect(result.unclustered).toHaveLength(1);
      expect(result.unclustered[0].id).toBe('single');
    });

    it('should put distant uploads in unclustered', () => {
      // Uploads far apart (different cities)
      const uploads = [
        mockUpload({ id: '1', coordinates: [37.7749, -122.4194] }), // SF
        mockUpload({ id: '2', coordinates: [40.7128, -74.006] }), // NYC
        mockUpload({ id: '3', coordinates: [34.0522, -118.2437] }), // LA
      ];

      const result = clusterUploads(uploads);

      expect(result.largeClusters).toHaveLength(0);
      expect(result.smallClusters).toHaveLength(0);
      expect(result.unclustered).toHaveLength(3);
    });

    it('should create small cluster for 2-3 nearby uploads', () => {
      // Close uploads (within threshold)
      const baseCoord: Coordinates = [37.7749, -122.4194];
      const uploads = [
        mockUpload({ id: '1', coordinates: baseCoord }),
        mockUpload({ id: '2', coordinates: [37.775, -122.4195] }), // ~10m away
        mockUpload({ id: '3', coordinates: [37.7751, -122.4193] }), // ~20m away
      ];

      const result = clusterUploads(uploads);

      // Should create a small cluster (2-3 uploads)
      expect(result.smallClusters.length).toBeGreaterThanOrEqual(1);
      expect(result.largeClusters).toHaveLength(0);
    });

    it('should create large cluster for 4+ nearby uploads', () => {
      // Many close uploads
      const baseCoord: Coordinates = [37.7749, -122.4194];
      const uploads = [
        mockUpload({ id: '1', coordinates: baseCoord }),
        mockUpload({ id: '2', coordinates: [37.7750, -122.4195] }),
        mockUpload({ id: '3', coordinates: [37.7751, -122.4193] }),
        mockUpload({ id: '4', coordinates: [37.7748, -122.4196] }),
        mockUpload({ id: '5', coordinates: [37.7752, -122.4192] }),
      ];

      const result = clusterUploads(uploads);

      // Should create a large cluster (4+ uploads)
      expect(result.largeClusters.length).toBeGreaterThanOrEqual(1);
    });

    it('should assign correct count to clusters', () => {
      // Create uploads that should form one cluster
      const uploads = mockUploadsAtLocations(
        [
          [37.7749, -122.4194],
          [37.7750, -122.4195],
          [37.7751, -122.4193],
          [37.7748, -122.4196],
          [37.7752, -122.4192],
        ],
        { id: 'cluster' }
      );

      const result = clusterUploads(uploads);

      const totalInClusters =
        result.largeClusters.reduce((sum, c) => sum + c.count, 0) +
        result.smallClusters.reduce((sum, c) => sum + c.count, 0) +
        result.unclustered.length;

      expect(totalInClusters).toBe(uploads.length);
    });

    it('should handle mixed clusters and unclustered', () => {
      const uploads = [
        // Cluster 1 - close together
        mockUpload({ id: 'c1-1', coordinates: [37.7749, -122.4194] }),
        mockUpload({ id: 'c1-2', coordinates: [37.7750, -122.4195] }),
        mockUpload({ id: 'c1-3', coordinates: [37.7751, -122.4193] }),
        mockUpload({ id: 'c1-4', coordinates: [37.7748, -122.4196] }),
        // Isolated upload
        mockUpload({ id: 'isolated', coordinates: [40.7128, -74.006] }), // NYC
      ];

      const result = clusterUploads(uploads);

      // Should have at least one cluster and one unclustered
      const clusterCount = result.largeClusters.length + result.smallClusters.length;
      expect(clusterCount).toBeGreaterThanOrEqual(1);
      expect(result.unclustered).toHaveLength(1);
      expect(result.unclustered[0].id).toBe('isolated');
    });

    it('should set cluster center correctly', () => {
      const uploads = [
        mockUpload({ id: '1', coordinates: [37.7749, -122.4194] }),
        mockUpload({ id: '2', coordinates: [37.7751, -122.4196] }),
      ];

      const result = clusterUploads(uploads);

      if (result.smallClusters.length > 0) {
        const cluster = result.smallClusters[0];
        // Center should be approximately in the middle
        expect(cluster.center[0]).toBeCloseTo(37.775, 2);
        expect(cluster.center[1]).toBeCloseTo(-122.4195, 2);
      }
    });

    it('should include all uploads in cluster.uploads array', () => {
      const uploads = [
        mockUpload({ id: '1', coordinates: [37.7749, -122.4194] }),
        mockUpload({ id: '2', coordinates: [37.7750, -122.4195] }),
        mockUpload({ id: '3', coordinates: [37.7751, -122.4193] }),
        mockUpload({ id: '4', coordinates: [37.7748, -122.4196] }),
      ];

      const result = clusterUploads(uploads);

      // Get all uploads from all clusters
      const uploadIdsInClusters = new Set([
        ...result.largeClusters.flatMap((c) => c.uploads.map((u) => u.id)),
        ...result.smallClusters.flatMap((c) => c.uploads.map((u) => u.id)),
        ...result.unclustered.map((u) => u.id),
      ]);

      expect(uploadIdsInClusters.size).toBe(uploads.length);
    });

    it('should not duplicate uploads across clusters', () => {
      const uploads = mockUploadsAtLocations(
        Array(10)
          .fill(null)
          .map((_, i) => [37.7749 + i * 0.0001, -122.4194 + i * 0.0001] as Coordinates)
      );

      const result = clusterUploads(uploads);

      const allUploadIds = [
        ...result.largeClusters.flatMap((c) => c.uploads.map((u) => u.id)),
        ...result.smallClusters.flatMap((c) => c.uploads.map((u) => u.id)),
        ...result.unclustered.map((u) => u.id),
      ];

      const uniqueIds = new Set(allUploadIds);
      expect(uniqueIds.size).toBe(allUploadIds.length);
    });

    it('should handle large number of uploads efficiently', () => {
      // Generate 100 random uploads
      const uploads = Array(100)
        .fill(null)
        .map((_, i) =>
          mockUpload({
            id: `upload-${i}`,
            coordinates: [37.7 + Math.random() * 0.2, -122.5 + Math.random() * 0.2],
          })
        );

      const startTime = Date.now();
      const result = clusterUploads(uploads);
      const endTime = Date.now();

      // Should complete in reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000);

      // All uploads should be accounted for
      const totalUploads =
        result.largeClusters.reduce((sum, c) => sum + c.count, 0) +
        result.smallClusters.reduce((sum, c) => sum + c.count, 0) +
        result.unclustered.length;

      expect(totalUploads).toBe(100);
    });

    it('should merge chain-connected uploads into one cluster via BFS expansion', () => {
      // 5 uploads spaced ~1500m apart in a line (latitude).
      // At ~45° lat, 0.01348 degrees ≈ 1500m.
      // Each adjacent pair is within 2000m, but first-to-last is ~6000m.
      // Old single-hop algorithm would create multiple small clusters.
      // BFS expansion should chain them into 1 large cluster.
      const step = 0.01348; // ~1500m in latitude degrees
      const baseLat = 45.0;
      const lon = -93.0;

      const uploads = [
        mockUpload({ id: 'chain-a', coordinates: [baseLat, lon] }),
        mockUpload({ id: 'chain-b', coordinates: [baseLat + step, lon] }),
        mockUpload({ id: 'chain-c', coordinates: [baseLat + step * 2, lon] }),
        mockUpload({ id: 'chain-d', coordinates: [baseLat + step * 3, lon] }),
        mockUpload({ id: 'chain-e', coordinates: [baseLat + step * 4, lon] }),
      ];

      const result = clusterUploads(uploads);

      // All 5 should be in a single large cluster (5 >= MIN_FOR_CIRCLE of 4)
      expect(result.largeClusters).toHaveLength(1);
      expect(result.largeClusters[0].count).toBe(5);
      expect(result.smallClusters).toHaveLength(0);
      expect(result.unclustered).toHaveLength(0);
    });

    it('should not chain uploads separated by more than threshold', () => {
      // Two pairs of uploads, each pair close together, but pairs are far apart.
      // Gap between pairs is 5000m (well beyond 2000m threshold).
      const uploads = [
        mockUpload({ id: 'pair1-a', coordinates: [45.0, -93.0] }),
        mockUpload({ id: 'pair1-b', coordinates: [45.001, -93.0] }), // ~111m away
        mockUpload({ id: 'pair2-a', coordinates: [45.045, -93.0] }), // ~5009m from pair1
        mockUpload({ id: 'pair2-b', coordinates: [45.046, -93.0] }), // ~111m from pair2-a
      ];

      const result = clusterUploads(uploads);

      // Should be 2 separate small clusters, no large clusters
      expect(result.largeClusters).toHaveLength(0);
      expect(result.smallClusters).toHaveLength(2);
      expect(result.unclustered).toHaveLength(0);
    });

    it('should handle a dense metro scenario with chain connections', () => {
      // Simulates downtown Minneapolis: many uploads spread over ~4km
      // with chain connections between nearby groups.
      // Each adjacent upload is ~800m apart, well within 2000m threshold.
      const step = 0.00719; // ~800m in latitude degrees
      const baseLat = 44.97;
      const lon = -93.27;

      // 8 uploads in a line, each 800m apart, spanning ~5600m
      const uploads = Array.from({ length: 8 }, (_, i) =>
        mockUpload({
          id: `metro-${i}`,
          coordinates: [baseLat + step * i, lon],
        })
      );

      const result = clusterUploads(uploads);

      // BFS should chain all 8 into 1 large cluster
      expect(result.largeClusters).toHaveLength(1);
      expect(result.largeClusters[0].count).toBe(8);
      expect(result.smallClusters).toHaveLength(0);
      expect(result.unclustered).toHaveLength(0);
    });

    it('should preserve all uploads when BFS chaining creates large clusters', () => {
      // Chain of 6 uploads. Verify no uploads are lost or duplicated.
      const step = 0.01; // ~1113m
      const uploads = Array.from({ length: 6 }, (_, i) =>
        mockUpload({
          id: `preserve-${i}`,
          coordinates: [45.0 + step * i, -93.0],
        })
      );

      const result = clusterUploads(uploads);

      const allIds = [
        ...result.largeClusters.flatMap((c) => c.uploads.map((u) => u.id)),
        ...result.smallClusters.flatMap((c) => c.uploads.map((u) => u.id)),
        ...result.unclustered.map((u) => u.id),
      ];

      // All 6 uploads accounted for, no duplicates
      expect(allIds).toHaveLength(6);
      expect(new Set(allIds).size).toBe(6);
      for (let i = 0; i < 6; i++) {
        expect(allIds).toContain(`preserve-${i}`);
      }
    });
  });

  describe('generateClusterId', () => {
    it('should produce deterministic IDs for the same input', () => {
      const uploads = [
        mockUpload({ id: 'a' }),
        mockUpload({ id: 'b' }),
        mockUpload({ id: 'c' }),
      ];

      const id1 = generateClusterId(uploads);
      const id2 = generateClusterId(uploads);

      expect(id1).toBe(id2);
    });

    it('should produce the same ID regardless of input order', () => {
      const uploadsForward = [
        mockUpload({ id: 'x' }),
        mockUpload({ id: 'y' }),
        mockUpload({ id: 'z' }),
      ];
      const uploadsReversed = [
        mockUpload({ id: 'z' }),
        mockUpload({ id: 'y' }),
        mockUpload({ id: 'x' }),
      ];

      expect(generateClusterId(uploadsForward)).toBe(generateClusterId(uploadsReversed));
    });

    it('should produce different IDs for different member sets', () => {
      const cluster1 = [mockUpload({ id: 'a' }), mockUpload({ id: 'b' })];
      const cluster2 = [mockUpload({ id: 'c' }), mockUpload({ id: 'd' })];

      expect(generateClusterId(cluster1)).not.toBe(generateClusterId(cluster2));
    });

    it('should produce IDs with the cluster- prefix', () => {
      const uploads = [mockUpload({ id: 'test' })];
      const id = generateClusterId(uploads);

      expect(id).toMatch(/^cluster-/);
    });
  });

  describe('cluster IDs in clusterUploads', () => {
    it('should assign defined IDs to all large clusters', () => {
      const uploads = mockUploadsAtLocations(
        [
          [37.7749, -122.4194],
          [37.7750, -122.4195],
          [37.7751, -122.4193],
          [37.7748, -122.4196],
          [37.7752, -122.4192],
        ],
        { id: 'lg' }
      );

      const result = clusterUploads(uploads);

      for (const cluster of result.largeClusters) {
        expect(cluster.id).toBeDefined();
        expect(cluster.id).toMatch(/^cluster-/);
      }
    });

    it('should assign defined IDs to all small clusters', () => {
      const uploads = [
        mockUpload({ id: 'pair-a', coordinates: [45.0, -93.0] }),
        mockUpload({ id: 'pair-b', coordinates: [45.001, -93.0] }),
      ];

      const result = clusterUploads(uploads);

      for (const cluster of result.smallClusters) {
        expect(cluster.id).toBeDefined();
        expect(cluster.id).toMatch(/^cluster-/);
      }
    });

    it('should produce stable IDs when a distant upload is added', () => {
      // Local cluster
      const localUploads = [
        mockUpload({ id: 'local-1', coordinates: [45.0, -93.0] }),
        mockUpload({ id: 'local-2', coordinates: [45.001, -93.0] }),
        mockUpload({ id: 'local-3', coordinates: [45.002, -93.0] }),
        mockUpload({ id: 'local-4', coordinates: [45.003, -93.0] }),
      ];

      const result1 = clusterUploads(localUploads);

      // Add a distant upload that shouldn't affect the local cluster
      const withDistant = [
        ...localUploads,
        mockUpload({ id: 'distant', coordinates: [30.0, -80.0] }),
      ];

      const result2 = clusterUploads(withDistant);

      // The local cluster should have the same ID in both cases
      expect(result1.largeClusters.length).toBeGreaterThanOrEqual(1);
      expect(result2.largeClusters.length).toBeGreaterThanOrEqual(1);

      const localCluster1 = result1.largeClusters[0];
      const localCluster2 = result2.largeClusters.find(c =>
        c.uploads.some(u => u.id === 'local-1')
      );

      expect(localCluster2).toBeDefined();
      expect(localCluster1.id).toBe(localCluster2!.id);
    });

    it('should produce deterministic IDs for merged clusters', () => {
      // Two groups of uploads close enough that their circles overlap and merge
      const step = 0.005; // ~556m
      const uploads = Array.from({ length: 8 }, (_, i) =>
        mockUpload({
          id: `merge-${i}`,
          coordinates: [45.0 + step * i, -93.0],
        })
      );

      const result1 = clusterUploads(uploads);
      const result2 = clusterUploads(uploads);

      expect(result1.largeClusters.length).toBe(result2.largeClusters.length);
      for (let i = 0; i < result1.largeClusters.length; i++) {
        expect(result1.largeClusters[i].id).toBe(result2.largeClusters[i].id);
      }
    });
  });
});
