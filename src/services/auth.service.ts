/**
 * Auth Service
 *
 * Handles Apple Sign-In authentication, credential storage, and session management.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { AUTH_STORAGE_KEYS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
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
    });

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

    // Store credentials
    await storeAppleUserId(credential.user);

    // Store profile (only if we got new data, otherwise keep existing)
    const existingProfile = await getStoredUserProfile();
    const newProfile = {
      email: credential.email || existingProfile?.email || null,
      displayName: displayName || existingProfile?.displayName || null,
    };
    await storeUserProfile(newProfile);

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
  await clearAppleUserId();
  await clearUserProfile();
}

/**
 * Load stored authentication state
 * Returns the user if valid credentials exist, null otherwise
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

    // Load profile data
    const profile = await getStoredUserProfile();

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
