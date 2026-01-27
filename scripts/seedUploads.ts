/**
 * Seed Script: Create test uploads in DynamoDB
 *
 * Creates uploads with various timestamps and initial vote counts
 * to test the ranking algorithm.
 *
 * Usage: npx ts-node scripts/seedUploads.ts
 */

import 'dotenv/config';
import {
  DynamoDBClient,
  DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import ngeohash from 'ngeohash';
import { randomUUID } from 'crypto';

// ============ Configuration ============

const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  tableName: process.env.DYNAMO_TABLE || 'unum-data-dev',
  geohashPrecision: 6,
};

// ============ DynamoDB Client ============

const clientConfig: DynamoDBClientConfig = {
  region: config.region,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
};

const baseClient = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ============ Helper Functions ============

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function createUploadPK(uploadId: string): string {
  return `UPLOAD#${uploadId}`;
}

function createGeohashGSI1PK(geohash: string): string {
  return `GEOHASH#${geohash}`;
}

// ============ Test Upload Data ============

interface SeedUpload {
  id: string;
  caption: string;
  coordinates: [number, number]; // [lat, lon]
  hoursOld: number;
  initialVotes: number;
  type: 'photo' | 'video';
  mediaUrl: string; // Public URL for the media
}

// Public media URLs (using picsum.photos for images, w3schools for videos)
const PHOTO_URLS = [
  'https://picsum.photos/seed/seed1/800/600',
  'https://picsum.photos/seed/seed2/800/600',
  'https://picsum.photos/seed/seed3/800/600',
  'https://picsum.photos/seed/seed4/800/600',
  'https://picsum.photos/seed/seed5/800/600',
  'https://picsum.photos/seed/seed6/800/600',
  'https://picsum.photos/seed/seed7/800/600',
  'https://picsum.photos/seed/seed8/800/600',
  'https://picsum.photos/seed/seed9/800/600',
  'https://picsum.photos/seed/seed10/800/600',
  'https://picsum.photos/seed/seed11/800/600',
  'https://picsum.photos/seed/seed12/800/600',
  'https://picsum.photos/seed/seed13/800/600',
  'https://picsum.photos/seed/seed14/800/600',
  'https://picsum.photos/seed/seed15/800/600',
];

const VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';

