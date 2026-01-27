/**
 * DynamoDB Client
 *
 * Handles all DynamoDB operations for uploads and votes.
 * Uses single-table design with GSIs for efficient queries.
 */

import {
  DynamoDBClient,
  DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { awsConfig, dynamoConfig } from '../config';
import { withRetry } from './retry';
import type {
  DynamoUploadItem,
  DynamoVoteItem,
  DynamoUserItem,
  DynamoQueryOptions,
} from '../types';

// ============ Client Setup ============

const clientConfig: DynamoDBClientConfig = {
  region: awsConfig.region,
  credentials: {
    accessKeyId: awsConfig.accessKeyId,
    secretAccessKey: awsConfig.secretAccessKey,
  },
};

const baseClient = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// ============ Key Helpers ============

export function createUploadPK(uploadId: string): string {
  return `UPLOAD#${uploadId}`;
}

export function createUploadSK(): string {
  return 'METADATA';
}

export function createVoteSK(deviceId: string): string {
  return `VOTE#${deviceId}`;
}

export function createGeohashGSI1PK(geohash: string): string {
  return `GEOHASH#${geohash}`;
}

export function createDeviceGSI1PK(deviceId: string): string {
  return `DEVICE#${deviceId}`;
}

export function createUserGSI1PK(userId: string): string {
  return `USER#${userId}`;
}

export function createUserPK(userId: string): string {
  return `USER#${userId}`;
}

export function createUserSK(): string {
  return 'PROFILE';
}

// ============ Upload Operations ============

/**
 * Create a new upload record
 */
export async function createUpload(item: DynamoUploadItem): Promise<void> {
  await withRetry(async () => {
    await docClient.send(
      new PutCommand({
        TableName: dynamoConfig.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );
  });
}

/**
 * Get an upload by ID
 */
export async function getUploadById(
  uploadId: string
): Promise<DynamoUploadItem | null> {
  return withRetry(async () => {
    const result = await docClient.send(
      new GetCommand({
        TableName: dynamoConfig.tableName,
        Key: {
          PK: createUploadPK(uploadId),
          SK: createUploadSK(),
        },
      })
    );

    return (result.Item as DynamoUploadItem) || null;
  });
}

/**
 * Update an upload's metadata
 */
export async function updateUpload(
  uploadId: string,
  updates: Partial<Omit<DynamoUploadItem, 'PK' | 'SK' | 'id'>>
): Promise<DynamoUploadItem> {
  return withRetry(async () => {
    // Build update expression dynamically
    const expressionParts: string[] = [];
    const expressionNames: Record<string, string> = {};
    const expressionValues: Record<string, unknown> = {};

    Object.entries(updates).forEach(([key, value], index) => {
      if (value !== undefined) {
        const nameKey = `#attr${index}`;
        const valueKey = `:val${index}`;
        expressionParts.push(`${nameKey} = ${valueKey}`);
        expressionNames[nameKey] = key;
        expressionValues[valueKey] = value;
      }
    });

    if (expressionParts.length === 0) {
      const existing = await getUploadById(uploadId);
      if (!existing) {
        throw new Error(`Upload not found: ${uploadId}`);
      }
      return existing;
    }

    // Always update updatedAt
    expressionParts.push('#updatedAt = :updatedAt');
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = new Date().toISOString();

    const result = await docClient.send(
      new UpdateCommand({
        TableName: dynamoConfig.tableName,
        Key: {
          PK: createUploadPK(uploadId),
          SK: createUploadSK(),
        },
        UpdateExpression: `SET ${expressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    return result.Attributes as DynamoUploadItem;
  });
}

/**
 * Increment/decrement vote count atomically
 */
export async function updateVoteCount(
  uploadId: string,
  delta: number
): Promise<number> {
  return withRetry(async () => {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: dynamoConfig.tableName,
        Key: {
          PK: createUploadPK(uploadId),
          SK: createUploadSK(),
        },
        UpdateExpression:
          'SET voteCount = if_not_exists(voteCount, :zero) + :delta, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':delta': delta,
          ':zero': 0,
          ':updatedAt': new Date().toISOString(),
        },
        ReturnValues: 'UPDATED_NEW',
      })
    );

    return (result.Attributes?.voteCount as number) || 0;
  });
}

/**
 * Delete an upload
 */
export async function deleteUpload(uploadId: string): Promise<void> {
  await withRetry(async () => {
    await docClient.send(
      new DeleteCommand({
        TableName: dynamoConfig.tableName,
        Key: {
          PK: createUploadPK(uploadId),
          SK: createUploadSK(),
        },
      })
    );
  });
}

/**
 * Get all uploads (scan operation)
 * Note: Use with caution - scans can be expensive for large tables.
 * Acceptable for <10k items with caching.
 */
export async function getAllUploads(): Promise<DynamoUploadItem[]> {
  return withRetry(async () => {
    const items: DynamoUploadItem[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: dynamoConfig.tableName,
          FilterExpression: 'SK = :sk',
          ExpressionAttributeValues: {
            ':sk': 'METADATA',
          },
          ExclusiveStartKey: lastKey,
        })
      );

      if (result.Items) {
        items.push(...(result.Items as DynamoUploadItem[]));
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items;
  });
}

/**
 * Query uploads by geohash prefix (for location-based queries)
 */
export async function queryUploadsByGeohash(
  geohashPrefix: string,
  options: {
    limit?: number;
    exclusiveStartKey?: Record<string, unknown>;
    scanIndexForward?: boolean;
  } = {}
): Promise<{
  items: DynamoUploadItem[];
  lastEvaluatedKey?: Record<string, unknown>;
}> {
  return withRetry(async () => {
    const result = await docClient.send(
      new QueryCommand({
        TableName: dynamoConfig.tableName,
        IndexName: dynamoConfig.gsi1Name,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': createGeohashGSI1PK(geohashPrefix),
        },
        Limit: options.limit,
        ExclusiveStartKey: options.exclusiveStartKey,
        ScanIndexForward: options.scanIndexForward ?? false, // Newest first by default
      })
    );

    return {
      items: (result.Items as DynamoUploadItem[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  });
}

/**
 * Query uploads by device ID
 * Note: Uses a scan with filter since there's no GSI on deviceId for uploads.
 * For high-traffic apps, consider adding a GSI: GSI2PK = "DEVICE#<deviceId>", GSI2SK = "UPLOAD#<timestamp>"
 */
export async function queryUploadsByDevice(
  deviceId: string,
  options: {
    limit?: number;
    exclusiveStartKey?: Record<string, unknown>;
  } = {}
): Promise<{
  items: DynamoUploadItem[];
  lastEvaluatedKey?: Record<string, unknown>;
}> {
  return withRetry(async () => {
    // Use scan with filters - uploads have SK = 'METADATA' and deviceId attribute
    const result = await docClient.send(
      new ScanCommand({
        TableName: dynamoConfig.tableName,
        FilterExpression: 'SK = :sk AND deviceId = :deviceId',
        ExpressionAttributeValues: {
          ':sk': 'METADATA',
          ':deviceId': deviceId,
        },
        Limit: options.limit,
        ExclusiveStartKey: options.exclusiveStartKey,
      })
    );

    return {
      items: (result.Items as DynamoUploadItem[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  });
}

// ============ Vote Operations ============
// Vote items are the source of truth. For scale, use DynamoDB Streams + Lambda
// to aggregate vote counts asynchronously rather than atomic increments.

export interface VoteResult {
  voteCount: number;
  userVote: 'up' | 'down' | null;
}

/**
 * Cast or update a vote
 * Creates/updates a vote item and returns the new vote count
 */
export async function castVote(
  uploadId: string,
  userId: string,
  voteType: 'up' | 'down'
): Promise<VoteResult> {
  const now = new Date().toISOString();

  const voteItem: DynamoVoteItem = {
    PK: createUploadPK(uploadId),
    SK: createVoteSK(userId),
    GSI1PK: createUserGSI1PK(userId),
    GSI1SK: `VOTE#${uploadId}#${now}`,
    uploadId,
    userId,
    voteType,
    createdAt: now,
    updatedAt: now,
  };

  await withRetry(async () => {
    await docClient.send(
      new PutCommand({
        TableName: dynamoConfig.tableName,
        Item: voteItem,
      })
    );
  });

  // Get updated vote count
  const voteCount = await getVoteCountForUpload(uploadId);
  return { voteCount, userVote: voteType };
}

/**
 * Remove a vote
 */
export async function removeVote(
  uploadId: string,
  userId: string
): Promise<VoteResult> {
  await withRetry(async () => {
    await docClient.send(
      new DeleteCommand({
        TableName: dynamoConfig.tableName,
        Key: {
          PK: createUploadPK(uploadId),
          SK: createVoteSK(userId),
        },
      })
    );
  });

  // Get updated vote count
  const voteCount = await getVoteCountForUpload(uploadId);
  return { voteCount, userVote: null };
}

/**
 * Get a user's vote on a specific upload
 */
export async function getUserVote(
  uploadId: string,
  userId: string
): Promise<DynamoVoteItem | null> {
  return withRetry(async () => {
    const result = await docClient.send(
      new GetCommand({
        TableName: dynamoConfig.tableName,
        Key: {
          PK: createUploadPK(uploadId),
          SK: createVoteSK(userId),
        },
      })
    );

    return (result.Item as DynamoVoteItem) || null;
  });
}

/**
 * Get all votes by a user (efficient GSI query)
 * Returns a map of uploadId -> voteType for quick lookup
 */
export async function getUserVotesMap(
  userId: string
): Promise<Record<string, 'up' | 'down'>> {
  return withRetry(async () => {
    const votes: Record<string, 'up' | 'down'> = {};
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: dynamoConfig.tableName,
          IndexName: dynamoConfig.gsi1Name,
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: {
            ':pk': createUserGSI1PK(userId),
          },
          ExclusiveStartKey: lastKey,
        })
      );

      if (result.Items) {
        for (const item of result.Items as DynamoVoteItem[]) {
          votes[item.uploadId] = item.voteType;
        }
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return votes;
  });
}

/**
 * Get vote count for an upload (counts from vote items)
 * For scale, consider caching this or using DynamoDB Streams for async aggregation
 */
export async function getVoteCountForUpload(uploadId: string): Promise<number> {
  return withRetry(async () => {
    let upvotes = 0;
    let downvotes = 0;
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: dynamoConfig.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': createUploadPK(uploadId),
            ':skPrefix': 'VOTE#',
          },
          ExclusiveStartKey: lastKey,
        })
      );

      if (result.Items) {
        for (const item of result.Items as DynamoVoteItem[]) {
          if (item.voteType === 'up') upvotes++;
          else if (item.voteType === 'down') downvotes++;
        }
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return upvotes - downvotes;
  });
}

/**
 * Get vote counts for multiple uploads in parallel
 * More efficient than calling getVoteCountForUpload for each
 */
export async function getVoteCountsForUploads(
  uploadIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // Initialize all to 0
  for (const id of uploadIds) {
    counts[id] = 0;
  }

  // Fetch in parallel (batch of 10 to avoid overwhelming DynamoDB)
  const batchSize = 10;
  for (let i = 0; i < uploadIds.length; i += batchSize) {
    const batch = uploadIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (uploadId) => ({
        uploadId,
        count: await getVoteCountForUpload(uploadId),
      }))
    );
    for (const { uploadId, count } of results) {
      counts[uploadId] = count;
    }
  }

  return counts;
}

