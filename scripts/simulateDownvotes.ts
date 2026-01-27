/**
 * Simulate Downvotes Script
 *
 * Adds downvotes to specific seeded uploads to demonstrate
 * how the ranking algorithm demotes downvoted content.
 *
 * Usage: npx ts-node scripts/simulateDownvotes.ts
 *
 * This script simulates downvote "brigading" on select posts to show:
 * 1. How quickly downvoted fresh content sinks
 * 2. The asymmetric penalty (downvotes hurt 1.5x more)
 * 3. How even popular posts can fall if heavily downvoted
 */

import 'dotenv/config';
import {
  DynamoDBClient,
  DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
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

// ============ Downvote Scenarios ============

interface DownvoteScenario {
  uploadId: string;
  downvotesToAdd: number;
  description: string;
}

/**
 * Scenarios designed to show ranking changes from downvotes:
 *
 * 1. Downvote a fresh viral post → Watch it sink despite being new
 * 2. Heavily downvote a peak-window popular post → Tests penalty strength
 * 3. Downvote a moderate post into negative → Should sink fast
 * 4. Pile on an already-downvoted post → Shows how bad content stays buried
 */
const DOWNVOTE_SCENARIOS: DownvoteScenario[] = [
  {
    uploadId: 'seed-fresh-viral',
    downvotesToAdd: 30,
    description: 'Fresh viral post (1h, +45) gets 30 downvotes → Net +15, but damaged',
  },
  {
    uploadId: 'seed-peak-popular',
    downvotesToAdd: 80,
    description: 'Peak popular post (14h, +156) gets 80 downvotes → Tests if still ranks',
  },
  {
    uploadId: 'seed-fresh-moderate',
    downvotesToAdd: 25,
    description: 'Fresh moderate post (3h, +12) gets 25 downvotes → Goes negative',
  },
  {
    uploadId: 'seed-grace-moderate',
    downvotesToAdd: 60,
    description: 'Grace period post (36h, +45) gets 60 downvotes → Sink while old',
  },
  {
    uploadId: 'seed-fresh-downvoted',
    downvotesToAdd: 15,
    description: 'Already downvoted fresh post (-8) gets 15 more → Buried deeper',
  },
];

// ============ Functions ============

function createUploadPK(uploadId: string): string {
  return `UPLOAD#${uploadId}`;
}

async function getCurrentVoteCount(uploadId: string): Promise<number> {
  const result = await docClient.send(
    new GetCommand({
      TableName: config.tableName,
      Key: {
        PK: createUploadPK(uploadId),
        SK: 'METADATA',
      },
    })
  );

  return (result.Item?.voteCount as number) || 0;
}

async function addDownvotes(uploadId: string, count: number): Promise<number> {
  const now = new Date().toISOString();

  // Create vote items
  for (let i = 0; i < count; i++) {
    const voterId = `downvote-sim-${Date.now()}-${i}`;

    const voteItem = {
      PK: createUploadPK(uploadId),
      SK: `VOTE#${voterId}`,
      GSI1PK: `USER#${voterId}`,
      GSI1SK: `VOTE#${uploadId}#${now}`,
      uploadId,
      userId: voterId,
      voteType: 'down',
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: config.tableName,
        Item: voteItem,
      })
    );
  }

  // Update the cached vote count on the upload (subtract for downvotes)
  const result = await docClient.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: {
        PK: createUploadPK(uploadId),
        SK: 'METADATA',
      },
      UpdateExpression: 'SET voteCount = if_not_exists(voteCount, :zero) - :delta, updatedAt = :now',
      ExpressionAttributeValues: {
        ':delta': count,
        ':zero': 0,
        ':now': now,
      },
      ReturnValues: 'UPDATED_NEW',
    })
  );

  return (result.Attributes?.voteCount as number) || 0;
}

async function runSimulation(): Promise<void> {
  console.log('\n👎 Simulating Downvotes...\n');
  console.log(`Table: ${config.tableName}`);
  console.log(`Region: ${config.region}\n`);

  if (!config.accessKeyId || !config.secretAccessKey) {
    console.error('❌ Error: AWS credentials not found.');
    process.exit(1);
  }

  console.log('Running downvote scenarios:\n');
  console.log('─'.repeat(70));

  for (const scenario of DOWNVOTE_SCENARIOS) {
    try {
      const beforeCount = await getCurrentVoteCount(scenario.uploadId);
      const afterCount = await addDownvotes(scenario.uploadId, scenario.downvotesToAdd);

      console.log(`\n📉 ${scenario.uploadId}`);
      console.log(`   ${scenario.description}`);
      console.log(`   Votes: ${beforeCount} → ${afterCount} (-${scenario.downvotesToAdd})`);

      // Show impact analysis
      const netChange = afterCount - beforeCount;
      if (afterCount < 0) {
        console.log(`   ⚠️  Post is now negative (${afterCount}) - will sink in rankings`);
      } else if (afterCount < beforeCount / 2) {
        console.log(`   ⚠️  Post lost >50% of its score - significant rank drop expected`);
      }
    } catch (err) {
      console.error(`\n❌ Failed: ${scenario.uploadId}`, err);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log('\n✅ Downvote simulation complete!');
  console.log('\n💡 Refresh the app to see the new rankings.');
  console.log('   Posts that received downvotes should have dropped significantly.');
  console.log('   Remember: Downvotes hurt 1.5x more than upvotes help!\n');
}

// Run
runSimulation().catch(console.error);
