/**
 * Auth Lambda - Session Management
 *
 * Handles Apple Sign-In token exchange and session refresh
 * so users don't need to re-authenticate frequently.
 *
 * Endpoints:
 * - POST /auth/apple   - Exchange Apple token for session
 * - POST /auth/refresh - Refresh session with refresh token
 * - POST /auth/logout  - Invalidate session
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityClient, GetIdCommand, GetCredentialsForIdentityCommand } = require('@aws-sdk/client-cognito-identity');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const crypto = require('crypto');

// ============ Configuration ============

const DYNAMO_TABLE = process.env.DYNAMO_TABLE;
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.unum.app';
const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || '30', 10);
const ACCESS_TOKEN_TTL_HOURS = 1; // AWS credentials last ~1 hour
const AUTHENTICATED_ROLE_ARN = process.env.AUTHENTICATED_ROLE_ARN;

// ============ Clients ============

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognitoClient = new CognitoIdentityClient({});
const stsClient = new STSClient({});

// ============ Helpers ============

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('base64url');
}

function parseJwt(token) {
  try {
    const base64Payload = token.split('.')[1];
    const payload = Buffer.from(base64Payload, 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (e) {
    return null;
  }
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

// ============ Session Storage ============

async function createSession(userId, cognitoIdentityId, appleIdentityToken) {
  const sessionId = generateToken(16);
  const refreshToken = generateToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const ttl = Math.floor(expiresAt.getTime() / 1000);

  const session = {
    PK: `SESSION#${sessionId}`,
    SK: `USER#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `SESSION#${sessionId}`,
    sessionId,
    userId,
    refreshToken,
    cognitoIdentityId,
    appleIdentityToken, // Store for potential re-validation
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttl,
  };

  // Secondary item for O(1) refresh token lookup (replaces table scan)
  const refreshLookup = {
    PK: `REFRESH#${refreshToken}`,
    SK: `REFRESH#${refreshToken}`,
    sessionId,
    userId,
    ttl,
  };

  await Promise.all([
    dynamoClient.send(new PutCommand({ TableName: DYNAMO_TABLE, Item: session })),
    dynamoClient.send(new PutCommand({ TableName: DYNAMO_TABLE, Item: refreshLookup })),
  ]);

  return { sessionId, refreshToken, expiresAt };
}

async function getSessionByRefreshToken(refreshToken) {
  // Look up the refresh token pointer item (O(1) instead of table scan)
  const lookupResult = await dynamoClient.send(new GetCommand({
    TableName: DYNAMO_TABLE,
    Key: {
      PK: `REFRESH#${refreshToken}`,
      SK: `REFRESH#${refreshToken}`,
    },
  }));

  if (!lookupResult.Item) {
    return null;
  }

  const { sessionId, userId } = lookupResult.Item;

  // Fetch the full session item
  const sessionResult = await dynamoClient.send(new GetCommand({
    TableName: DYNAMO_TABLE,
    Key: {
      PK: `SESSION#${sessionId}`,
      SK: `USER#${userId}`,
    },
  }));

  if (!sessionResult.Item) {
    return null;
  }

  const session = sessionResult.Item;

  // Check if expired
  if (new Date(session.expiresAt) < new Date()) {
    return null;
  }

  return session;
}

async function deleteSession(sessionId, userId, refreshToken) {
  const deletes = [
    dynamoClient.send(new DeleteCommand({
      TableName: DYNAMO_TABLE,
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: `USER#${userId}`,
      },
    })),
  ];

  if (refreshToken) {
    deletes.push(dynamoClient.send(new DeleteCommand({
      TableName: DYNAMO_TABLE,
      Key: {
        PK: `REFRESH#${refreshToken}`,
        SK: `REFRESH#${refreshToken}`,
      },
    })));
  }

  await Promise.all(deletes);
}

// ============ Cognito ============

async function getCognitoCredentials(appleIdentityToken) {
  const logins = {
    'appleid.apple.com': appleIdentityToken,
  };

  // Get Cognito Identity ID
  const idResponse = await cognitoClient.send(new GetIdCommand({
    IdentityPoolId: COGNITO_IDENTITY_POOL_ID,
    Logins: logins,
  }));

  const identityId = idResponse.IdentityId;

  // Get credentials
  const credentialsResponse = await cognitoClient.send(new GetCredentialsForIdentityCommand({
    IdentityId: identityId,
    Logins: logins,
  }));

  return {
    identityId,
    credentials: {
      accessKeyId: credentialsResponse.Credentials.AccessKeyId,
      secretAccessKey: credentialsResponse.Credentials.SecretKey,
      sessionToken: credentialsResponse.Credentials.SessionToken,
      expiration: credentialsResponse.Credentials.Expiration.toISOString(),
    },
  };
}

// ============ STS Fallback ============

/**
 * Get authenticated credentials via STS AssumeRole.
 * Used when the stored Apple identity token has expired and Cognito
 * can't issue authenticated credentials directly.
 * The Lambda has already verified the user via their refresh token,
 * so it's authorized to issue authenticated-role credentials.
 */
