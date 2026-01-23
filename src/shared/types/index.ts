export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Upload {
  id: string;
  type: 'photo' | 'video';
  uri: string;
  coordinates: Coordinates;
  timestamp: number;
  caption?: string;
  votes: number;
}

export interface CreateUploadData {
  type: 'photo' | 'video';
  uri: string;
  coordinates: Coordinates;
  caption?: string;
}

export type VoteType = 'up' | 'down';

export interface UserVotes {
  [uploadId: string]: VoteType;
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