// ============ Legacy Vote Operations ============
// Kept for backwards compatibility with existing repositories

/**
 * Create or update a vote item
 * @deprecated Use castVote instead
 */
export async function upsertVote(item: DynamoVoteItem): Promise<void> {
  await withRetry(async () => {
    await docClient.send(
      new PutCommand({
        TableName: dynamoConfig.tableName,
        Item: item,
      })
    );
  });
}

/**
 * Get a specific vote by uploadId and identifier (userId or deviceId)
 * @deprecated Use getUserVote instead
 */
export async function getVote(
  uploadId: string,
  identifier: string
): Promise<DynamoVoteItem | null> {
  return getUserVote(uploadId, identifier);
}

/**
 * Delete a vote
 * @deprecated Use removeVote instead
 */
export async function deleteVote(
  uploadId: string,
  identifier: string
): Promise<void> {
  await withRetry(async () => {
    await docClient.send(
      new DeleteCommand({
        TableName: dynamoConfig.tableName,
        Key: {
          PK: createUploadPK(uploadId),
          SK: createVoteSK(identifier),
        },
      })
    );
  });
}

/**
 * Get all votes for an upload
 */
export async function getVotesForUpload(
  uploadId: string
): Promise<DynamoVoteItem[]> {
  return withRetry(async () => {
    const items: DynamoVoteItem[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: dynamoConfig.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': createUploadPK(uploadId),
            ':skPrefix': 'VOTE#',
          },
          ExclusiveStartKey: lastKey,
        })
      );

      if (result.Items) {
        items.push(...(result.Items as DynamoVoteItem[]));
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items;
  });
}