// Test uploads distributed across ranking algorithm time windows
const SEED_UPLOADS: SeedUpload[] = [
  // === VERY FRESH (0-12h) - Should rank highest with good votes ===
  {
    id: 'seed-fresh-viral',
    caption: 'Breaking: Major event downtown!',
    coordinates: [35.2271, -80.8431],
    hoursOld: 1,
    initialVotes: 45,
    type: 'photo',
    mediaUrl: PHOTO_URLS[0],
  },
  {
    id: 'seed-fresh-moderate',
    caption: 'Morning traffic update',
    coordinates: [35.2295, -80.839],
    hoursOld: 3,
    initialVotes: 12,
    type: 'photo',
    mediaUrl: PHOTO_URLS[1],
  },
  {
    id: 'seed-fresh-downvoted',
    caption: 'Spam post - should sink',
    coordinates: [35.224, -80.8465],
    hoursOld: 2,
    initialVotes: -8,
    type: 'photo',
    mediaUrl: PHOTO_URLS[2],
  },
  {
    id: 'seed-fresh-new',
    caption: 'Just posted - no votes yet',
    coordinates: [35.231, -80.851],
    hoursOld: 0.5,
    initialVotes: 0,
    type: 'photo',
    mediaUrl: PHOTO_URLS[3],
  },
  {
    id: 'seed-fresh-video',
    caption: 'Live video from the scene',
    coordinates: [35.2205, -80.8355],
    hoursOld: 4,
    initialVotes: 28,
    type: 'video',
    mediaUrl: VIDEO_URL,
  },

  // === PEAK WINDOW (12-24h) - Still competitive ===
  {
    id: 'seed-peak-popular',
    caption: 'Yesterday highlight - lots of engagement',
    coordinates: [35.2185, -80.849],
    hoursOld: 14,
    initialVotes: 156,
    type: 'photo',
    mediaUrl: PHOTO_URLS[4],
  },
  {
    id: 'seed-peak-average',
    caption: 'Standard post from yesterday',
    coordinates: [35.233, -80.838],
    hoursOld: 18,
    initialVotes: 8,
    type: 'photo',
    mediaUrl: PHOTO_URLS[5],
  },
  {
    id: 'seed-peak-controversial',
    caption: 'Controversial take - mixed reactions',
    coordinates: [35.226, -80.855],
    hoursOld: 20,
    initialVotes: -15,
    type: 'photo',
    mediaUrl: PHOTO_URLS[6],
  },

  // === GRACE PERIOD (24-48h) - Fading but visible ===
  {
    id: 'seed-grace-viral',
    caption: 'Two days ago viral post - still relevant',
    coordinates: [35.2355, -80.8445],
    hoursOld: 30,
    initialVotes: 312,
    type: 'photo',
    mediaUrl: PHOTO_URLS[7],
  },
  {
    id: 'seed-grace-moderate',
    caption: 'Update from 36 hours ago',
    coordinates: [35.215, -80.841],
    hoursOld: 36,
    initialVotes: 45,
    type: 'photo',
    mediaUrl: PHOTO_URLS[8],
  },
  {
    id: 'seed-grace-poor',
    caption: 'Poorly received post',
    coordinates: [35.1168, -80.7237],
    hoursOld: 42,
    initialVotes: -25,
    type: 'photo',
    mediaUrl: PHOTO_URLS[9],
  },

  // === DECAYING (48-96h) - Needs high votes to stay visible ===
  {
    id: 'seed-decay-megaviral',
    caption: 'MEGA VIRAL from 3 days ago',
    coordinates: [35.1185, -80.7195],
    hoursOld: 60,
    initialVotes: 1250,
    type: 'photo',
    mediaUrl: PHOTO_URLS[10],
  },
  {
    id: 'seed-decay-good',
    caption: 'Good post from a few days back',
    coordinates: [35.1142, -80.728],
    hoursOld: 72,
    initialVotes: 89,
    type: 'photo',
    mediaUrl: PHOTO_URLS[11],
  },
  {
    id: 'seed-decay-average',
    caption: 'Average older post',
    coordinates: [35.1198, -80.7152],
    hoursOld: 84,
    initialVotes: 15,
    type: 'photo',
    mediaUrl: PHOTO_URLS[12],
  },

  // === ARCHIVE (>168h) - Minimal visibility ===
  {
    id: 'seed-archive-legendary',
    caption: 'Legendary post from last week',
    coordinates: [35.1125, -80.731],
    hoursOld: 180,
    initialVotes: 2500,
    type: 'photo',
    mediaUrl: PHOTO_URLS[13],
  },
  {
    id: 'seed-archive-forgotten',
    caption: 'Old forgotten post',
    coordinates: [35.121, -80.7265],
    hoursOld: 200,
    initialVotes: 20,
    type: 'photo',
    mediaUrl: PHOTO_URLS[14],
  },
];

// ============ Seed Functions ============

async function createUploadItem(upload: SeedUpload): Promise<void> {
  const [latitude, longitude] = upload.coordinates;
  const geohash = ngeohash.encode(latitude, longitude, config.geohashPrecision);
  const timestamp = hoursAgo(upload.hoursOld);
  const now = new Date().toISOString();

  const item = {
    PK: createUploadPK(upload.id),
    SK: 'METADATA',
    GSI1PK: createGeohashGSI1PK(geohash),
    GSI1SK: timestamp,
    id: upload.id,
    type: upload.type,
    mediaKey: upload.mediaUrl, // Use public URL directly (getDisplayUrl passes through http URLs)
    latitude,
    longitude,
    geohash,
    timestamp,
    caption: upload.caption,
    voteCount: upload.initialVotes,
    userId: 'seed-user-001',
    deviceId: 'seed-device-001',
    createdAt: timestamp,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: config.tableName,
      Item: item,
    })
  );

  console.log(`  ✓ Created: ${upload.id} (${upload.hoursOld}h old, ${upload.initialVotes} votes)`);
}

