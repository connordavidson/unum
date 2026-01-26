/**
 * useUserIdentity Hook
 *
 * Unified identity hook that returns Apple userId when authenticated,
 * or falls back to deviceId for anonymous users.
 *
 * This hook bridges the auth system with the existing upload/service infrastructure.
 */

import { useRef, useEffect } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { useDeviceIdentity } from './useDeviceIdentity';
import type { AuthProvider } from '../shared/types/auth';

// ============ Types ============

export interface UseUserIdentityResult {
  /** User ID: Apple ID if authenticated, deviceId if anonymous */
  userId: string | null;
  /** Ref to userId for use in async callbacks (avoids stale closures) */
  userIdRef: React.MutableRefObject<string | null>;
  /** Device ID (always available, used for device-level tracking) */
  deviceId: string | null;
  /** Ref to deviceId for use in async callbacks */
  deviceIdRef: React.MutableRefObject<string | null>;
  /** Whether identity is ready for use */
  isReady: boolean;
  /** Whether identity is being loaded */
  isLoading: boolean;
  /** The authentication provider: 'apple' or 'device' */
  authProvider: AuthProvider | null;
}

// ============ Hook Implementation ============

export function useUserIdentity(): UseUserIdentityResult {
  // Get auth state
  const { auth, userId: appleUserId } = useAuthContext();

  // Get device identity as fallback
  const {
    deviceId,
    deviceIdRef,
    isReady: deviceIdReady,
    isLoading: deviceIdLoading,
  } = useDeviceIdentity();

  // Determine the resolved user ID
  // Priority: Apple ID (if authenticated) > Device ID (anonymous)
  const resolvedUserId = auth.isAuthenticated ? appleUserId : deviceId;

  // Determine auth provider
  const authProvider: AuthProvider | null = auth.isAuthenticated
    ? 'apple'
    : deviceId
    ? 'anonymous'
    : null;

  // Maintain a ref for async callbacks
  const userIdRef = useRef<string | null>(resolvedUserId);

  // Keep ref in sync with resolved userId
  useEffect(() => {
    userIdRef.current = resolvedUserId;
  }, [resolvedUserId]);

  // Determine ready state
  // Ready when: auth is not loading AND either authenticated OR deviceId is ready
  const isReady =
    !auth.isLoading && (auth.isAuthenticated || deviceIdReady);

  // Determine loading state
  const isLoading = auth.isLoading || (!auth.isAuthenticated && deviceIdLoading);

  return {
    userId: resolvedUserId,
    userIdRef,
    deviceId,
    deviceIdRef,
    isReady,
    isLoading,
    authProvider,
  };
}