/**
 * Get all votes by a device/user
 * @deprecated Use getUserVotesMap instead
 */
export async function getVotesByDevice(
  identifier: string
): Promise<DynamoVoteItem[]> {
  return withRetry(async () => {
    const items: DynamoVoteItem[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: dynamoConfig.tableName,
          IndexName: dynamoConfig.gsi1Name,
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: {
            ':pk': createUserGSI1PK(identifier),
          },
          ExclusiveStartKey: lastKey,
        })
      );

      if (result.Items) {
        items.push(...(result.Items as DynamoVoteItem[]));
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items;
  });
}

// ============ User Operations ============

/**
 * Create a new user record
 */
export async function createUser(item: DynamoUserItem): Promise<void> {
  await withRetry(async () => {
    await docClient.send(
      new PutCommand({
        TableName: dynamoConfig.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );
  });
}

/**
 * Get a user by ID
 */
export async function getUserById(
  userId: string
): Promise<DynamoUserItem | null> {
  return withRetry(async () => {
    const result = await docClient.send(
      new GetCommand({
        TableName: dynamoConfig.tableName,
        Key: {
          PK: createUserPK(userId),
          SK: createUserSK(),
        },
      })
    );

    return (result.Item as DynamoUserItem) || null;
  });
}

/**
 * Update a user's profile
 */
export async function updateUser(
  userId: string,
  updates: Partial<Omit<DynamoUserItem, 'PK' | 'SK' | 'id'>>
): Promise<DynamoUserItem> {
  return withRetry(async () => {
    const expressionParts: string[] = [];
    const expressionNames: Record<string, string> = {};
    const expressionValues: Record<string, unknown> = {};

    Object.entries(updates).forEach(([key, value], index) => {
      if (value !== undefined) {
        const nameKey = `#attr${index}`;
        const valueKey = `:val${index}`;
        expressionParts.push(`${nameKey} = ${valueKey}`);
        expressionNames[nameKey] = key;
        expressionValues[valueKey] = value;
      }
    });

    if (expressionParts.length === 0) {
      const existing = await getUserById(userId);
      if (!existing) {
        throw new Error(`User not found: ${userId}`);
      }
      return existing;
    }

    // Always update updatedAt
    expressionParts.push('#updatedAt = :updatedAt');
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = new Date().toISOString();

    const result = await docClient.send(
      new UpdateCommand({
        TableName: dynamoConfig.tableName,
        Key: {
          PK: createUserPK(userId),
          SK: createUserSK(),
        },
        UpdateExpression: `SET ${expressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    return result.Attributes as DynamoUserItem;
  });
}

/**
 * Create or update user (upsert) - useful for sign-in
 */
export async function upsertUser(
  userId: string,
  data: Omit<DynamoUserItem, 'PK' | 'SK' | 'createdAt' | 'updatedAt'>
): Promise<DynamoUserItem> {
  const now = new Date().toISOString();

  // Check if user exists
  const existing = await getUserById(userId);

  if (existing) {
    // Update existing user - only update fields that have new values
    // and always update lastSignInAt
    return updateUser(userId, {
      ...(data.email && { email: data.email }),
      ...(data.givenName && { givenName: data.givenName }),
      ...(data.familyName && { familyName: data.familyName }),
      ...(data.displayName && { displayName: data.displayName }),
      lastSignInAt: now,
    });
  } else {
    // Create new user
    const newUser: DynamoUserItem = {
      PK: createUserPK(userId),
      SK: createUserSK(),
      id: data.id,
      email: data.email,
      givenName: data.givenName,
      familyName: data.familyName,
      displayName: data.displayName,
      authProvider: data.authProvider,
      createdAt: now,
      updatedAt: now,
      lastSignInAt: now,
    };

    await createUser(newUser);
    return newUser;
  }
}

// ============ Batch Operations ============

/**
 * Batch delete items (for cleanup)
 */
export async function batchDelete(
  keys: Array<{ PK: string; SK: string }>
): Promise<void> {
  if (keys.length === 0) return;

  // DynamoDB batch write limit is 25 items
  const batches: Array<Array<{ PK: string; SK: string }>> = [];
  for (let i = 0; i < keys.length; i += 25) {
    batches.push(keys.slice(i, i + 25));
  }

  await withRetry(async () => {
    for (const batch of batches) {
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [dynamoConfig.tableName]: batch.map((key) => ({
              DeleteRequest: { Key: key },
            })),
          },
        })
      );
    }
  });
}

// ============ Generic Query ============

/**
 * Execute a custom query
 */
export async function executeQuery(
  options: DynamoQueryOptions
): Promise<{
  items: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, unknown>;
}> {
  return withRetry(async () => {
    const result = await docClient.send(
      new QueryCommand({
        TableName: options.tableName,
        IndexName: options.indexName,
        KeyConditionExpression: options.keyCondition,
        ExpressionAttributeValues: options.expressionValues,
        Limit: options.limit,
        ExclusiveStartKey: options.exclusiveStartKey,
        ScanIndexForward: options.scanIndexForward,
      })
    );

    return {
      items: (result.Items as Record<string, unknown>[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  });
}
