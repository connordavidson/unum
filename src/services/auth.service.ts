/**
 * Auth Service
 *
 * Handles Apple Sign-In authentication, credential storage, and session management.
 * Integrates with AWS Cognito Identity Pools for secure credential management.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { AUTH_STORAGE_KEYS, FEATURE_FLAGS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
import { upsertUser, getUserById } from '../api/clients/dynamodb.client';
import { getAWSCredentialsService } from './aws-credentials.service';
import type { AuthUser, StoredAuthData } from '../shared/types/auth';

// ============ Types ============

export interface SignInResult {
  success: boolean;
  user: AuthUser | null;
  error: string | null;
}

// ============ Storage Helpers ============

/**
 * Store Apple user ID securely (encrypted)
 */
async function storeAppleUserId(userId: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_STORAGE_KEYS.APPLE_USER_ID, userId);
}

/**
 * Retrieve stored Apple user ID
 */
async function getStoredAppleUserId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_STORAGE_KEYS.APPLE_USER_ID);
  } catch (error) {
    console.error('[AuthService] Failed to get stored Apple user ID:', error);
    return null;
  }
}

/**
 * Clear stored Apple user ID
 */
async function clearAppleUserId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.APPLE_USER_ID);
  } catch (error) {
    console.error('[AuthService] Failed to clear Apple user ID:', error);
  }
}

/**
 * Store Apple identity token securely (for Cognito)
 */
async function storeAppleIdentityToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_STORAGE_KEYS.APPLE_IDENTITY_TOKEN, token);
}

/**
 * Retrieve stored Apple identity token
 */
async function getStoredAppleIdentityToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_STORAGE_KEYS.APPLE_IDENTITY_TOKEN);
  } catch (error) {
    console.error('[AuthService] Failed to get stored Apple identity token:', error);
    return null;
  }
}

/**
 * Clear stored Apple identity token
 */
async function clearAppleIdentityToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.APPLE_IDENTITY_TOKEN);
  } catch (error) {
    console.error('[AuthService] Failed to clear Apple identity token:', error);
  }
}

/**
 * Store user profile data (non-sensitive)
 */
async function storeUserProfile(profile: StoredAuthData['profile']): Promise<void> {
  await setStoredJSON(AUTH_STORAGE_KEYS.USER_PROFILE, profile);
}

/**
 * Retrieve stored user profile
 */
async function getStoredUserProfile(): Promise<StoredAuthData['profile'] | null> {
  return getStoredJSON<StoredAuthData['profile']>(AUTH_STORAGE_KEYS.USER_PROFILE);
}

/**
 * Clear stored user profile
 */
async function clearUserProfile(): Promise<void> {
  await setStoredJSON(AUTH_STORAGE_KEYS.USER_PROFILE, null);
}

// ============ Auth Service ============

/**
 * Check if Apple Sign-In is available on this device
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch (error) {
    console.error('[AuthService] Failed to check Apple Sign-In availability:', error);
    return false;
  }
}

/**
 * Sign in with Apple
 * Returns the authenticated user on success, or an error message on failure
 */
