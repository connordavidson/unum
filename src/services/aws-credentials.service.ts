/**
 * AWS Credentials Service
 *
 * Manages AWS temporary credentials via Cognito Identity Pools.
 * Uses the auth backend for session refresh (refresh tokens).
 *
 * Flow:
 * 1. User signs in with Apple → gets identity token
 * 2. Auth backend exchanges token with Cognito → returns credentials + refresh token
 * 3. On credential expiration, use refresh token to get new credentials
 * 4. Refresh tokens last 30 days, so users rarely need to re-authenticate
 *
 * Session Restoration:
 * - Refresh token is stored persistently
 * - On app restart, we use refresh token to get new AWS credentials
 * - No Apple token needed for refresh (that's the whole point!)
 */

import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { getAuthBackendService } from './auth-backend.service';
import { dedup } from '../shared/utils/dedup';
import { getLoggingService } from './logging.service';
import { AUTH_STORAGE_KEYS, CREDENTIAL_CONFIG } from '../shared/constants';
import type { AWSCredentials } from '../shared/types/auth';

export type { AWSCredentials } from '../shared/types/auth';

const extra = Constants.expoConfig?.extra ?? {};
const log = getLoggingService().createLogger('Auth');

// ============ Errors ============

/**
 * Thrown when an operation requires authenticated credentials
 * but only guest or expired credentials are available.
 * Callers should catch this and prompt the user to sign in again.
 */
export class AuthenticationRequiredError extends Error {
  constructor(message = 'Authentication required. Please sign in again.') {
    super(message);
    this.name = 'AuthenticationRequiredError';
  }
}

// ============ Types ============

/**
 * Credential access level - tracks what kind of credentials we have.
 * - not_initialized: No credentials obtained yet. getCredentials() will attempt restoration.
 * - authenticated: Full read-write credentials (via auth backend or direct Cognito with Apple token).
 * - guest: Read-only credentials (unauthenticated Cognito role).
 * - expired: All restoration methods failed. User must re-authenticate.
 */
type AccessLevel = 'not_initialized' | 'authenticated' | 'guest' | 'expired';

export interface CredentialStatus {
  isAuthenticated: boolean;
  identityId: string | null;
  expiresAt: Date | null;
  isExpired: boolean;
}

// ============ Helpers ============

/**
 * Parse Cognito SDK credentials response into our AWSCredentials type.
 * Returns null if the response is missing required fields.
 */
function parseCognitoCredentials(
  creds: { AccessKeyId?: string; SecretKey?: string; SessionToken?: string; Expiration?: Date } | undefined
): AWSCredentials | null {
  if (!creds?.AccessKeyId || !creds?.SecretKey || !creds?.SessionToken) {
    return null;
  }
  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretKey,
    sessionToken: creds.SessionToken,
    expiration: creds.Expiration || new Date(Date.now() + 3600 * 1000),
  };
}

// ============ Service ============

class AWSCredentialsService {
  private credentials: AWSCredentials | null = null;
  private identityId: string | null = null;
  private appleIdToken: string | null = null;
  private cognitoClient: CognitoIdentityClient;
  private restorationPromise: Promise<AWSCredentials | null> | null = null;
  private accessLevel: AccessLevel = 'not_initialized';

  constructor() {
    this.cognitoClient = new CognitoIdentityClient({
      region: extra.awsRegion || 'us-east-1',
    });
  }

