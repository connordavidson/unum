import { useState, useCallback, useMemo } from 'react';
import { MAP_CONFIG } from '../shared/constants';
import { clusterUploads } from '../shared/utils/clustering';
import type { Upload, MapRegion, ClusterResult } from '../shared/types';

interface UseMapStateResult {
  region: MapRegion;
  zoomLevel: number;
  clusters: ClusterResult;
  visibleUploads: Upload[];
  showIndividualMarkers: boolean;
  showUnclusteredMarkers: boolean;
  handleRegionChange: (region: MapRegion) => void;
}

// Estimate zoom level from region delta
function getZoomFromDelta(delta: number): number {
  return Math.round(Math.log2(360 / delta));
}

export function useMapState(uploads: Upload[]): UseMapStateResult {
  const [region, setRegion] = useState<MapRegion>({
    ...MAP_CONFIG.DEFAULT_CENTER,
    ...MAP_CONFIG.DEFAULT_DELTA,
  });

  const zoomLevel = useMemo(() => {
    return getZoomFromDelta(region.latitudeDelta);
  }, [region.latitudeDelta]);

  // Filter uploads visible in current region
  const visibleUploads = useMemo(() => {
    return uploads.filter((upload) => {
      const { latitude, longitude } = upload.coordinates;
      const latMin = region.latitude - region.latitudeDelta / 2;
      const latMax = region.latitude + region.latitudeDelta / 2;
      const lonMin = region.longitude - region.longitudeDelta / 2;
      const lonMax = region.longitude + region.longitudeDelta / 2;

      return (
        latitude >= latMin &&
        latitude <= latMax &&
        longitude >= lonMin &&
        longitude <= lonMax
      );
    });
  }, [uploads, region]);

  // Cluster visible uploads
  const clusters = useMemo(() => {
    return clusterUploads(visibleUploads);
  }, [visibleUploads]);

  // Determine what to show based on zoom level
  const showIndividualMarkers = zoomLevel >= MAP_CONFIG.ZOOM_THRESHOLD;
  const showUnclusteredMarkers = zoomLevel >= MAP_CONFIG.UNCLUSTERED_MIN_ZOOM;

  const handleRegionChange = useCallback((newRegion: MapRegion) => {
    setRegion(newRegion);
  }, []);

  return {
    region,
    zoomLevel,
    clusters,
    visibleUploads,
    showIndividualMarkers,
    showUnclusteredMarkers,
    handleRegionChange,
  };
}
