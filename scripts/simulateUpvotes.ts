/**
 * Simulate Upvotes Script
 *
 * Adds upvotes to specific seeded uploads to demonstrate
 * how the ranking algorithm promotes upvoted content.
 *
 * Usage: npx ts-node scripts/simulateUpvotes.ts
 *
 * This script simulates a "wave" of upvotes on select posts to show:
 * 1. Fresh posts with few votes getting boosted
 * 2. Older posts needing more votes to climb
 * 3. How viral content rises quickly
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

// ============ Upvote Scenarios ============

interface UpvoteScenario {
  uploadId: string;
  upvotesToAdd: number;
  description: string;
}

/**
 * Scenarios designed to show ranking changes:
 *
 * 1. Boost a fresh post with no votes → should jump to top
 * 2. Boost an older grace-period post → needs more votes to compete
 * 3. Give a moderate boost to a peak-window post → should rise
 * 4. Give massive boost to a decaying post → tests if high votes can overcome time decay
 */
const UPVOTE_SCENARIOS: UpvoteScenario[] = [
  {
    uploadId: 'seed-fresh-new',
    upvotesToAdd: 20,
    description: 'Fresh post (0.5h) gets 20 upvotes → Should jump to near top',
  },
  {
    uploadId: 'seed-peak-average',
    upvotesToAdd: 50,
    description: 'Peak window post (18h) gets 50 upvotes → Should rise significantly',
  },
  {
    uploadId: 'seed-grace-moderate',
    upvotesToAdd: 100,
    description: 'Grace period post (36h) gets 100 upvotes → Tests time decay vs votes',
  },
  {
    uploadId: 'seed-decay-average',
    upvotesToAdd: 200,
    description: 'Decaying post (84h) gets 200 upvotes → Needs lots of votes to climb',
  },
  {
    uploadId: 'seed-fresh-moderate',
    upvotesToAdd: 30,
    description: 'Fresh moderate post (3h) gets 30 more → Should compete for top spot',
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

async function addUpvotes(uploadId: string, count: number): Promise<number> {
  const now = new Date().toISOString();

  // Create vote items
  for (let i = 0; i < count; i++) {
    const voterId = `upvote-sim-${Date.now()}-${i}`;

    const voteItem = {
      PK: createUploadPK(uploadId),
      SK: `VOTE#${voterId}`,
      GSI1PK: `USER#${voterId}`,
      GSI1SK: `VOTE#${uploadId}#${now}`,
      uploadId,
      userId: voterId,
      voteType: 'up',
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

  // Update the cached vote count on the upload
  const result = await docClient.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: {
        PK: createUploadPK(uploadId),
        SK: 'METADATA',
      },
      UpdateExpression: 'SET voteCount = if_not_exists(voteCount, :zero) + :delta, updatedAt = :now',
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
  console.log('\n🗳️  Simulating Upvotes...\n');
  console.log(`Table: ${config.tableName}`);
  console.log(`Region: ${config.region}\n`);

  if (!config.accessKeyId || !config.secretAccessKey) {
    console.error('❌ Error: AWS credentials not found.');
    process.exit(1);
  }

  console.log('Running upvote scenarios:\n');
  console.log('─'.repeat(70));

  for (const scenario of UPVOTE_SCENARIOS) {
    try {
      const beforeCount = await getCurrentVoteCount(scenario.uploadId);
      const afterCount = await addUpvotes(scenario.uploadId, scenario.upvotesToAdd);

      console.log(`\n📈 ${scenario.uploadId}`);
      console.log(`   ${scenario.description}`);
      console.log(`   Votes: ${beforeCount} → ${afterCount} (+${scenario.upvotesToAdd})`);
    } catch (err) {
      console.error(`\n❌ Failed: ${scenario.uploadId}`, err);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log('\n✅ Upvote simulation complete!');
  console.log('\n💡 Refresh the app to see the new rankings.');
  console.log('   Posts that received upvotes should have risen in the feed.\n');
}

// Run
runSimulation().catch(console.error);
