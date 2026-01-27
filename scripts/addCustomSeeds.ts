/**
 * Add custom seed uploads to DynamoDB
 */

import 'dotenv/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import ngeohash from 'ngeohash';

const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  tableName: process.env.DYNAMO_TABLE || 'unum-data-dev',
};

const baseClient = new DynamoDBClient({
  region: config.region,
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
});
const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// 26th & Nicollet Ave, Minneapolis (Eat Street)
const LAT = 44.9629;
const LON = -93.2782;

interface Upload {
  id: string;
  type: 'photo' | 'video';
  mediaKey: string;
  caption: string;
  voteCount: number;
  hoursAgo: number;
}

const uploads: Upload[] = [
  {
    id: 'seed-eat-street-sign',
    type: 'photo',
    mediaKey: 'photos/2026/01/27/this-sign-just-broke-me-v0-nzubb7el86fg1.jpeg.webp',
    caption: 'This made me sad',
    voteCount: 358,
    hoursAgo: 36,
  },
  {
    id: 'seed-moments-before',
    type: 'photo',
    mediaKey: 'photos/2026/01/27/moments-before-the-video-v0-952rulgjwbfg1.jpeg.webp',
    caption: 'Moments before the video',
    voteCount: 3847,
    hoursAgo: 72,
  },
  {
    id: 'seed-alex-pretti-video',
    type: 'video',
    mediaKey: 'videos/2026/01/27/rapidsave.com_heres_a_slowed_down_zoomed_in_and_stabilized-wgymop6oxdfg1.mp4',
    caption: 'ALex Pretti Video',
    voteCount: 9371,
    hoursAgo: 40,
  },
];

async function createUpload(u: Upload): Promise<void> {
  const geohash = ngeohash.encode(LAT, LON, 6);
  const timestamp = new Date(Date.now() - u.hoursAgo * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const item = {
    PK: `UPLOAD#${u.id}`,
    SK: 'METADATA',
    GSI1PK: `GEOHASH#${geohash}`,
    GSI1SK: timestamp,
    id: u.id,
    type: u.type,
    mediaKey: u.mediaKey,
    latitude: LAT,
    longitude: LON,
    geohash,
    timestamp,
    caption: u.caption,
    voteCount: u.voteCount,
    userId: 'seed-user-001',
    deviceId: 'seed-device-001',
    createdAt: timestamp,
    updatedAt: now,
  };

  await docClient.send(new PutCommand({ TableName: config.tableName, Item: item }));
  console.log(`Created upload: ${u.id} (${u.voteCount} votes, ${u.hoursAgo}h ago)`);

  // Create vote items in batches of 25
  let created = 0;
  let batch: { PutRequest: { Item: Record<string, unknown> } }[] = [];

  for (let i = 0; i < u.voteCount; i++) {
    const voterId = `seed-voter-${u.id}-${i.toString().padStart(5, '0')}`;
    batch.push({
      PutRequest: {
        Item: {
          PK: `UPLOAD#${u.id}`,
          SK: `VOTE#${voterId}`,
          GSI1PK: `USER#${voterId}`,
          GSI1SK: `VOTE#${u.id}#${now}`,
          uploadId: u.id,
          userId: voterId,
          voteType: 'up',
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    if (batch.length === 25) {
      await docClient.send(new BatchWriteCommand({ RequestItems: { [config.tableName]: batch } }));
      created += batch.length;
      batch = [];
      if (created % 500 === 0) console.log(`  ...created ${created} votes`);
    }
  }

  if (batch.length > 0) {
    await docClient.send(new BatchWriteCommand({ RequestItems: { [config.tableName]: batch } }));
    created += batch.length;
  }

  console.log(`  Created ${created} vote items`);
}

async function run(): Promise<void> {
  console.log('\nLocation: 26th & Nicollet Ave (Eat Street), Minneapolis');
  console.log(`Coordinates: ${LAT}, ${LON}\n`);

  for (const u of uploads) {
    await createUpload(u);
  }

  console.log('\nDone!');
}

run().catch(console.error);
