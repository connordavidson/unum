/**
 * Auth Backend Service Tests
 */

// Mock expo-secure-store (handled via jest.config moduleNameMapper)
// Mock expo-constants to provide auth API URL
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        authApiUrl: 'https://mock-api.example.com',
      },
    },
  },
}));

import { AuthBackendService, getAuthBackendService } from '../auth-backend.service';
import * as SecureStore from 'expo-secure-store';
import {
  mockAuthBackendSession,
  mockAuthBackendRefreshResult,
} from '../../__tests__/utils/testUtils';

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

// Helper to reset the module-level singleton
let serviceInstance: AuthBackendService;

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('AuthBackendService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serviceInstance = new AuthBackendService();
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockSecureStore.setItemAsync.mockResolvedValue(undefined);
    mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
  });

  describe('isConfigured', () => {
    it('should return true when AUTH_API_URL is set', () => {
      expect(serviceInstance.isConfigured()).toBe(true);
    });
  });

  describe('authenticateWithApple', () => {
    it('should send Apple identity token to /auth/apple endpoint', async () => {
      const sessionData = mockAuthBackendSession();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sessionData),
      });

      await serviceInstance.authenticateWithApple('mock-apple-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://mock-api.example.com/auth/apple',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identityToken: 'mock-apple-token' }),
        })
      );
    });

    it('should return session with credentials and refresh token on success', async () => {
      const sessionData = mockAuthBackendSession();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sessionData),
      });

      const result = await serviceInstance.authenticateWithApple('mock-apple-token');

      expect(result.accessToken).toBe(sessionData.accessToken);
      expect(result.refreshToken).toBe(sessionData.refreshToken);
      expect(result.credentials.accessKeyId).toBe(sessionData.credentials.accessKeyId);
      expect(result.cognitoIdentityId).toBe(sessionData.cognitoIdentityId);
    });

    it('should store refresh token in SecureStore', async () => {
      const sessionData = mockAuthBackendSession();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sessionData),
      });

      await serviceInstance.authenticateWithApple('mock-apple-token');

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'unum_refresh_token',
        sessionData.refreshToken
      );
    });

    it('should store session ID in SecureStore', async () => {
      const sessionData = mockAuthBackendSession();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sessionData),
      });

      await serviceInstance.authenticateWithApple('mock-apple-token');

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'unum_session_id',
        sessionData.accessToken
      );
    });

    it('should throw on network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        serviceInstance.authenticateWithApple('mock-apple-token')
      ).rejects.toThrow('Network error');
    });

    it('should throw with error message on non-ok responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid token' }),
      });

      await expect(
        serviceInstance.authenticateWithApple('mock-apple-token')
      ).rejects.toThrow('Authentication failed');
    });
  });

  describe('refreshSession', () => {
    it('should send stored refresh token to /auth/refresh endpoint', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('stored-refresh-token');
      const refreshResult = mockAuthBackendRefreshResult();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(refreshResult),
      });

      await serviceInstance.refreshSession();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://mock-api.example.com/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'stored-refresh-token' }),
        })
      );
    });

    it('should return new credentials on success', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('stored-refresh-token');
      const refreshResult = mockAuthBackendRefreshResult();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(refreshResult),
      });

      const result = await serviceInstance.refreshSession();

      expect(result.credentials.accessKeyId).toBe(refreshResult.credentials.accessKeyId);
      expect(result.cognitoIdentityId).toBe(refreshResult.cognitoIdentityId);
    });

    it('should update stored session ID on success', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('stored-refresh-token');
      const refreshResult = mockAuthBackendRefreshResult();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(refreshResult),
      });

      await serviceInstance.refreshSession();

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'unum_session_id',
        refreshResult.accessToken
      );
    });

    it('should deduplicate concurrent refresh calls', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('stored-refresh-token');
      const refreshResult = mockAuthBackendRefreshResult();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(refreshResult),
      });

      // Launch 3 concurrent refreshes
      const [r1, r2, r3] = await Promise.all([
        serviceInstance.refreshSession(),
        serviceInstance.refreshSession(),
        serviceInstance.refreshSession(),
      ]);

      // Only one fetch call should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);
      // All should return the same result
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('should clear tokens and throw on 401 (expired refresh token)', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('expired-refresh-token');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Expired', code: 'REAUTH_REQUIRED' }),
      });

      await expect(serviceInstance.refreshSession()).rejects.toThrow('Session expired');

      // Should clear stored tokens
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('unum_refresh_token');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('unum_session_id');
    });

    it('should throw when no stored refresh token', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      await expect(serviceInstance.refreshSession()).rejects.toThrow(
        'No refresh token available'
      );
    });

    it('should throw on network errors during refresh', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('stored-refresh-token');
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      await expect(serviceInstance.refreshSession()).rejects.toThrow('Network timeout');
    });
  });

  describe('logout', () => {
    it('should call /auth/logout endpoint with tokens', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce('stored-refresh-token')
        .mockResolvedValueOnce('stored-session-id');
      mockFetch.mockResolvedValue({ ok: true });

      await serviceInstance.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://mock-api.example.com/auth/logout',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            refreshToken: 'stored-refresh-token',
            sessionId: 'stored-session-id',
          }),
        })
      );
    });

    it('should clear local session even when API call fails', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce('stored-refresh-token')
        .mockResolvedValueOnce('stored-session-id');
      mockFetch.mockRejectedValue(new Error('Network error'));

      await serviceInstance.logout();

      // Should still clear local tokens
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('unum_refresh_token');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('unum_session_id');
    });

    it('should clear local session without API call when no tokens stored', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      await serviceInstance.logout();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('unum_refresh_token');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('unum_session_id');
    });
  });

  describe('hasStoredSession', () => {
    it('should return true when refresh token exists in SecureStore', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('stored-refresh-token');

      const result = await serviceInstance.hasStoredSession();

      expect(result).toBe(true);
    });

    it('should return false when no refresh token stored', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const result = await serviceInstance.hasStoredSession();

      expect(result).toBe(false);
    });
  });
});
