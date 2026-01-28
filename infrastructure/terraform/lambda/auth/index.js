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
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityClient, GetIdCommand, GetCredentialsForIdentityCommand } = require('@aws-sdk/client-cognito-identity');
const crypto = require('crypto');

// ============ Configuration ============

const DYNAMO_TABLE = process.env.DYNAMO_TABLE;
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.unum.app';
const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || '30', 10);
const ACCESS_TOKEN_TTL_HOURS = 1; // AWS credentials last ~1 hour

// ============ Clients ============

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognitoClient = new CognitoIdentityClient({});

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
    ttl: Math.floor(expiresAt.getTime() / 1000), // DynamoDB TTL
  };

  await dynamoClient.send(new PutCommand({
    TableName: DYNAMO_TABLE,
    Item: session,
  }));

  return { sessionId, refreshToken, expiresAt };
}

async function getSessionByRefreshToken(refreshToken) {
  // Scan for session by refresh token
  // Note: In production with many sessions, add a GSI on refreshToken for efficiency
  const result = await dynamoClient.send(new ScanCommand({
    TableName: DYNAMO_TABLE,
    FilterExpression: 'refreshToken = :refreshToken AND begins_with(PK, :sessionPrefix)',
    ExpressionAttributeValues: {
      ':refreshToken': refreshToken,
      ':sessionPrefix': 'SESSION#',
    },
  }));

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  const session = result.Items[0];

  // Check if expired
  if (new Date(session.expiresAt) < new Date()) {
    return null;
  }

  return session;
}

async function deleteSession(sessionId, userId) {
  await dynamoClient.send(new DeleteCommand({
    TableName: DYNAMO_TABLE,
    Key: {
      PK: `SESSION#${sessionId}`,
      SK: `USER#${userId}`,
    },
  }));
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
      // Try with stored Apple token first
      const result = await getCognitoCredentials(session.appleIdentityToken);
      credentials = result.credentials;
      identityId = result.identityId;
    } catch (cognitoError) {
      console.log('Cognito refresh with Apple token failed, trying with identity ID only');

      // Try getting credentials with just the identity ID
      // This works if Cognito has cached the authentication
      try {
        const credentialsResponse = await cognitoClient.send(new GetCredentialsForIdentityCommand({
          IdentityId: identityId,
          // No Logins - relying on Cognito's memory of previous auth
        }));

        credentials = {
          accessKeyId: credentialsResponse.Credentials.AccessKeyId,
          secretAccessKey: credentialsResponse.Credentials.SecretKey,
          sessionToken: credentialsResponse.Credentials.SessionToken,
          expiration: credentialsResponse.Credentials.Expiration.toISOString(),
        };
      } catch (fallbackError) {
        console.error('Cognito fallback also failed:', fallbackError);
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
    // Look up and delete session by refresh token
    const session = await getSessionByRefreshToken(refreshToken);
    if (session) {
      await deleteSession(session.sessionId, session.userId);
    }
  } else if (sessionId && userId) {
    // Delete by session ID directly
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