export async function signInWithApple(): Promise<SignInResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    // Debug: Log what Apple returned
    console.log('[AuthService] Apple credential received:', {
      user: credential.user,
      email: credential.email,
      fullName: credential.fullName,
      givenName: credential.fullName?.givenName,
      familyName: credential.fullName?.familyName,
      hasIdentityToken: !!credential.identityToken,
      identityTokenLength: credential.identityToken?.length,
    });
    console.log('[AuthService] USE_AWS_BACKEND:', FEATURE_FLAGS.USE_AWS_BACKEND);

    // Apple only provides fullName and email on the FIRST sign-in
    // On subsequent sign-ins, we need to use stored profile data
    let displayName: string | null = null;
    if (credential.fullName) {
      const parts = [
        credential.fullName.givenName,
        credential.fullName.familyName,
      ].filter(Boolean);
      displayName = parts.length > 0 ? parts.join(' ') : null;
    }

    console.log('[AuthService] Parsed displayName:', displayName);

    // Initialize AWS credentials via Cognito if we have an identity token
    console.log('[AuthService] Checking AWS backend:', { useAwsBackend: FEATURE_FLAGS.USE_AWS_BACKEND, hasToken: !!credential.identityToken });
    if (FEATURE_FLAGS.USE_AWS_BACKEND && credential.identityToken) {
      try {
        console.log('[AuthService] Storing identity token...');
        // Store the identity token for session restoration
        await storeAppleIdentityToken(credential.identityToken);
        console.log('[AuthService] Identity token stored, initializing Cognito...');
        await getAWSCredentialsService().initializeWithAppleToken(credential.identityToken);
        console.log('[AuthService] AWS credentials initialized successfully');
      } catch (cognitoError) {
        console.error('[AuthService] Failed to initialize AWS credentials:', cognitoError);
        // Continue with sign-in - AWS operations will fail but user can still use app locally
      }
    } else {
      console.log('[AuthService] Skipping AWS init - backend disabled or no token');
    }

    // Store credentials locally
    await storeAppleUserId(credential.user);

    // Store profile locally (only if we got new data, otherwise keep existing)
    const existingProfile = await getStoredUserProfile();
    let newProfile = {
      email: credential.email || existingProfile?.email || null,
      displayName: displayName || existingProfile?.displayName || null,
      givenName: credential.fullName?.givenName || existingProfile?.givenName || null,
      familyName: credential.fullName?.familyName || existingProfile?.familyName || null,
    };

    // Fetch user data from DynamoDB to get any previously stored profile info
    // (Apple only provides name on first sign-in, so we need DynamoDB for returning users)
    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      try {
        console.log('[AuthService] Fetching user data from DynamoDB...');
        const dbUser = await getUserById(credential.user);
        if (dbUser) {
          console.log('[AuthService] Found existing user in DynamoDB:', {
            displayName: dbUser.displayName,
            givenName: dbUser.givenName,
            familyName: dbUser.familyName,
          });
          // Merge DynamoDB data with Apple data (Apple data takes precedence if available)
          newProfile = {
            email: credential.email || dbUser.email || newProfile.email,
            displayName: displayName || dbUser.displayName || newProfile.displayName,
            givenName: credential.fullName?.givenName || dbUser.givenName || newProfile.givenName,
            familyName: credential.fullName?.familyName || dbUser.familyName || newProfile.familyName,
          };
        }
      } catch (dbError) {
        console.error('[AuthService] Failed to fetch user from DynamoDB:', dbError);
        // Continue with local/Apple data
      }
    }

    await storeUserProfile(newProfile);

    // Store user in DynamoDB (if AWS backend is enabled)
    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      try {
        console.log('[AuthService] Storing user in DynamoDB...');
        await upsertUser(credential.user, {
          id: credential.user,
          email: newProfile.email,
          givenName: newProfile.givenName,
          familyName: newProfile.familyName,
          displayName: newProfile.displayName,
          authProvider: 'apple',
          lastSignInAt: new Date().toISOString(),
        });
        console.log('[AuthService] User stored in DynamoDB successfully');
      } catch (dbError) {
        // Don't fail sign-in if DynamoDB storage fails
        console.error('[AuthService] Failed to store user in DynamoDB:', dbError);
      }
    }

    const user: AuthUser = {
      id: credential.user,
      email: newProfile.email,
      displayName: newProfile.displayName,
      authProvider: 'apple',
    };

    console.log('[AuthService] Sign-in successful:', { userId: user.id });

    return {
      success: true,
      user,
      error: null,
    };
  } catch (error) {
    // Handle user cancellation
    if (error instanceof Error && error.message.includes('canceled')) {
      console.log('[AuthService] Sign-in cancelled by user');
      return {
        success: false,
        user: null,
        error: 'Sign-in was cancelled',
      };
    }

    console.error('[AuthService] Sign-in failed:', error);
    return {
      success: false,
      user: null,
      error: error instanceof Error ? error.message : 'Sign-in failed',
    };
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  console.log('[AuthService] Signing out');

  // Clear AWS credentials
  await getAWSCredentialsService().clearCredentials();

  await clearAppleUserId();
  await clearAppleIdentityToken();
  await clearUserProfile();
}

