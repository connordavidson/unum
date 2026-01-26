/**
 * Auth Context
 *
 * React context provider for authentication state.
 * Wraps the app and provides auth state to all children.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth, UseAuthResult } from '../hooks/useAuth';

// ============ Types ============

export interface AuthContextValue {
  /** Full auth hook result */
  auth: UseAuthResult;
  /** Resolved user ID (Apple ID if authenticated, null otherwise) */
  userId: string | null;
}

// ============ Context ============

const AuthContext = createContext<AuthContextValue | null>(null);

// ============ Provider ============

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const auth = useAuth();

  const value: AuthContextValue = {
    auth,
    userId: auth.user?.id || null,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============ Hooks ============

/**
 * Access the auth context
 * @throws Error if used outside of AuthProvider
 */
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

/**
 * Check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
  const { auth } = useAuthContext();
  return auth.isAuthenticated;
}

/**
 * Get the authenticated user's ID (or null)
 */
export function useAuthUserId(): string | null {
  const { userId } = useAuthContext();
  return userId;
}

/**
 * Check if user can post content
 */
export function useCanPost(): boolean {
  const { auth } = useAuthContext();
  return auth.canPost;
}
