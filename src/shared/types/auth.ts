/**
 * Auth Types
 *
 * Type definitions for Apple Sign-In authentication.
 */

export type AuthProvider = 'apple' | 'anonymous';

export interface AuthUser {
  /** Apple user ID (stable identifier across sessions) */
  id: string;
  /** User's email (may be relay email or null if hidden) */
  email: string | null;
  /** User's display name from Apple */
  displayName: string | null;
  /** The authentication provider used */
  authProvider: AuthProvider;
}

export interface AuthState {
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
  /** The authenticated user (null if not authenticated) */
  user: AuthUser | null;
  /** Whether auth state is being loaded */
  isLoading: boolean;
  /** Error message if authentication failed */
  error: string | null;
}

export interface StoredAuthData {
  /** Apple user ID */
  userId: string;
  /** User profile data */
  profile: {
    email: string | null;
    displayName: string | null;
  };
}
