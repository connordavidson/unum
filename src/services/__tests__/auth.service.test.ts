/**
 * Auth Service Tests
 */

// Mock expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        useAwsBackend: true,
      },
    },
  },
}));

// Mock FEATURE_FLAGS
jest.mock('../../shared/constants', () => ({
  FEATURE_FLAGS: {
    USE_AWS_BACKEND: true,
  },
  AUTH_STORAGE_KEYS: {
    APPLE_USER_ID: 'unum_apple_user_id',
    APPLE_IDENTITY_TOKEN: 'unum_apple_identity_token',
    USER_PROFILE: 'unum_user_profile',
    REFRESH_TOKEN: 'unum_refresh_token',
    SESSION_ID: 'unum_session_id',
  },
}));

// Mock aws-credentials.service
const mockCredentialsService = {
  initializeWithAppleToken: jest.fn(),
  getCredentials: jest.fn(),
  clearCredentials: jest.fn(),
  hasAuthenticatedCredentials: false,
};

jest.mock('../aws-credentials.service', () => ({
  getAWSCredentialsService: jest.fn(() => mockCredentialsService),
}));

// Mock DynamoDB client
jest.mock('../../api/clients/dynamodb.client', () => ({
  upsertUser: jest.fn(),
  getUserById: jest.fn(),
}));

// Mock storage utils — use require to get hoisted mock references
jest.mock('../../shared/utils', () => ({
  getStoredJSON: jest.fn(),
  setStoredJSON: jest.fn(),
}));

import {
  signInWithApple,
  signOut,
  loadStoredAuth,
  checkCredentialState,
} from '../auth.service';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { getStoredJSON, setStoredJSON } from '../../shared/utils';
import { upsertUser, getUserById } from '../../api/clients/dynamodb.client';
import { mockAppleCredential, mockAuthUser } from '../../__tests__/utils/testUtils';

const mockAppleAuth = AppleAuthentication as jest.Mocked<typeof AppleAuthentication>;
const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const mockGetStoredJSON = getStoredJSON as jest.Mock;
const mockSetStoredJSON = setStoredJSON as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;
const mockGetUserById = getUserById as jest.Mock;