  /**
   * Store Cognito Identity ID persistently
   */
  private async storeIdentityId(identityId: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(AUTH_STORAGE_KEYS.COGNITO_IDENTITY_ID, identityId);
      log.debug('Identity ID stored');
    } catch (error) {
      log.error('Failed to store identity ID', error);
    }
  }

  /**
   * Load stored Cognito Identity ID
   */
  private async loadStoredIdentityId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(AUTH_STORAGE_KEYS.COGNITO_IDENTITY_ID);
    } catch (error) {
      log.error('Failed to load identity ID', error);
      return null;
    }
  }

  /**
   * Clear stored Cognito Identity ID
   */
  private async clearStoredIdentityId(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.COGNITO_IDENTITY_ID);
    } catch (error) {
      log.error('Failed to clear identity ID', error);
    }
  }

  /**
   * Get current credentials, refreshing if needed
   * Call this before any AWS operation
   */
  async getCredentials(): Promise<AWSCredentials> {
    // If currently restoring, wait for that to complete
    if (this.restorationPromise) {
      const result = await this.restorationPromise;
      if (result) {
        return result;
      }
      // Restoration failed, fall through to error handling
    }

    // Return cached credentials if valid
    if (this.credentials && this.isValid()) {
      return this.credentials;
    }

    // If authenticated but credentials expired, try refresh via auth backend
    if (this.accessLevel === 'authenticated' && (!this.credentials || !this.isValid())) {
      const refreshed = await this.refreshExpiredCredentials();
      if (refreshed) {
        return refreshed;
      }
      // Refresh failed — fall through to existing expired/guest handling
      this.accessLevel = 'expired';
    }

    // If not initialized, try to restore credentials from stored session
    if (this.accessLevel === 'not_initialized') {
      log.debug('Not initialized, trying to restore from auth backend...');

      // Store the restoration promise so concurrent calls wait
      this.restorationPromise = this.doRestoration();

      try {
        const result = await this.restorationPromise;
        if (result) {
          return result;
        }
      } finally {
        this.restorationPromise = null;
      }

      // Restoration failed - mark that we need re-authentication
      this.accessLevel = 'expired';
    }

    // If expired and no Apple token available, try unauthenticated access
    if (this.accessLevel === 'expired' && !this.appleIdToken) {
      // Try unauthenticated credentials for read-only access
      const unauthSuccess = await this.getUnauthenticatedCredentials();
      if (unauthSuccess && this.credentials) {
        return this.credentials;
      }
      throw new Error('[AWSCredentials] Session expired. Please sign in again to sync with cloud.');
    }

    // Need to refresh (requires Apple token)
    return this.refresh();
  }

  /**
   * Perform restoration from auth backend or legacy Cognito
   */
  private async doRestoration(): Promise<AWSCredentials | null> {
    const restored = await this.tryRestoreFromAuthBackend();
    if (restored && this.credentials && this.isValid()) {
      return this.credentials;
    }

    // Auth backend restoration failed - try legacy Cognito method
    log.debug('Auth backend restore failed, trying legacy Cognito method...');
    const legacyRestored = await this.tryRestoreFromStoredIdentity();
    if (legacyRestored && this.credentials && this.isValid()) {
      return this.credentials;
    }

    // All authenticated methods failed - try unauthenticated access
    log.debug('Authenticated restore failed, trying unauthenticated access...');
    const unauthRestored = await this.getUnauthenticatedCredentials();
    if (unauthRestored && this.credentials && this.isValid()) {
      return this.credentials;
    }

    return null;
  }

  /**
   * Get read-only credentials immediately (unauthenticated)
   * Use this for read operations - no auth restoration needed
   */
  async getReadOnlyCredentials(): Promise<AWSCredentials> {
    // If we have valid credentials (authenticated or not), use them
    if (this.credentials && this.isValid()) {
      return this.credentials;
    }

    // Get unauthenticated credentials immediately
    const success = await this.getUnauthenticatedCredentials();
    if (success && this.credentials) {
      return this.credentials;
    }

    throw new Error('[AWSCredentials] Failed to get read-only credentials');
  }

  /**
   * Get authenticated credentials for write operations.
   * Unlike getCredentials(), this will NOT fall back to guest credentials.
   * Throws AuthenticationRequiredError if authenticated credentials are unavailable.
   */
  async getAuthenticatedCredentials(): Promise<AWSCredentials> {
    // If currently restoring, wait for that to complete
    if (this.restorationPromise) {
      await this.restorationPromise;
    }

    // Return cached authenticated credentials if valid
    if (this.accessLevel === 'authenticated' && this.credentials && this.isValid()) {
      return this.credentials;
    }

    // If authenticated but credentials expired, try refresh via auth backend
    if (this.accessLevel === 'authenticated' && (!this.credentials || !this.isValid())) {
      const refreshed = await this.refreshExpiredCredentials();
      if (refreshed) {
        return refreshed;
      }
      // Refresh failed — user must re-authenticate
      this.accessLevel = 'expired';
      throw new AuthenticationRequiredError();
    }

    // If not initialized, try restoration (but only accept authenticated result)
    if (this.accessLevel === 'not_initialized') {
      log.debug('Not initialized, trying to restore authenticated credentials...');

      this.restorationPromise = this.doRestoration();
      try {
        await this.restorationPromise;
      } finally {
        this.restorationPromise = null;
      }

      if (this.accessLevel === 'authenticated' && this.credentials && this.isValid()) {
        return this.credentials;
      }
    }

    // If we only have guest or expired credentials, the user must re-authenticate
    throw new AuthenticationRequiredError();
  }

  /**
   * Get unauthenticated (guest) credentials for read-only access
   * This allows users to view content without signing in
   * Deduplicates concurrent requests to prevent multiple Cognito identity creations
   */
  getUnauthenticatedCredentials = dedup(() => this.doGetUnauthenticatedCredentials());

  /**
   * Actually fetch unauthenticated credentials from Cognito
   */
  private async doGetUnauthenticatedCredentials(): Promise<boolean> {
    const identityPoolId = extra.cognitoIdentityPoolId;

    if (!identityPoolId) {
      log.debug('No identity pool configured for unauthenticated access');
      return false;
    }

    log.debug('Getting unauthenticated credentials...');

    try {
      // Get anonymous identity ID
      const idResponse = await this.cognitoClient.send(
        new GetIdCommand({
          IdentityPoolId: identityPoolId,
          // No Logins = unauthenticated
        })
      );

      if (!idResponse.IdentityId) {
        log.debug('Failed to get unauthenticated identity ID');
        return false;
      }

      const unauthIdentityId = idResponse.IdentityId;
      log.debug('Got unauthenticated identity ID', { identityId: unauthIdentityId });

      // Get credentials for unauthenticated identity
      const credentialsResponse = await this.cognitoClient.send(
        new GetCredentialsForIdentityCommand({
          IdentityId: unauthIdentityId,
          // No Logins = unauthenticated
        })
      );

      const parsed = parseCognitoCredentials(credentialsResponse.Credentials);
      if (!parsed) {
        log.debug('Incomplete unauthenticated credentials returned');
        return false;
      }

      this.credentials = parsed;

      // Don't store this identity ID - it's ephemeral for unauthenticated users
      this.accessLevel = 'guest';

      log.debug('Got unauthenticated credentials (read-only)', { expires: this.credentials.expiration.toISOString() });
      return true;
    } catch (error) {
      log.debug('Failed to get unauthenticated credentials', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Try to restore credentials using the auth backend refresh token
   * This is the primary method - refresh tokens last 30 days
   */
  async tryRestoreFromAuthBackend(): Promise<boolean> {
    const authBackend = getAuthBackendService();

    if (!authBackend.isConfigured()) {
      log.debug('Auth backend not configured');
      return false;
    }

    const hasSession = await authBackend.hasStoredSession();
    if (!hasSession) {
      log.debug('No stored auth backend session');
      return false;
    }

    log.debug('Trying to restore credentials via auth backend...');

    try {
      const result = await authBackend.refreshSession();

      this.credentials = {
        accessKeyId: result.credentials.accessKeyId,
        secretAccessKey: result.credentials.secretAccessKey,
        sessionToken: result.credentials.sessionToken,
        expiration: new Date(result.credentials.expiration),
      };
      this.identityId = result.cognitoIdentityId;
      this.accessLevel = 'authenticated';

      // Store identity ID for future use
      await this.storeIdentityId(this.identityId);

      log.debug('Restored credentials via auth backend (authenticated)', { expires: this.credentials.expiration.toISOString() });
      return true;
    } catch (error) {
      log.debug('Auth backend refresh failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Check if the user needs to re-authenticate to use AWS
   */
  get needsReauthentication(): boolean {
    return this.accessLevel === 'expired';
  }

  /**
   * Check if current credentials are authenticated (vs guest/unauthenticated)
   * Used to determine if user can perform write operations
   */
  get hasAuthenticatedCredentials(): boolean {
    return this.accessLevel === 'authenticated';
  }

  /**
   * Initialize credentials with Apple Sign-In token
   * Call this during sign-in flow
   */
  async initializeWithAppleToken(appleIdToken: string): Promise<AWSCredentials> {
    this.appleIdToken = appleIdToken;
    this.credentials = null;
    this.identityId = null;
    this.accessLevel = 'expired'; // Transitional: no valid credentials yet, will obtain below

    // Try auth backend first (provides refresh tokens)
    const authBackend = getAuthBackendService();
    log.debug('Auth backend configured?', { configured: authBackend.isConfigured() });
    if (authBackend.isConfigured()) {
      try {
        log.debug('Authenticating via auth backend...');
        const session = await authBackend.authenticateWithApple(appleIdToken);

        this.credentials = {
          accessKeyId: session.credentials.accessKeyId,
          secretAccessKey: session.credentials.secretAccessKey,
          sessionToken: session.credentials.sessionToken,
          expiration: new Date(session.credentials.expiration),
        };
        this.identityId = session.cognitoIdentityId;
        this.accessLevel = 'authenticated';

        // Store identity ID for fallback
        await this.storeIdentityId(this.identityId);

        log.debug('Authenticated via auth backend (full access)', { expires: this.credentials.expiration.toISOString() });
        return this.credentials;
      } catch (backendError) {
        log.error('Auth backend failed, falling back to direct Cognito', backendError);
        // Fall through to direct Cognito method
      }
    } else {
      log.debug('Auth backend not configured, using direct Cognito');
    }

    // Fallback: direct Cognito (no refresh tokens)
    return this.refresh();
  }

  /**
   * Try to restore credentials using stored Cognito Identity ID
   * This may work even if the Apple token has expired
   * Call this on app startup before requiring fresh sign-in
   */
  async tryRestoreFromStoredIdentity(): Promise<boolean> {
    const storedIdentityId = await this.loadStoredIdentityId();
    if (!storedIdentityId) {
      log.debug('No stored identity ID found');
      return false;
    }

    log.debug('Trying to restore credentials with stored identity ID...');
    this.identityId = storedIdentityId;

    try {
      // Try to get credentials without the Apple token
      // This tests if Cognito allows refresh for previously authenticated identities
      const credentialsResponse = await this.cognitoClient.send(
        new GetCredentialsForIdentityCommand({
          IdentityId: this.identityId,
          // Note: No Logins map - testing if Cognito remembers us
        })
      );

      const parsed = parseCognitoCredentials(credentialsResponse.Credentials);
      if (!parsed) {
        log.debug('Incomplete credentials returned');
        return false;
      }

      this.credentials = parsed;

      this.accessLevel = 'guest'; // Without Logins map, Cognito returns unauthenticated role credentials
      log.debug('Restored credentials without Apple token (read-only)', { expires: this.credentials.expiration.toISOString() });
      return true;
    } catch (error) {
      log.debug('Could not restore without Apple token', { error: error instanceof Error ? error.message : String(error) });
      // Clear the identity ID since we can't use it
      this.identityId = null;
      return false;
    }
  }

  /**
   * Check if we have valid credentials
   */
  hasValidCredentials(): boolean {
    return this.credentials !== null && this.isValid();
  }

  /**
   * Wait for any ongoing restoration to complete
   * Returns true if credentials are available after waiting
   */
  async waitForReady(): Promise<boolean> {
    // If currently restoring, wait for it
    if (this.restorationPromise) {
      log.debug('Waiting for restoration to complete...');
      try {
        await this.restorationPromise;
      } catch {
        // Restoration failed, continue to check credentials
      }
    }

    // Check if we have valid credentials now
    if (this.credentials && this.isValid()) {
      return true;
    }

    // If not initialized or expired, try to get credentials (will attempt restoration or unauthenticated)
    if (this.accessLevel === 'not_initialized' || this.accessLevel === 'expired') {
      try {
        await this.getCredentials();
        return this.hasValidCredentials();
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Wait for authenticated credentials to be available.
   * Unlike waitForReady(), this will NOT accept guest credentials.
   * Returns true if authenticated credentials are available, false if user must re-authenticate.
   * Use this before write operations to ensure credentials are valid.
   */
  async waitForAuthenticated(): Promise<boolean> {
    log.debug('waitForAuthenticated called', { accessLevel: this.accessLevel, hasCredentials: !!this.credentials, isValid: this.credentials ? this.isValid() : false });

    // Wait for any ongoing restoration
    if (this.restorationPromise) {
      log.debug('Waiting for restoration to complete (authenticated)...');
      try {
        await this.restorationPromise;
      } catch {
        // Restoration failed, continue to check
      }
    }

    // If already authenticated and valid, return true
    if (this.accessLevel === 'authenticated' && this.isValid()) {
      log.debug('waitForAuthenticated: already authenticated and valid');
      return true;
    }

    // If authenticated but expired, try refresh
    if (this.accessLevel === 'authenticated') {
      log.debug('Credentials expired, attempting refresh for write operation...');
      const refreshed = await this.refreshExpiredCredentials();
      log.debug('waitForAuthenticated: refresh result', { success: refreshed !== null });
      return refreshed !== null;
    }

    // Handle state corruption from proactive foreground refresh failure
    // If accessLevel got corrupted to 'guest' or 'expired' but we still have a stored
    // refresh token, try to restore authenticated credentials
    if (this.accessLevel === 'guest' || this.accessLevel === 'expired') {
      log.debug('waitForAuthenticated: attempting recovery from guest/expired state');
      const authBackend = getAuthBackendService();
      const isConfigured = authBackend.isConfigured();
      log.debug('waitForAuthenticated: auth backend configured?', { isConfigured });
      if (isConfigured) {
        const hasSession = await authBackend.hasStoredSession();
        log.debug('waitForAuthenticated: has stored session?', { hasSession });
        if (hasSession) {
          log.debug('Found stored session despite guest/expired state, attempting refresh...');
          const restored = await this.tryRestoreFromAuthBackend();
          log.debug('waitForAuthenticated: restore result', { restored, accessLevel: this.accessLevel, isValid: this.isValid() });
          if (restored && this.accessLevel === 'authenticated' && this.isValid()) {
            return true;
          }
        }
      }
    }

    // If not initialized, try restoration (but only accept authenticated result)
    if (this.accessLevel === 'not_initialized') {
      log.debug('Not initialized, trying to restore authenticated credentials for write...');
      this.restorationPromise = this.doRestoration();
      try {
        await this.restorationPromise;
      } finally {
        this.restorationPromise = null;
      }
      log.debug('waitForAuthenticated: after doRestoration', { accessLevel: this.accessLevel, isValid: this.isValid() });
      return this.accessLevel === 'authenticated' && this.isValid();
    }

    // Guest or expired with no stored session - user must re-authenticate
    log.debug('waitForAuthenticated: returning false, no valid auth path', { accessLevel: this.accessLevel });
    return false;
  }

  /**
   * Get current status for debugging
   */
  getStatus(): CredentialStatus {
    return {
      isAuthenticated: this.accessLevel === 'authenticated',
      identityId: this.identityId,
      expiresAt: this.credentials?.expiration || null,
      isExpired: this.credentials ? !this.isValid() : true,
    };
  }

  /**
   * Clear all credentials (call on sign-out)
   */
  async clearCredentials(): Promise<void> {
    log.debug('Clearing credentials');
    this.credentials = null;
    this.identityId = null;
    this.appleIdToken = null;
    this.restorationPromise = null;
    this.accessLevel = 'not_initialized';
    await this.clearStoredIdentityId();

    // Clear auth backend session
    try {
      await getAuthBackendService().logout();
    } catch (error) {
      log.error('Failed to logout from auth backend', error);
    }
  }

  /**
   * Refresh expired authenticated credentials using the auth backend refresh token.
   * Deduplicates concurrent calls so only one refresh is in-flight at a time.
   */
  private refreshExpiredCredentials = dedup(() => this.doRefreshExpiredCredentials());

  private async doRefreshExpiredCredentials(): Promise<AWSCredentials | null> {
    log.debug('Attempting to refresh expired authenticated credentials...');
    const restored = await this.tryRestoreFromAuthBackend();
    if (restored && this.credentials && this.isValid()) {
      return this.credentials;
    }
    return null;
  }

  /**
   * Refresh credentials from Cognito (deduplicates concurrent calls)
   */
  private refresh = dedup(() => this.doRefresh());

  private async doRefresh(): Promise<AWSCredentials> {
    const identityPoolId = extra.cognitoIdentityPoolId;

    if (!identityPoolId) {
      throw new Error(
        '[AWSCredentials] Cognito Identity Pool ID not configured. ' +
          'Check COGNITO_IDENTITY_POOL_ID in environment config.'
      );
    }

    if (!this.appleIdToken) {
      throw new Error(
        '[AWSCredentials] No Apple ID token available. User must sign in again to refresh AWS credentials.'
      );
    }

    log.debug('Refreshing credentials...');

    try {
      // Build logins map for Apple Sign-In
      const logins: Record<string, string> = {
        'appleid.apple.com': this.appleIdToken,
      };

      // Step 1: Get Cognito identity ID (or use cached)
      if (!this.identityId) {
        log.debug('Getting Cognito identity ID...');
        const idResponse = await this.cognitoClient.send(
          new GetIdCommand({
            IdentityPoolId: identityPoolId,
            Logins: logins,
          })
        );

        if (!idResponse.IdentityId) {
          throw new Error('[AWSCredentials] Failed to get Cognito identity ID');
        }

        this.identityId = idResponse.IdentityId;
        log.debug('Got identity ID', { identityId: this.identityId });
        // Store for future session restoration
        await this.storeIdentityId(this.identityId);
      }

      // Step 2: Get temporary AWS credentials
      log.debug('Getting temporary credentials...');
      const credentialsResponse = await this.cognitoClient.send(
        new GetCredentialsForIdentityCommand({
          IdentityId: this.identityId,
          Logins: logins,
        })
      );

      const parsed = parseCognitoCredentials(credentialsResponse.Credentials);
      if (!parsed) {
        throw new Error('[AWSCredentials] Incomplete credentials returned from Cognito');
      }

      this.credentials = parsed;
      this.accessLevel = 'authenticated'; // Direct Cognito with Apple token

      log.debug('Credentials refreshed (authenticated)', { expires: this.credentials.expiration.toISOString() });

      return this.credentials;
    } catch (error) {
      log.error('Failed to refresh credentials', error);

      // If we got a NotAuthorizedException, clear the identity and try again
      if (error instanceof Error && error.name === 'NotAuthorizedException') {
        log.debug('Token may be expired, clearing identity');
        this.identityId = null;
      }

      throw error;
    }
  }

  /**
   * Check if current credentials are valid (with 5 minute buffer)
   */
  private isValid(): boolean {
    if (!this.credentials) {
      return false;
    }

    // Consider expired if within the buffer window of expiration
    return this.credentials.expiration.getTime() - CREDENTIAL_CONFIG.EXPIRATION_BUFFER_MS > Date.now();
  }
}

// ============ Singleton ============

let instance: AWSCredentialsService | null = null;

export function getAWSCredentialsService(): AWSCredentialsService {
  if (!instance) {
    instance = new AWSCredentialsService();
  }
  return instance;
}

// Export the service class for testing
export { AWSCredentialsService };
