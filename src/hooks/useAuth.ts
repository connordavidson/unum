/**
 * useAuth Hook
 *
 * React hook for managing authentication state and actions.
 * Provides Apple Sign-In functionality and tracks auth state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  isAppleSignInAvailable,
  signInWithApple as authServiceSignIn,
  signOut as authServiceSignOut,
  loadStoredAuth,
  getStoredUserId,
} from '../services/auth.service';
import { getAWSCredentialsService } from '../services/aws-credentials.service';
import type { AuthUser } from '../shared/types/auth';

// ============ Types ============

export interface UseAuthResult {
  // State
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
  /** The authenticated user (null if not authenticated) */
  user: AuthUser | null;
  /** Whether auth state is being loaded */
  isLoading: boolean;
  /** Error message if authentication failed */
  error: string | null;

  // Platform info
  /** Whether Apple Sign-In is available on this device */
  isAppleSignInAvailable: boolean;
  /** Whether the user can post (authenticated on iOS) */
  canPost: boolean;

  // Actions
  /** Sign in with Apple */
  signInWithApple: () => Promise<boolean>;
  /** Sign out the current user */
  signOut: () => Promise<void>;
  /** Clear any error state */
  clearError: () => void;
}

// ============ Hook Implementation ============

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);

  // Track if we've initialized
  const isInitialized = useRef(false);

  // Check Apple Sign-In availability and load stored auth on mount
  useEffect(() => {
    const initialize = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;

      try {
        // Check if Apple Sign-In is available
        const available = await isAppleSignInAvailable();
        setAppleSignInAvailable(available);

        // Load stored auth state
        if (available) {
          const storedUser = await loadStoredAuth();
          if (storedUser) {
            setUser(storedUser);
            console.log('[useAuth] Restored auth session for user:', storedUser.id);
          }
        }
      } catch (err) {
        console.error('[useAuth] Initialization failed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, []);

  // Listen for credential revocation
  useEffect(() => {
    if (!appleSignInAvailable) return;

    const subscription = AppleAuthentication.addRevokeListener(async () => {
      console.log('[useAuth] Credentials revoked');
      setUser(null);
      setError('Your sign-in was revoked. Please sign in again.');
    });

    return () => {
      subscription.remove();
    };
  }, [appleSignInAvailable]);

  // Proactively refresh AWS credentials when app comes to foreground
  useEffect(() => {
    if (!user) return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const credService = getAWSCredentialsService();
        if (credService.hasAuthenticatedCredentials && !credService.hasValidCredentials()) {
          try {
            await credService.getCredentials();
          } catch {
            // Non-fatal — on-demand refresh will handle it when user tries to post
          }
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [user]);

  // Sign in with Apple
  const signInWithApple = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await authServiceSignIn();

      if (result.success && result.user) {
        setUser(result.user);
        setIsLoading(false);
        return true;
      } else {
        setError(result.error);
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      setError(message);
      setIsLoading(false);
      return false;
    }
  }, []);

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    try {
      await authServiceSignOut();
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('[useAuth] Sign-out failed:', err);
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    isAuthenticated: user !== null,
    user,
    isLoading,
    error,

    // Platform info
    isAppleSignInAvailable: appleSignInAvailable,
    canPost: user !== null && appleSignInAvailable,

    // Actions
    signInWithApple,
    signOut,
    clearError,
  };
}