describe('AuthService', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Default mock behaviors
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockSecureStore.setItemAsync.mockResolvedValue(undefined);
    mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
    mockGetStoredJSON.mockResolvedValue(null);
    mockSetStoredJSON.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue(null);
    mockUpsertUser.mockResolvedValue(undefined);
    mockCredentialsService.initializeWithAppleToken.mockResolvedValue(undefined);
    mockCredentialsService.clearCredentials.mockResolvedValue(undefined);
    mockCredentialsService.getCredentials.mockResolvedValue(undefined);
    mockCredentialsService.hasAuthenticatedCredentials = false;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ============ signInWithApple ============

  describe('signInWithApple', () => {
    it('should return user on successful first sign-in (with name/email from Apple)', async () => {
      const credential = mockAppleCredential();
      mockAppleAuth.signInAsync.mockResolvedValue(credential as any);

      const result = await signInWithApple();

      expect(result.success).toBe(true);
      expect(result.user).not.toBeNull();
      expect(result.user!.id).toBe('apple-user-001');
      expect(result.user!.email).toBe('test@example.com');
      expect(result.user!.displayName).toBe('Test User');
      expect(result.error).toBeNull();
    });

    it('should return user on subsequent sign-in (no name from Apple, uses stored profile)', async () => {
      const credential = mockAppleCredential({
        email: null,
        fullName: { givenName: null, familyName: null },
      });
      mockAppleAuth.signInAsync.mockResolvedValue(credential as any);

      // Stored profile from previous sign-in
      mockGetStoredJSON.mockResolvedValue({
        email: 'stored@example.com',
        displayName: 'Stored User',
        givenName: 'Stored',
        familyName: 'User',
      });

      const result = await signInWithApple();

      expect(result.success).toBe(true);
      expect(result.user!.email).toBe('stored@example.com');
      expect(result.user!.displayName).toBe('Stored User');
    });

    it('should merge Apple data with DynamoDB data (Apple takes precedence)', async () => {
      const credential = mockAppleCredential({
        email: 'apple@example.com',
        fullName: { givenName: 'Apple', familyName: 'User' },
      });
      mockAppleAuth.signInAsync.mockResolvedValue(credential as any);

      // DynamoDB has different name
      mockGetUserById.mockResolvedValue({
        email: 'db@example.com',
        displayName: 'DB User',
        givenName: 'DB',
        familyName: 'User',
      });

      const result = await signInWithApple();

      // Apple data takes precedence
      expect(result.user!.email).toBe('apple@example.com');
      expect(result.user!.displayName).toBe('Apple User');
    });

    it('should initialize AWS credentials via Cognito when token available', async () => {
      const credential = mockAppleCredential();
      mockAppleAuth.signInAsync.mockResolvedValue(credential as any);

      await signInWithApple();

      expect(mockCredentialsService.initializeWithAppleToken).toHaveBeenCalledWith(
        'mock-apple-identity-token'
      );
    });

    it('should store Apple user ID in SecureStore', async () => {
      const credential = mockAppleCredential();
      mockAppleAuth.signInAsync.mockResolvedValue(credential as any);

      await signInWithApple();

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'unum_apple_user_id',
        'apple-user-001'
      );
    });

    it('should store user profile in AsyncStorage', async () => {
      const credential = mockAppleCredential();
      mockAppleAuth.signInAsync.mockResolvedValue(credential as any);

      await signInWithApple();

      expect(mockSetStoredJSON).toHaveBeenCalledWith(
        'unum_user_profile',
        expect.objectContaining({
          email: 'test@example.com',
          displayName: 'Test User',
        })
      );
    });

    it('should upsert user to DynamoDB when AWS backend enabled', async () => {
      const credential = mockAppleCredential();
      mockAppleAuth.signInAsync.mockResolvedValue(credential as any);

      await signInWithApple();

      expect(mockUpsertUser).toHaveBeenCalledWith(
        'apple-user-001',
        expect.objectContaining({
          id: 'apple-user-001',
          email: 'test@example.com',
          authProvider: 'apple',
        })
      );
    });

    it('should succeed even when DynamoDB upsert fails', async () => {
      const credential = mockAppleCredential();
      mockAppleAuth.signInAsync.mockResolvedValue(credential as any);
      mockUpsertUser.mockRejectedValue(new Error('DynamoDB error'));

      const result = await signInWithApple();

      expect(result.success).toBe(true);
      expect(result.user).not.toBeNull();
    });

    it('should succeed even when Cognito init fails (local-only mode)', async () => {
      const credential = mockAppleCredential();
      mockAppleAuth.signInAsync.mockResolvedValue(credential as any);
      mockCredentialsService.initializeWithAppleToken.mockRejectedValue(
        new Error('Cognito error')
      );

      const result = await signInWithApple();

      expect(result.success).toBe(true);
      expect(result.user).not.toBeNull();
    });

    it('should return cancel error when user cancels sign-in', async () => {
      mockAppleAuth.signInAsync.mockRejectedValue(
        new Error('The operation was canceled')
      );

      const result = await signInWithApple();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sign-in was cancelled');
      expect(result.user).toBeNull();
    });

    it('should return error message on unexpected failure', async () => {
      mockAppleAuth.signInAsync.mockRejectedValue(new Error('Unexpected error'));

      const result = await signInWithApple();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected error');
      expect(result.user).toBeNull();
    });
  });

  // ============ loadStoredAuth ============

  describe('loadStoredAuth', () => {
    it('should return user from stored credentials when credential state is authorized', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('apple-user-001');
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED
      );
      mockCredentialsService.hasAuthenticatedCredentials = true;
      mockGetStoredJSON.mockResolvedValue({
        email: 'test@example.com',
        displayName: 'Test User',
        givenName: 'Test',
        familyName: 'User',
      });

      const user = await loadStoredAuth();

      expect(user).not.toBeNull();
      expect(user!.id).toBe('apple-user-001');
      expect(user!.displayName).toBe('Test User');
    });

    it('should return null when no stored user ID', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const user = await loadStoredAuth();

      expect(user).toBeNull();
    });

    it('should return null and sign out when credential state is revoked', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('apple-user-001');
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.REVOKED
      );

      const user = await loadStoredAuth();

      expect(user).toBeNull();
      expect(mockCredentialsService.clearCredentials).toHaveBeenCalled();
    });

    it('should return null and sign out when credential state is not_found', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('apple-user-001');
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.NOT_FOUND
      );

      const user = await loadStoredAuth();

      expect(user).toBeNull();
      expect(mockCredentialsService.clearCredentials).toHaveBeenCalled();
    });

    it('should return user when credential state check returns unknown (transient error)', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('apple-user-001');
      mockAppleAuth.getCredentialStateAsync.mockRejectedValue(new Error('API error'));
      mockGetStoredJSON.mockResolvedValue({
        email: 'test@example.com',
        displayName: 'Test User',
      });

      const user = await loadStoredAuth();

      // Should NOT sign out on transient errors
      expect(user).not.toBeNull();
      expect(user!.id).toBe('apple-user-001');
      expect(mockCredentialsService.clearCredentials).not.toHaveBeenCalled();
    });

    it('should restore AWS credentials on load', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('apple-user-001');
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED
      );
      mockCredentialsService.hasAuthenticatedCredentials = true;
      mockGetStoredJSON.mockResolvedValue({
        email: 'test@example.com',
        displayName: 'Test User',
      });

      await loadStoredAuth();

      expect(mockCredentialsService.getCredentials).toHaveBeenCalled();
    });

    it('should return user even when only guest credentials available (no sign-out)', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('apple-user-001');
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED
      );
      // hasAuthenticatedCredentials is false (default) = guest only
      mockCredentialsService.hasAuthenticatedCredentials = false;
      mockGetStoredJSON.mockResolvedValue({
        email: 'test@example.com',
        displayName: 'Test User',
      });

      const user = await loadStoredAuth();

      // User stays logged in — identity is based on Apple credential state, not AWS credentials
      expect(user).not.toBeNull();
      expect(user!.id).toBe('apple-user-001');
      expect(mockCredentialsService.clearCredentials).not.toHaveBeenCalled();
    });

    it('should return user even when AWS credential restoration fails entirely', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('apple-user-001');
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED
      );
      mockCredentialsService.getCredentials.mockRejectedValue(new Error('Network error'));
      mockGetStoredJSON.mockResolvedValue({
        email: 'test@example.com',
        displayName: 'Test User',
      });

      const user = await loadStoredAuth();

      // User stays logged in — AWS credential failure is not fatal
      expect(user).not.toBeNull();
      expect(user!.id).toBe('apple-user-001');
    });

    it('should fetch display name from DynamoDB when missing locally', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('apple-user-001');
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED
      );
      mockCredentialsService.hasAuthenticatedCredentials = true;

      // No local profile (or profile with no displayName)
      mockGetStoredJSON.mockResolvedValue({
        email: 'test@example.com',
        displayName: null,
      });

      // DynamoDB has the display name
      mockGetUserById.mockResolvedValue({
        email: 'test@example.com',
        displayName: 'DB User',
        givenName: 'DB',
        familyName: 'User',
      });

      const user = await loadStoredAuth();

      expect(user!.displayName).toBe('DB User');
      expect(mockGetUserById).toHaveBeenCalledWith('apple-user-001');
    });

    it('should cache DynamoDB profile data locally after fetch', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('apple-user-001');
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED
      );
      mockCredentialsService.hasAuthenticatedCredentials = true;
      mockGetStoredJSON.mockResolvedValue({ displayName: null });
      mockGetUserById.mockResolvedValue({
        email: 'db@example.com',
        displayName: 'DB User',
        givenName: 'DB',
        familyName: 'User',
      });

      await loadStoredAuth();

      expect(mockSetStoredJSON).toHaveBeenCalledWith(
        'unum_user_profile',
        expect.objectContaining({
          displayName: 'DB User',
        })
      );
    });
  });

  // ============ signOut ============

  describe('signOut', () => {
    it('should clear AWS credentials', async () => {
      await signOut();

      expect(mockCredentialsService.clearCredentials).toHaveBeenCalled();
    });

    it('should clear Apple user ID from SecureStore', async () => {
      await signOut();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('unum_apple_user_id');
    });

    it('should clear Apple identity token from SecureStore', async () => {
      await signOut();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(
        'unum_apple_identity_token'
      );
    });

    it('should clear user profile from AsyncStorage', async () => {
      await signOut();

      expect(mockSetStoredJSON).toHaveBeenCalledWith('unum_user_profile', null);
    });
  });

  // ============ checkCredentialState ============

  describe('checkCredentialState', () => {
    it('should map AUTHORIZED to "authorized"', async () => {
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED
      );

      const result = await checkCredentialState('user-id');

      expect(result).toBe('authorized');
    });

    it('should map REVOKED to "revoked"', async () => {
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.REVOKED
      );

      const result = await checkCredentialState('user-id');

      expect(result).toBe('revoked');
    });

    it('should map NOT_FOUND to "not_found"', async () => {
      mockAppleAuth.getCredentialStateAsync.mockResolvedValue(
        AppleAuthentication.AppleAuthenticationCredentialState.NOT_FOUND
      );

      const result = await checkCredentialState('user-id');

      expect(result).toBe('not_found');
    });

    it('should return "unknown" on error', async () => {
      mockAppleAuth.getCredentialStateAsync.mockRejectedValue(new Error('API error'));

      const result = await checkCredentialState('user-id');

      expect(result).toBe('unknown');
    });
  });
});