async function getCredentialsViaSTS(userId) {
  if (!AUTHENTICATED_ROLE_ARN) {
    throw new Error('AUTHENTICATED_ROLE_ARN not configured');
  }

  const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
    RoleArn: AUTHENTICATED_ROLE_ARN,
    RoleSessionName: `refresh-${userId.substring(0, 32)}`,
    DurationSeconds: ACCESS_TOKEN_TTL_HOURS * 60 * 60,
  }));

  return {
    accessKeyId: assumeRoleResponse.Credentials.AccessKeyId,
    secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey,
    sessionToken: assumeRoleResponse.Credentials.SessionToken,
    expiration: assumeRoleResponse.Credentials.Expiration.toISOString(),
  };
}

// ============ Handlers ============

async function handleAppleAuth(body) {
  const { identityToken } = body;

  if (!identityToken) {
    return response(400, { error: 'Missing identityToken' });
  }

  // Parse the Apple JWT to get user ID
  const payload = parseJwt(identityToken);
  if (!payload || !payload.sub) {
    return response(400, { error: 'Invalid identityToken' });
  }

  const userId = payload.sub;
  const audience = payload.aud;

  // Verify the token is for our app (basic validation)
  // In production, you should verify the signature with Apple's public keys
  if (audience !== APPLE_BUNDLE_ID) {
    console.warn('Token audience mismatch:', audience, 'expected:', APPLE_BUNDLE_ID);
    // Continue anyway for now - full validation would require fetching Apple's keys
  }

  try {
    // Exchange with Cognito
    const { identityId, credentials } = await getCognitoCredentials(identityToken);

    // Create session
    const session = await createSession(userId, identityId, identityToken);

    console.log('Created session for user:', userId);

    return response(200, {
      accessToken: session.sessionId, // Used for identifying the session
      refreshToken: session.refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_HOURS * 60 * 60, // seconds
      credentials, // AWS credentials for direct SDK use
      userId,
      cognitoIdentityId: identityId,
    });
  } catch (error) {
    console.error('Auth failed:', error);
    return response(500, { error: 'Authentication failed', details: error.message });
  }
}

async function handleRefresh(body) {
  const { refreshToken } = body;

  if (!refreshToken) {
    return response(400, { error: 'Missing refreshToken' });
  }

  try {
    // Look up session
    const session = await getSessionByRefreshToken(refreshToken);

    if (!session) {
      return response(401, { error: 'Invalid or expired refresh token' });
    }

    // Get fresh Cognito credentials using stored Apple token
    // Note: This may fail if the Apple token has expired
    // In that case, we try without the Apple token (for the identity we already have)
    let credentials;
    let identityId = session.cognitoIdentityId;

    try {
      // Try with stored Apple token first (works if token hasn't expired ~10 min)
      const result = await getCognitoCredentials(session.appleIdentityToken);
      credentials = result.credentials;
      identityId = result.identityId;
    } catch (cognitoError) {
      console.log('Cognito refresh with Apple token failed, trying STS AssumeRole');

      // Apple token expired. Use STS AssumeRole to issue authenticated credentials.
      // The Lambda has already verified the user via their refresh token (30-day TTL),
      // so it's authorized to issue authenticated-role credentials on the user's behalf.
      try {
        credentials = await getCredentialsViaSTS(session.userId);
        console.log('Issued credentials via STS AssumeRole for user:', session.userId);
      } catch (stsError) {
        console.error('STS AssumeRole fallback failed:', stsError);
        return response(401, {
          error: 'Session expired',
          code: 'REAUTH_REQUIRED',
          message: 'Please sign in again'
        });
      }
    }

    console.log('Refreshed session for user:', session.userId);

    return response(200, {
      accessToken: session.sessionId,
      expiresIn: ACCESS_TOKEN_TTL_HOURS * 60 * 60,
      credentials,
      userId: session.userId,
      cognitoIdentityId: identityId,
    });
  } catch (error) {
    console.error('Refresh failed:', error);
    return response(500, { error: 'Refresh failed', details: error.message });
  }
}

async function handleLogout(body) {
  const { refreshToken, sessionId, userId } = body;

  if (refreshToken) {
    // Look up and delete session + refresh token lookup item
    const session = await getSessionByRefreshToken(refreshToken);
    if (session) {
      await deleteSession(session.sessionId, session.userId, refreshToken);
    }
  } else if (sessionId && userId) {
    // Delete by session ID directly (orphaned refresh token item will expire via TTL)
    await deleteSession(sessionId, userId);
  }

  return response(200, { success: true });
}

// ============ Main Handler ============

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const path = event.rawPath || event.path;
  const method = event.requestContext?.http?.method || event.httpMethod;

  // Parse body
  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return response(400, { error: 'Invalid JSON body' });
    }
  }

  // Route requests
  if (method === 'POST') {
    if (path === '/auth/apple') {
      return handleAppleAuth(body);
    } else if (path === '/auth/refresh') {
      return handleRefresh(body);
    } else if (path === '/auth/logout') {
      return handleLogout(body);
    }
  }

  return response(404, { error: 'Not found' });
};