async function createVoteItems(uploadId: string, voteCount: number): Promise<void> {
  if (voteCount === 0) return;

  const isPositive = voteCount > 0;
  const count = Math.abs(voteCount);
  const voteType = isPositive ? 'up' : 'down';

  // Create individual vote items (batch of 25 max)
  const batches: Array<{ PutRequest: { Item: Record<string, unknown> } }[]> = [];
  let currentBatch: { PutRequest: { Item: Record<string, unknown> } }[] = [];

  for (let i = 0; i < count; i++) {
    const voterId = `seed-voter-${i.toString().padStart(4, '0')}`;
    const now = new Date().toISOString();

    const voteItem = {
      PK: createUploadPK(uploadId),
      SK: `VOTE#${voterId}`,
      GSI1PK: `USER#${voterId}`,
      GSI1SK: `VOTE#${uploadId}#${now}`,
      uploadId,
      userId: voterId,
      voteType,
      createdAt: now,
      updatedAt: now,
    };

    currentBatch.push({ PutRequest: { Item: voteItem } });

    if (currentBatch.length === 25) {
      batches.push(currentBatch);
      currentBatch = [];
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // Write batches
  for (const batch of batches) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [config.tableName]: batch,
        },
      })
    );
  }
}

async function seedAll(): Promise<void> {
  console.log('\n🌱 Seeding DynamoDB with test uploads...\n');
  console.log(`Table: ${config.tableName}`);
  console.log(`Region: ${config.region}\n`);

  if (!config.accessKeyId || !config.secretAccessKey) {
    console.error('❌ Error: AWS credentials not found in environment.');
    console.error('   Make sure .env file exists with AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  let created = 0;
  let failed = 0;

  for (const upload of SEED_UPLOADS) {
    try {
      await createUploadItem(upload);
      // Create individual vote items for realistic vote counting
      await createVoteItems(upload.id, upload.initialVotes);
      created++;
    } catch (err) {
      console.error(`  ✗ Failed: ${upload.id}`, err);
      failed++;
    }
  }

  console.log(`\n✅ Seeding complete: ${created} created, ${failed} failed\n`);

  // Print expected ranking order
  console.log('📊 Expected ranking order (highest to lowest score):');
  console.log('─'.repeat(60));

  const ranked = [...SEED_UPLOADS].sort((a, b) => {
    const scoreA = calculateExpectedScore(a);
    const scoreB = calculateExpectedScore(b);
    return scoreB - scoreA;
  });

  ranked.forEach((u, i) => {
    const score = calculateExpectedScore(u).toFixed(1);
    const ageLabel = getAgeLabel(u.hoursOld);
    console.log(
      `  ${(i + 1).toString().padStart(2)}. [${score.padStart(7)}] ${u.id.padEnd(25)} (${ageLabel}, ${u.initialVotes >= 0 ? '+' : ''}${u.initialVotes} votes)`
    );
  });

  console.log('');
}

function calculateExpectedScore(upload: SeedUpload): number {
  const { hoursOld, initialVotes } = upload;

  // Time factor calculation (matches ranking.ts)
  let timeFactor: number;
  if (hoursOld <= 12) {
    timeFactor = 1.5 - (hoursOld / 12) * 0.5;
  } else if (hoursOld <= 24) {
    timeFactor = 1.0;
  } else if (hoursOld <= 48) {
    timeFactor = 1.0 - ((hoursOld - 24) / 24) * 0.5;
  } else if (hoursOld <= 168) {
    const decay = (hoursOld - 48) / 120;
    timeFactor = 0.5 * Math.pow(0.1, decay);
  } else {
    timeFactor = 0.05;
  }

  // Vote score calculation
  let voteScore: number;
  if (initialVotes >= 0) {
    const engagementMultiplier = 1 + Math.log10(Math.max(initialVotes, 1)) * 0.3;
    voteScore = initialVotes * engagementMultiplier;
  } else {
    voteScore = initialVotes * 1.5; // Downvote penalty
  }

  return (voteScore + 1) * timeFactor;
}

function getAgeLabel(hours: number): string {
  if (hours < 1) return '<1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  if (hours < 48) return `${Math.round(hours / 24)}d`;
  return `${Math.round(hours / 24)}d`;
}

// Run the seed
seedAll().catch(console.error);
