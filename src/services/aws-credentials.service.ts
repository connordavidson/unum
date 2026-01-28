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

const extra = Constants.expoConfig?.extra ?? {};

// Debug: Check if auth backend URL is configured
console.log('[AWSCredentials] Auth backend URL from config:', extra.authApiUrl || '(not set)');

const COGNITO_IDENTITY_ID_KEY = 'unum_cognito_identity_id';

// ============ Types ============

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

export interface CredentialStatus {
  isAuthenticated: boolean;
  identityId: string | null;
  expiresAt: Date | null;
  isExpired: boolean;
}

// ============ Service ============

class AWSCredentialsService {
  private credentials: AWSCredentials | null = null;
  private identityId: string | null = null;
  private appleIdToken: string | null = null;
  private cognitoClient: CognitoIdentityClient;
  private refreshPromise: Promise<AWSCredentials> | null = null;
  private restorationPromise: Promise<AWSCredentials | null> | null = null;
  private unauthCredentialsPromise: Promise<boolean> | null = null;
  private initialized: boolean = false;
  private restorationAttempted: boolean = false;
  private _needsReauthentication: boolean = false;

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
      await SecureStore.setItemAsync(COGNITO_IDENTITY_ID_KEY, identityId);
      console.log('[AWSCredentials] Identity ID stored');
    } catch (error) {
      console.error('[AWSCredentials] Failed to store identity ID:', error);
    }
  }

  /**
   * Load stored Cognito Identity ID
   */
  private async loadStoredIdentityId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(COGNITO_IDENTITY_ID_KEY);
    } catch (error) {
      console.error('[AWSCredentials] Failed to load identity ID:', error);
      return null;
    }
  }

  /**
   * Clear stored Cognito Identity ID
   */
  private async clearStoredIdentityId(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(COGNITO_IDENTITY_ID_KEY);
    } catch (error) {
      console.error('[AWSCredentials] Failed to clear identity ID:', error);
    }
  }

  /**
   * Get current credentials, refreshing if needed
   * Call this before any AWS operation
   */
  async getCredentials(): Promise<AWSCredentials> {
    // If currently refreshing, wait for that to complete
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

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

    // If not initialized and haven't tried restoration yet, try to restore from auth backend
    if (!this.initialized && !this.restorationAttempted) {
      this.restorationAttempted = true;
      console.log('[AWSCredentials] Not initialized, trying to restore from auth backend...');

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
      this._needsReauthentication = true;
    }

    // If we already know we need re-auth but have no Apple token, try unauthenticated access
    if (this._needsReauthentication && !this.appleIdToken) {
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
    console.log('[AWSCredentials] Auth backend restore failed, trying legacy Cognito method...');
    const legacyRestored = await this.tryRestoreFromStoredIdentity();
    if (legacyRestored && this.credentials && this.isValid()) {
      return this.credentials;
    }

    // All authenticated methods failed - try unauthenticated access
    console.log('[AWSCredentials] Authenticated restore failed, trying unauthenticated access...');
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
   * Get unauthenticated (guest) credentials for read-only access
   * This allows users to view content without signing in
   * Deduplicates concurrent requests to prevent multiple Cognito identity creations
   */
  async getUnauthenticatedCredentials(): Promise<boolean> {
    // Deduplicate concurrent requests - all callers wait for the same promise
    if (this.unauthCredentialsPromise) {
      console.log('[AWSCredentials] Waiting for existing unauthenticated credentials request...');
      return this.unauthCredentialsPromise;
    }

    this.unauthCredentialsPromise = this.doGetUnauthenticatedCredentials();
    try {
      return await this.unauthCredentialsPromise;
    } finally {
      this.unauthCredentialsPromise = null;
    }
  }

  /**
   * Actually fetch unauthenticated credentials from Cognito
   */
  private async doGetUnauthenticatedCredentials(): Promise<boolean> {
    const identityPoolId = extra.cognitoIdentityPoolId;

    if (!identityPoolId) {
      console.log('[AWSCredentials] No identity pool configured for unauthenticated access');
      return false;
    }

    console.log('[AWSCredentials] Getting unauthenticated credentials...');

    try {
      // Get anonymous identity ID
      const idResponse = await this.cognitoClient.send(
        new GetIdCommand({
          IdentityPoolId: identityPoolId,
          // No Logins = unauthenticated
        })
      );

      if (!idResponse.IdentityId) {
        console.log('[AWSCredentials] Failed to get unauthenticated identity ID');
        return false;
      }

      const unauthIdentityId = idResponse.IdentityId;
      console.log('[AWSCredentials] Got unauthenticated identity ID:', unauthIdentityId);

      // Get credentials for unauthenticated identity
      const credentialsResponse = await this.cognitoClient.send(
        new GetCredentialsForIdentityCommand({
          IdentityId: unauthIdentityId,
          // No Logins = unauthenticated
        })
      );

      const creds = credentialsResponse.Credentials;
      if (!creds?.AccessKeyId || !creds?.SecretKey || !creds?.SessionToken) {
        console.log('[AWSCredentials] Incomplete unauthenticated credentials returned');
        return false;
      }

      this.credentials = {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretKey,
        sessionToken: creds.SessionToken,
        expiration: creds.Expiration || new Date(Date.now() + 3600 * 1000),
      };

      // Don't store this identity ID - it's ephemeral for unauthenticated users
      this.initialized = true;
      this._needsReauthentication = false;

      console.log('[AWSCredentials] Got unauthenticated credentials, expires:', this.credentials.expiration.toISOString());
      return true;
    } catch (error) {
      console.log('[AWSCredentials] Failed to get unauthenticated credentials:', error instanceof Error ? error.message : error);
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
      console.log('[AWSCredentials] Auth backend not configured');
      return false;
    }

    const hasSession = await authBackend.hasStoredSession();
    if (!hasSession) {
      console.log('[AWSCredentials] No stored auth backend session');
      return false;
    }

    console.log('[AWSCredentials] Trying to restore credentials via auth backend...');

    try {
      const result = await authBackend.refreshSession();

      this.credentials = {
        accessKeyId: result.credentials.accessKeyId,
        secretAccessKey: result.credentials.secretAccessKey,
        sessionToken: result.credentials.sessionToken,
        expiration: new Date(result.credentials.expiration),
      };
      this.identityId = result.cognitoIdentityId;
      this.initialized = true;
      this._needsReauthentication = false;

      // Store identity ID for future use
      await this.storeIdentityId(this.identityId);

      console.log('[AWSCredentials] Successfully restored credentials via auth backend!');
      console.log('[AWSCredentials] Expires:', this.credentials.expiration.toISOString());
      return true;
    } catch (error) {
      console.log('[AWSCredentials] Auth backend refresh failed:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Check if the user needs to re-authenticate to use AWS
   */
  get needsReauthentication(): boolean {
    return this._needsReauthentication;
  }

  /**
   * Initialize credentials with Apple Sign-In token
   * Call this during sign-in flow
   */
  async initializeWithAppleToken(appleIdToken: string): Promise<AWSCredentials> {
    this.appleIdToken = appleIdToken;
    this.credentials = null;
    this.identityId = null;
    this.initialized = true;
    this.restorationAttempted = false;
    this._needsReauthentication = false;

    // Try auth backend first (provides refresh tokens)
    const authBackend = getAuthBackendService();
    console.log('[AWSCredentials] Auth backend configured?', authBackend.isConfigured());
    if (authBackend.isConfigured()) {
      try {
        console.log('[AWSCredentials] Authenticating via auth backend...');
        const session = await authBackend.authenticateWithApple(appleIdToken);

        this.credentials = {
          accessKeyId: session.credentials.accessKeyId,
          secretAccessKey: session.credentials.secretAccessKey,
          sessionToken: session.credentials.sessionToken,
          expiration: new Date(session.credentials.expiration),
        };
        this.identityId = session.cognitoIdentityId;

        // Store identity ID for fallback
        await this.storeIdentityId(this.identityId);

        console.log('[AWSCredentials] Authenticated via auth backend, credentials expire:', this.credentials.expiration.toISOString());
        return this.credentials;
      } catch (backendError) {
        console.error('[AWSCredentials] Auth backend failed, falling back to direct Cognito');
        console.error('[AWSCredentials] Backend error:', backendError instanceof Error ? backendError.message : backendError);
        // Fall through to direct Cognito method
      }
    } else {
      console.log('[AWSCredentials] Auth backend not configured, using direct Cognito');
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
      console.log('[AWSCredentials] No stored identity ID found');
      return false;
    }

    console.log('[AWSCredentials] Trying to restore credentials with stored identity ID...');
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

      const creds = credentialsResponse.Credentials;
      if (!creds?.AccessKeyId || !creds?.SecretKey || !creds?.SessionToken) {
        console.log('[AWSCredentials] Incomplete credentials returned');
        return false;
      }

      this.credentials = {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretKey,
        sessionToken: creds.SessionToken,
        expiration: creds.Expiration || new Date(Date.now() + 3600 * 1000),
      };

      this.initialized = true;
      console.log('[AWSCredentials] Successfully restored credentials without Apple token!');
      console.log('[AWSCredentials] Expires:', this.credentials.expiration.toISOString());
      return true;
    } catch (error) {
      console.log('[AWSCredentials] Could not restore without Apple token:', error instanceof Error ? error.message : error);
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
   * Check if credentials are currently being restored
   */
  isRestoring(): boolean {
    return this.restorationPromise !== null;
  }

  /**
   * Wait for any ongoing restoration to complete
   * Returns true if credentials are available after waiting
   */
  async waitForReady(): Promise<boolean> {
    // If currently restoring, wait for it
    if (this.restorationPromise) {
      console.log('[AWSCredentials] Waiting for restoration to complete...');
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

    // If not initialized, try to get credentials (will attempt restoration or unauthenticated)
    if (!this.initialized) {
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
   * Get current status for debugging
   */
  getStatus(): CredentialStatus {
    return {
      isAuthenticated: this.appleIdToken !== null,
      identityId: this.identityId,
      expiresAt: this.credentials?.expiration || null,
      isExpired: this.credentials ? !this.isValid() : true,
    };
  }

  /**
   * Clear all credentials (call on sign-out)
   */
  async clearCredentials(): Promise<void> {
    console.log('[AWSCredentials] Clearing credentials');
    this.credentials = null;
    this.identityId = null;
    this.appleIdToken = null;
    this.refreshPromise = null;
    this.restorationPromise = null;
    this.initialized = false;
    this.restorationAttempted = false;
    this._needsReauthentication = false;
    await this.clearStoredIdentityId();

    // Clear auth backend session
    try {
      await getAuthBackendService().logout();
    } catch (error) {
      console.error('[AWSCredentials] Failed to logout from auth backend:', error);
    }
  }

  /**
   * Refresh credentials from Cognito
   */
  private async refresh(): Promise<AWSCredentials> {
    // Prevent concurrent refreshes
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

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

    console.log('[AWSCredentials] Refreshing credentials...');

    try {
      // Build logins map for Apple Sign-In
      const logins: Record<string, string> = {
        'appleid.apple.com': this.appleIdToken,
      };

      // Step 1: Get Cognito identity ID (or use cached)
      if (!this.identityId) {
        console.log('[AWSCredentials] Getting Cognito identity ID...');
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
        console.log('[AWSCredentials] Got identity ID:', this.identityId);
        // Store for future session restoration
        await this.storeIdentityId(this.identityId);
      }

      // Step 2: Get temporary AWS credentials
      console.log('[AWSCredentials] Getting temporary credentials...');
      const credentialsResponse = await this.cognitoClient.send(
        new GetCredentialsForIdentityCommand({
          IdentityId: this.identityId,
          Logins: logins,
        })
      );

      const creds = credentialsResponse.Credentials;
      if (!creds?.AccessKeyId || !creds?.SecretKey || !creds?.SessionToken) {
        throw new Error('[AWSCredentials] Incomplete credentials returned from Cognito');
      }

      this.credentials = {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretKey,
        sessionToken: creds.SessionToken,
        expiration: creds.Expiration || new Date(Date.now() + 3600 * 1000), // Default 1 hour
      };

      console.log(
        '[AWSCredentials] Credentials refreshed, expires:',
        this.credentials.expiration.toISOString()
      );

      return this.credentials;
    } catch (error) {
      console.error('[AWSCredentials] Failed to refresh credentials:', error);

      // If we got a NotAuthorizedException, clear the identity and try again
      if (error instanceof Error && error.name === 'NotAuthorizedException') {
        console.log('[AWSCredentials] Token may be expired, clearing identity');
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

    // Consider expired if within 5 minutes of expiration
    const bufferMs = 5 * 60 * 1000;
    return this.credentials.expiration.getTime() - bufferMs > Date.now();
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
