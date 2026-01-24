export type Coordinates = [number, number]; // [latitude, longitude]

export interface Upload {
  id: number;
  type: 'photo' | 'video';
  data: string;
  coordinates: Coordinates;
  timestamp: string;
  caption?: string;
  votes: number;
}

export interface CreateUploadData {
  type: 'photo' | 'video';
  data: string;
  coordinates: Coordinates;
  caption?: string;
}

export type VoteType = 'up' | 'down';

export interface UserVotes {
  [uploadId: number]: VoteType;
}

export interface Cluster {
  center: Coordinates;
  count: number;
  radius: number;
  uploads: Upload[];
}

export interface ClusterResult {
  largeClusters: Cluster[];
  smallClusters: Cluster[];
  unclustered: Upload[];
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}
