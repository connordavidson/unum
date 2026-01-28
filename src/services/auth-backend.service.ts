/**
 * Auth Backend Service
 *
 * Communicates with the Lambda auth backend for session management.
 * Provides refresh tokens so users don't need to re-authenticate
 * when the Apple identity token expires (~10 minutes).
 *
 * Endpoints:
 * - POST /auth/apple   - Exchange Apple token for session
 * - POST /auth/refresh - Refresh session with refresh token
 * - POST /auth/logout  - Invalidate session
 */

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { AUTH_STORAGE_KEYS } from '../shared/constants';

const extra = Constants.expoConfig?.extra ?? {};
const AUTH_API_URL = extra.authApiUrl || '';

// Debug: Log the auth API URL on module load
console.log('[AuthBackend] AUTH_API_URL configured:', AUTH_API_URL || '(empty)');

// ============ Types ============

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  credentials: AWSCredentials;
  userId: string;
  cognitoIdentityId: string;
}

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  credentials: AWSCredentials;
  userId: string;
  cognitoIdentityId: string;
}

// ============ Storage Helpers ============

async function storeRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_STORAGE_KEYS.REFRESH_TOKEN, token);
}

async function getStoredRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
  } catch (error) {
    console.error('[AuthBackend] Failed to get refresh token:', error);
    return null;
  }
}

async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
  } catch (error) {
    console.error('[AuthBackend] Failed to clear refresh token:', error);
  }
}

async function storeSessionId(sessionId: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_STORAGE_KEYS.SESSION_ID, sessionId);
}

async function getStoredSessionId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_STORAGE_KEYS.SESSION_ID);
  } catch (error) {
    console.error('[AuthBackend] Failed to get session ID:', error);
    return null;
  }
}

async function clearSessionId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.SESSION_ID);
  } catch (error) {
    console.error('[AuthBackend] Failed to clear session ID:', error);
  }
}

// ============ API Client ============

class AuthBackendService {
  private session: AuthSession | null = null;
  private refreshPromise: Promise<RefreshResult> | null = null;

  /**
   * Check if auth backend is configured
   */
  isConfigured(): boolean {
    return !!AUTH_API_URL;
  }

  /**
   * Exchange Apple identity token for a session with refresh token
   */
  async authenticateWithApple(identityToken: string): Promise<AuthSession> {
    if (!AUTH_API_URL) {
      throw new Error('[AuthBackend] Auth API URL not configured');
    }

    console.log('[AuthBackend] Authenticating with Apple token...');
    console.log('[AuthBackend] Calling:', `${AUTH_API_URL}/auth/apple`);

    const response = await fetch(`${AUTH_API_URL}/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken }),
    });

    console.log('[AuthBackend] Response status:', response.status);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[AuthBackend] Auth failed with status', response.status, error);
      throw new Error(`[AuthBackend] Authentication failed: ${error.error || response.statusText}`);
    }

    const session: AuthSession = await response.json();

    // Store tokens securely
    await storeRefreshToken(session.refreshToken);
    await storeSessionId(session.accessToken);

    this.session = session;
    console.log('[AuthBackend] Authentication successful, session expires in', session.expiresIn, 'seconds');

    return session;
  }

  /**
   * Refresh the session using stored refresh token
   */
  async refreshSession(): Promise<RefreshResult> {
    // Prevent concurrent refreshes
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<RefreshResult> {
    if (!AUTH_API_URL) {
      throw new Error('[AuthBackend] Auth API URL not configured');
    }

    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
      throw new Error('[AuthBackend] No refresh token available. User must sign in again.');
    }

    console.log('[AuthBackend] Refreshing session...');

    const response = await fetch(`${AUTH_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error', code: '' }));

      // If refresh token is invalid/expired, clear stored tokens
      if (response.status === 401) {
        console.log('[AuthBackend] Refresh token expired, clearing tokens');
        await this.clearSession();
        throw new Error(`[AuthBackend] Session expired: ${error.code || 'REAUTH_REQUIRED'}`);
      }

      throw new Error(`[AuthBackend] Refresh failed: ${error.error || response.statusText}`);
    }

    const result: RefreshResult = await response.json();

    // Update stored session ID
    await storeSessionId(result.accessToken);

    console.log('[AuthBackend] Session refreshed successfully');

    return result;
  }

  /**
   * Check if we have a stored refresh token
   */
  async hasStoredSession(): Promise<boolean> {
    const refreshToken = await getStoredRefreshToken();
    return !!refreshToken;
  }

  /**
   * Logout and invalidate the session
   */
  async logout(): Promise<void> {
    if (!AUTH_API_URL) {
      await this.clearSession();
      return;
    }

    const refreshToken = await getStoredRefreshToken();
    const sessionId = await getStoredSessionId();

    if (refreshToken || sessionId) {
      try {
        console.log('[AuthBackend] Logging out...');
        await fetch(`${AUTH_API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken, sessionId }),
        });
      } catch (error) {
        console.error('[AuthBackend] Logout request failed:', error);
        // Continue with local cleanup even if server request fails
      }
    }

    await this.clearSession();
  }

  /**
   * Clear all stored session data
   */
  async clearSession(): Promise<void> {
    this.session = null;
    await clearRefreshToken();
    await clearSessionId();
  }

  /**
   * Get the current session (if any)
   */
  getSession(): AuthSession | null {
    return this.session;
  }
}

// ============ Singleton ============

let instance: AuthBackendService | null = null;

export function getAuthBackendService(): AuthBackendService {
  if (!instance) {
    instance = new AuthBackendService();
  }
  return instance;
}

export { AuthBackendService };
