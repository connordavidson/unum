import type { Upload } from '../shared/types';

// Test data around Pentagon City / Crystal City area (default map center)
export const TEST_UPLOADS: Upload[] = [
  {
    id: 'test-1',
    type: 'photo',
    uri: 'https://picsum.photos/seed/unum1/400/400',
    coordinates: {
      latitude: 38.8867,
      longitude: -77.0276,
    },
    timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
    caption: 'Right at the center',
    votes: 12,
  },
  {
    id: 'test-2',
    type: 'photo',
    uri: 'https://picsum.photos/seed/unum2/400/400',
    coordinates: {
      latitude: 38.8872,
      longitude: -77.0285,
    },
    timestamp: Date.now() - 1000 * 60 * 15, // 15 minutes ago
    caption: 'Near the mall',
    votes: 8,
  },
  {
    id: 'test-3',
    type: 'photo',
    uri: 'https://picsum.photos/seed/unum3/400/400',
    coordinates: {
      latitude: 38.8855,
      longitude: -77.0260,
    },
    timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    caption: 'Street view',
    votes: 24,
  },
  {
    id: 'test-4',
    type: 'video',
    uri: 'https://picsum.photos/seed/unum4/400/400',
    coordinates: {
      latitude: 38.8880,
      longitude: -77.0290,
    },
    timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
    votes: 5,
  },
  {
    id: 'test-5',
    type: 'photo',
    uri: 'https://picsum.photos/seed/unum5/400/400',
    coordinates: {
      latitude: 38.8845,
      longitude: -77.0300,
    },
    timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
    caption: 'Cool spot',
    votes: -3,
  },
  {
    id: 'test-6',
    type: 'photo',
    uri: 'https://picsum.photos/seed/unum6/400/400',
    coordinates: {
      latitude: 38.8890,
      longitude: -77.0250,
    },
    timestamp: Date.now() - 1000 * 60 * 180, // 3 hours ago
    caption: 'Check this out',
    votes: 31,
  },
];
