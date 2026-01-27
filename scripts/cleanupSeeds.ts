/**
 * Cleanup Seed Data Script
 *
 * Removes all seeded test uploads from DynamoDB.
 * Useful for resetting to a clean state.
 *
 * Usage: npx ts-node scripts/cleanupSeeds.ts
 */

import 'dotenv/config';
import {
  DynamoDBClient,
  DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

// ============ Configuration ============

const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  tableName: process.env.DYNAMO_TABLE || 'unum-data-dev',
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

// ============ Seed Upload IDs ============

const SEED_UPLOAD_IDS = [
  'seed-fresh-viral',
  'seed-fresh-moderate',
  'seed-fresh-downvoted',
  'seed-fresh-new',
  'seed-fresh-video',
  'seed-peak-popular',
  'seed-peak-average',
  'seed-peak-controversial',
  'seed-grace-viral',
  'seed-grace-moderate',
  'seed-grace-poor',
  'seed-decay-megaviral',
  'seed-decay-good',
  'seed-decay-average',
  'seed-archive-legendary',
  'seed-archive-forgotten',
];

// ============ Functions ============

function createUploadPK(uploadId: string): string {
  return `UPLOAD#${uploadId}`;
}

async function deleteUploadAndVotes(uploadId: string): Promise<number> {
  const pk = createUploadPK(uploadId);
  let deletedCount = 0;

  // First, query all items with this PK (upload + all votes)
  let lastKey: Record<string, unknown> | undefined;
  const keysToDelete: { PK: string; SK: string }[] = [];

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        ExclusiveStartKey: lastKey,
      })
    );

    if (result.Items) {
      for (const item of result.Items) {
        keysToDelete.push({
          PK: item.PK as string,
          SK: item.SK as string,
        });
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  // Batch delete (max 25 per batch)
  const batches: { PK: string; SK: string }[][] = [];
  for (let i = 0; i < keysToDelete.length; i += 25) {
    batches.push(keysToDelete.slice(i, i + 25));
  }

  for (const batch of batches) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [config.tableName]: batch.map((key) => ({
            DeleteRequest: { Key: key },
          })),
        },
      })
    );
    deletedCount += batch.length;
  }

  return deletedCount;
}

async function runCleanup(): Promise<void> {
  console.log('\n🧹 Cleaning up seed data...\n');
  console.log(`Table: ${config.tableName}`);
  console.log(`Region: ${config.region}\n`);

  if (!config.accessKeyId || !config.secretAccessKey) {
    console.error('❌ Error: AWS credentials not found.');
    process.exit(1);
  }

  let totalDeleted = 0;

  for (const uploadId of SEED_UPLOAD_IDS) {
    try {
      const count = await deleteUploadAndVotes(uploadId);
      if (count > 0) {
        console.log(`  ✓ Deleted ${uploadId} (${count} items)`);
        totalDeleted += count;
      } else {
        console.log(`  - Skipped ${uploadId} (not found)`);
      }
    } catch (err) {
      console.error(`  ✗ Failed ${uploadId}:`, err);
    }
  }

  console.log(`\n✅ Cleanup complete: ${totalDeleted} items deleted\n`);
}

// Run
runCleanup().catch(console.error);