/**
 * Load stored authentication state
 * Returns the user if valid credentials exist, null otherwise
 * Fetches from DynamoDB if local cache is missing user data
 */
export async function loadStoredAuth(): Promise<AuthUser | null> {
  try {
    const userId = await getStoredAppleUserId();
    if (!userId) {
      return null;
    }

    // Verify credentials are still valid
    const credentialState = await checkCredentialState(userId);
    if (credentialState !== 'authorized') {
      console.log('[AuthService] Stored credentials no longer valid, clearing');
      await signOut();
      return null;
    }

    // Restore AWS credentials - try auth backend first (uses refresh tokens)
    console.log('[AuthService] loadStoredAuth - checking AWS backend:', FEATURE_FLAGS.USE_AWS_BACKEND);
    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      const credentialsService = getAWSCredentialsService();

      // getCredentials will automatically try auth backend refresh, then fall back to other methods
      try {
        console.log('[AuthService] Trying to restore AWS credentials...');
        await credentialsService.getCredentials();
        console.log('[AuthService] AWS credentials restored successfully');
      } catch (credentialsError) {
        console.log('[AuthService] Could not restore AWS credentials:', credentialsError instanceof Error ? credentialsError.message : credentialsError);
        // User will need to sign in again for AWS operations, but can still use app locally
      }
    }

    // Load profile data from local cache
    let profile = await getStoredUserProfile();

    // If displayName is missing, try to fetch from DynamoDB
    if (!profile?.displayName && FEATURE_FLAGS.USE_AWS_BACKEND) {
      console.log('[AuthService] Display name missing, fetching from DynamoDB...');
      try {
        const dbUser = await getUserById(userId);
        if (dbUser) {
          console.log('[AuthService] Found user in DynamoDB:', {
            displayName: dbUser.displayName,
            givenName: dbUser.givenName,
            familyName: dbUser.familyName,
          });

          // Update local cache with DynamoDB data
          const updatedProfile = {
            email: dbUser.email || profile?.email || null,
            displayName: dbUser.displayName || profile?.displayName || null,
            givenName: dbUser.givenName || profile?.givenName || null,
            familyName: dbUser.familyName || profile?.familyName || null,
          };
          await storeUserProfile(updatedProfile);
          profile = updatedProfile;
        }
      } catch (dbError) {
        console.error('[AuthService] Failed to fetch user from DynamoDB:', dbError);
        // Continue with local profile data
      }
    }

    return {
      id: userId,
      email: profile?.email || null,
      displayName: profile?.displayName || null,
      authProvider: 'apple',
    };
  } catch (error) {
    console.error('[AuthService] Failed to load stored auth:', error);
    return null;
  }
}

/**
 * Check the credential state for a user ID
 * Returns: 'authorized', 'revoked', 'not_found', or 'unknown'
 */
export async function checkCredentialState(
  userId: string
): Promise<'authorized' | 'revoked' | 'not_found' | 'unknown'> {
  try {
    const state = await AppleAuthentication.getCredentialStateAsync(userId);

    switch (state) {
      case AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED:
        return 'authorized';
      case AppleAuthentication.AppleAuthenticationCredentialState.REVOKED:
        return 'revoked';
      case AppleAuthentication.AppleAuthenticationCredentialState.NOT_FOUND:
        return 'not_found';
      default:
        return 'unknown';
    }
  } catch (error) {
    console.error('[AuthService] Failed to check credential state:', error);
    return 'unknown';
  }
}

/**
 * Get the stored Apple user ID (for identity resolution)
 */
export async function getStoredUserId(): Promise<string | null> {
  return getStoredAppleUserId();
}
