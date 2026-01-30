/**
 * AWS Credentials Service Tests
 */

// Mock expo-constants with AWS config
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        awsRegion: 'us-east-1',
        cognitoIdentityPoolId: 'us-east-1:mock-pool-id',
        authApiUrl: 'https://mock-api.example.com',
        useAwsBackend: true,
      },
    },
  },
}));

// Mock auth-backend.service
const mockAuthBackend = {
  isConfigured: jest.fn(() => true),
  authenticateWithApple: jest.fn(),
  refreshSession: jest.fn(),
  hasStoredSession: jest.fn(),
  logout: jest.fn(),
  clearSession: jest.fn(),
  getSession: jest.fn(),
};

jest.mock('../auth-backend.service', () => ({
  getAuthBackendService: jest.fn(() => mockAuthBackend),
  AuthBackendService: jest.fn(),
}));

import {
  AWSCredentialsService,
  getAWSCredentialsService,
  AuthenticationRequiredError,
} from '../aws-credentials.service';
import * as SecureStore from 'expo-secure-store';
import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';

// Access the mock send function exported by our mock
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __mockSend: mockCognitoSend } = require('@aws-sdk/client-cognito-identity');
import {
  mockAWSCredentials,
  mockExpiredAWSCredentials,
  mockSoonExpiringAWSCredentials,
  mockCognitoCredentialsResponse,
  mockCognitoGetIdResponse,
  mockAuthBackendSession,
  mockAuthBackendRefreshResult,
} from '../../__tests__/utils/testUtils';

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('AWSCredentialsService', () => {
  let service: AWSCredentialsService;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AWSCredentialsService();

    // Silence console during tests
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Default mock behaviors
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockSecureStore.setItemAsync.mockResolvedValue(undefined);
    mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
    mockAuthBackend.isConfigured.mockReturnValue(true);
    mockAuthBackend.hasStoredSession.mockResolvedValue(false);
    mockAuthBackend.logout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ============ getCredentials ============

  describe('getCredentials', () => {
    it('should return cached credentials when not expired', async () => {
      // Initialize with valid credentials first
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('mock-token');

      // Clear mocks to track subsequent calls
      jest.clearAllMocks();

      const creds = await service.getCredentials();

      expect(creds.accessKeyId).toBe(session.credentials.accessKeyId);
      // No new Cognito or auth backend calls
      expect(mockCognitoSend).not.toHaveBeenCalled();
      expect(mockAuthBackend.refreshSession).not.toHaveBeenCalled();
    });

    it('should attempt restoration when not initialized (auth backend path)', async () => {
      mockAuthBackend.hasStoredSession.mockResolvedValue(true);
      const refreshResult = mockAuthBackendRefreshResult();
      mockAuthBackend.refreshSession.mockResolvedValue(refreshResult);

      const creds = await service.getCredentials();

      expect(mockAuthBackend.refreshSession).toHaveBeenCalled();
      expect(creds.accessKeyId).toBe(refreshResult.credentials.accessKeyId);
    });

    it('should fall back to unauthenticated when all restoration fails', async () => {
      // Auth backend has no session
      mockAuthBackend.hasStoredSession.mockResolvedValue(false);
      // No stored identity ID
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      // Cognito returns unauthenticated credentials
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse('us-east-1:anon-identity'))
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());

      const creds = await service.getCredentials();

      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
    });

    it('should throw when Cognito is unavailable and no fallback works', async () => {
      mockAuthBackend.hasStoredSession.mockResolvedValue(false);
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      (mockCognitoSend as jest.Mock).mockRejectedValue(new Error('Cognito unavailable'));

      await expect(service.getCredentials()).rejects.toThrow();
    });
  });

  // ============ getReadOnlyCredentials ============

  describe('getReadOnlyCredentials', () => {
    it('should return cached credentials if valid (any type)', async () => {
      // Set up guest credentials
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse())
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());
      await service.getUnauthenticatedCredentials();
      jest.clearAllMocks();

      const creds = await service.getReadOnlyCredentials();

      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(mockCognitoSend).not.toHaveBeenCalled();
    });

    it('should fetch unauthenticated credentials when no cached credentials', async () => {
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse())
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());

      const creds = await service.getReadOnlyCredentials();

      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
    });

    it('should throw when unauthenticated fetch fails', async () => {
      (mockCognitoSend as jest.Mock).mockRejectedValue(new Error('Cognito error'));

      await expect(service.getReadOnlyCredentials()).rejects.toThrow(
        'Failed to get read-only credentials'
      );
    });
  });

  // ============ getAuthenticatedCredentials ============

  describe('getAuthenticatedCredentials', () => {
    it('should return cached authenticated credentials when valid', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('mock-token');
      jest.clearAllMocks();

      const creds = await service.getAuthenticatedCredentials();

      expect(creds.accessKeyId).toBe(session.credentials.accessKeyId);
      expect(mockCognitoSend).not.toHaveBeenCalled();
      expect(mockAuthBackend.refreshSession).not.toHaveBeenCalled();
    });

    it('should attempt restoration when not initialized and return authenticated credentials', async () => {
      mockAuthBackend.hasStoredSession.mockResolvedValue(true);
      const refreshResult = mockAuthBackendRefreshResult();
      mockAuthBackend.refreshSession.mockResolvedValue(refreshResult);

      const creds = await service.getAuthenticatedCredentials();

      expect(mockAuthBackend.refreshSession).toHaveBeenCalled();
      expect(creds.accessKeyId).toBe(refreshResult.credentials.accessKeyId);
    });

    it('should throw AuthenticationRequiredError when only guest credentials available', async () => {
      // Auth backend has no session, no stored identity
      mockAuthBackend.hasStoredSession.mockResolvedValue(false);
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      // Cognito returns unauthenticated credentials
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse('us-east-1:anon-identity'))
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());

      await expect(service.getAuthenticatedCredentials()).rejects.toThrow(
        AuthenticationRequiredError
      );
    });

    it('should throw AuthenticationRequiredError when all restoration fails', async () => {
      mockAuthBackend.hasStoredSession.mockResolvedValue(false);
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      (mockCognitoSend as jest.Mock).mockRejectedValue(new Error('Cognito unavailable'));

      await expect(service.getAuthenticatedCredentials()).rejects.toThrow(
        AuthenticationRequiredError
      );
    });

    it('should throw AuthenticationRequiredError after clearCredentials', async () => {
      // First authenticate
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('mock-token');

      // Clear credentials
      await service.clearCredentials();

      // Should not be able to get authenticated credentials without re-auth
      // (no stored session, no stored identity)
      mockAuthBackend.hasStoredSession.mockResolvedValue(false);
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse('us-east-1:anon'))
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());

      await expect(service.getAuthenticatedCredentials()).rejects.toThrow(
        AuthenticationRequiredError
      );
    });
  });

  // ============ initializeWithAppleToken ============

  describe('initializeWithAppleToken', () => {
    it('should exchange Apple token for credentials via auth backend', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);

      const creds = await service.initializeWithAppleToken('mock-apple-token');

      expect(mockAuthBackend.authenticateWithApple).toHaveBeenCalledWith('mock-apple-token');
      expect(creds.accessKeyId).toBe(session.credentials.accessKeyId);
    });

    it('should store identity ID in SecureStore', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);

      await service.initializeWithAppleToken('mock-apple-token');

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'unum_cognito_identity_id',
        session.cognitoIdentityId
      );
    });

    it('should set authenticated credential state', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);

      await service.initializeWithAppleToken('mock-apple-token');

      expect(service.hasAuthenticatedCredentials).toBe(true);
    });

    it('should fall back to direct Cognito when auth backend fails', async () => {
      mockAuthBackend.authenticateWithApple.mockRejectedValue(new Error('Backend down'));
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse())
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());

      const creds = await service.initializeWithAppleToken('mock-apple-token');

      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(service.hasAuthenticatedCredentials).toBe(true);
    });

    it('should throw when both auth backend and direct Cognito fail', async () => {
      mockAuthBackend.isConfigured.mockReturnValue(false);
      (mockCognitoSend as jest.Mock).mockRejectedValue(new Error('Cognito error'));

      await expect(
        service.initializeWithAppleToken('mock-apple-token')
      ).rejects.toThrow();
    });
  });

  // ============ tryRestoreFromAuthBackend ============

  describe('tryRestoreFromAuthBackend', () => {
    it('should restore credentials when refresh token is valid', async () => {
      mockAuthBackend.hasStoredSession.mockResolvedValue(true);
      const refreshResult = mockAuthBackendRefreshResult();
      mockAuthBackend.refreshSession.mockResolvedValue(refreshResult);

      const result = await service.tryRestoreFromAuthBackend();

      expect(result).toBe(true);
      expect(service.hasAuthenticatedCredentials).toBe(true);
    });

    it('should return false when auth backend not configured', async () => {
      mockAuthBackend.isConfigured.mockReturnValue(false);

      const result = await service.tryRestoreFromAuthBackend();

      expect(result).toBe(false);
    });

    it('should return false when no stored session', async () => {
      mockAuthBackend.hasStoredSession.mockResolvedValue(false);

      const result = await service.tryRestoreFromAuthBackend();

      expect(result).toBe(false);
    });

    it('should return false when refresh fails', async () => {
      mockAuthBackend.hasStoredSession.mockResolvedValue(true);
      mockAuthBackend.refreshSession.mockRejectedValue(new Error('Session expired'));

      const result = await service.tryRestoreFromAuthBackend();

      expect(result).toBe(false);
    });
  });

  // ============ tryRestoreFromStoredIdentity ============

  describe('tryRestoreFromStoredIdentity', () => {
    it('should restore credentials using stored Cognito identity ID', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('us-east-1:stored-identity');
      (mockCognitoSend as jest.Mock).mockResolvedValue(mockCognitoCredentialsResponse());

      const result = await service.tryRestoreFromStoredIdentity();

      expect(result).toBe(true);
      expect(service.hasValidCredentials()).toBe(true);
    });

    // BUG FIX TEST: This tests the CORRECT behavior.
    // Current code incorrectly marks these as authenticated (Problem 8).
    // This test will fail until Step 1 bug fix is applied.
    it('should mark credentials as guest/read-only (no Logins map)', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('us-east-1:stored-identity');
      (mockCognitoSend as jest.Mock).mockResolvedValue(mockCognitoCredentialsResponse());

      await service.tryRestoreFromStoredIdentity();

      // Without Logins map, Cognito returns unauthenticated role credentials
      expect(service.hasAuthenticatedCredentials).toBe(false);
    });

    it('should return false when no stored identity ID', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const result = await service.tryRestoreFromStoredIdentity();

      expect(result).toBe(false);
    });

    it('should return false when Cognito rejects the identity', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('us-east-1:stored-identity');
      (mockCognitoSend as jest.Mock).mockRejectedValue(
        new Error('NotAuthorizedException')
      );

      const result = await service.tryRestoreFromStoredIdentity();

      expect(result).toBe(false);
    });
  });

  // ============ getUnauthenticatedCredentials ============

  describe('getUnauthenticatedCredentials', () => {
    it('should create new Cognito identity for guest access', async () => {
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse('us-east-1:anon'))
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());

      const result = await service.getUnauthenticatedCredentials();

      expect(result).toBe(true);
      expect(mockCognitoSend).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate concurrent unauthenticated requests', async () => {
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse())
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());

      const [r1, r2, r3] = await Promise.all([
        service.getUnauthenticatedCredentials(),
        service.getUnauthenticatedCredentials(),
        service.getUnauthenticatedCredentials(),
      ]);

      // Only 2 Cognito calls (GetId + GetCredentials), not 6
      expect(mockCognitoSend).toHaveBeenCalledTimes(2);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(r3).toBe(true);
    });

    it('should mark credentials as guest (not authenticated)', async () => {
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse())
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());

      await service.getUnauthenticatedCredentials();

      expect(service.hasAuthenticatedCredentials).toBe(false);
    });

    it('should return false when Cognito fails', async () => {
      (mockCognitoSend as jest.Mock).mockRejectedValue(new Error('Cognito error'));

      const result = await service.getUnauthenticatedCredentials();

      expect(result).toBe(false);
    });
  });

  // ============ hasAuthenticatedCredentials ============

  describe('hasAuthenticatedCredentials', () => {
    it('should return true after auth backend initialization', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('token');

      expect(service.hasAuthenticatedCredentials).toBe(true);
    });

    it('should return false after unauthenticated fallback', async () => {
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse())
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());
      await service.getUnauthenticatedCredentials();

      expect(service.hasAuthenticatedCredentials).toBe(false);
    });

    it('should return false after clearCredentials', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('token');
      expect(service.hasAuthenticatedCredentials).toBe(true);

      await service.clearCredentials();

      expect(service.hasAuthenticatedCredentials).toBe(false);
    });
  });

  // ============ waitForReady ============

  describe('waitForReady', () => {
    it('should return true when credentials already valid', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('token');

      const ready = await service.waitForReady();

      expect(ready).toBe(true);
    });

    it('should try getCredentials when not initialized', async () => {
      // Set up unauthenticated credentials path
      mockAuthBackend.hasStoredSession.mockResolvedValue(false);
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse())
        .mockResolvedValueOnce(mockCognitoCredentialsResponse());

      const ready = await service.waitForReady();

      expect(ready).toBe(true);
    });
  });

  // ============ getStatus ============

  describe('getStatus', () => {
    // BUG FIX TEST: This tests the CORRECT behavior.
    // Current code checks appleIdToken instead of _isAuthenticatedCredentials (Problem 9).
    // This test will fail until Step 2 bug fix is applied.
    it('should report isAuthenticated correctly after auth backend restore', async () => {
      mockAuthBackend.hasStoredSession.mockResolvedValue(true);
      const refreshResult = mockAuthBackendRefreshResult();
      mockAuthBackend.refreshSession.mockResolvedValue(refreshResult);
      await service.tryRestoreFromAuthBackend();

      const status = service.getStatus();

      // After auth backend restore, appleIdToken is NOT set,
      // but credentials ARE authenticated. isAuthenticated should be true.
      expect(status.isAuthenticated).toBe(true);
    });

    it('should report isExpired correctly for expired credentials', async () => {
      (mockCognitoSend as jest.Mock)
        .mockResolvedValueOnce(mockCognitoGetIdResponse())
        .mockResolvedValueOnce({
          Credentials: {
            AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
            SecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            SessionToken: 'mock-session-token',
            Expiration: new Date(Date.now() - 1000), // Already expired
          },
        });
      await service.getUnauthenticatedCredentials();

      const status = service.getStatus();

      expect(status.isExpired).toBe(true);
    });

    it('should return identityId when available', async () => {
      mockAuthBackend.hasStoredSession.mockResolvedValue(true);
      const refreshResult = mockAuthBackendRefreshResult();
      mockAuthBackend.refreshSession.mockResolvedValue(refreshResult);
      await service.tryRestoreFromAuthBackend();

      const status = service.getStatus();

      expect(status.identityId).toBe('us-east-1:mock-identity');
    });
  });

  // ============ clearCredentials ============

  describe('clearCredentials', () => {
    it('should clear all stored credentials and tokens', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('token');

      await service.clearCredentials();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(
        'unum_cognito_identity_id'
      );
    });

    it('should reset all state flags', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('token');

      await service.clearCredentials();

      expect(service.hasAuthenticatedCredentials).toBe(false);
      expect(service.hasValidCredentials()).toBe(false);
      expect(service.needsReauthentication).toBe(false);
    });

    it('should call auth backend logout', async () => {
      const session = mockAuthBackendSession();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('token');

      await service.clearCredentials();

      expect(mockAuthBackend.logout).toHaveBeenCalled();
    });
  });

  // ============ credential expiration ============

  describe('credential expiration', () => {
    it('should treat credentials expiring within 5-minute buffer as expired', async () => {
      const session = mockAuthBackendSession();
      // Set expiration to 2 minutes from now (within 5-min buffer)
      session.credentials.expiration = new Date(
        Date.now() + 2 * 60 * 1000
      ).toISOString();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('token');

      // hasValidCredentials checks isValid() which uses the 5-min buffer
      expect(service.hasValidCredentials()).toBe(false);
    });

    it('should treat credentials with future expiration as valid', async () => {
      const session = mockAuthBackendSession();
      // Set expiration to 1 hour from now (well outside buffer)
      session.credentials.expiration = new Date(
        Date.now() + 60 * 60 * 1000
      ).toISOString();
      mockAuthBackend.authenticateWithApple.mockResolvedValue(session);
      await service.initializeWithAppleToken('token');

      expect(service.hasValidCredentials()).toBe(true);
    });
  });
});
