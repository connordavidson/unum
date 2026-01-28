/**
 * useAnalytics Hook
 *
 * React hook for Firebase Analytics tracking in components.
 * Automatically tracks user identity and app state changes.
 */

import { useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  getAnalyticsService,
  AnalyticsEventName,
  UploadEventParams,
  VoteEventParams,
} from '../services/analytics.service';
import { useAuthContext } from '../contexts/AuthContext';

// ============ Types ============

export interface UseAnalyticsResult {
  /** Track a screen view */
  trackScreen: (screenName: string) => void;
  /** Track user login */
  trackLogin: () => void;
  /** Track user sign up */
  trackSignUp: () => void;
  /** Track a search event */
  trackSearch: () => void;
  /** Track upload events */
  trackUpload: (action: 'start' | 'complete' | 'fail', params: UploadEventParams) => void;
  /** Track vote events */
  trackVote: (action: 'cast' | 'remove', params: VoteEventParams) => void;
  /** Track a custom event */
  track: (eventName: AnalyticsEventName, params?: Record<string, unknown>) => void;
  /** Enable or disable analytics */
  setEnabled: (enabled: boolean) => void;
}

// ============ Hook Implementation ============

export function useAnalytics(): UseAnalyticsResult {
  const analytics = getAnalyticsService();
  const { auth, userId } = useAuthContext();
  const previousAppState = useRef<AppStateStatus>(AppState.currentState);
  const hasTrackedSession = useRef(false);

  // Set user ID when auth state changes
  useEffect(() => {
    if (auth.isAuthenticated && userId) {
      analytics.setUserId(userId);
    } else {
      analytics.setUserId(null);
    }
  }, [auth.isAuthenticated, userId]);

  // Track app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        previousAppState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        analytics.track('app_open');
      } else if (
        previousAppState.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        analytics.track('app_backgrounded');
      }
      previousAppState.current = nextAppState;
    });

    // Track initial app open (once per session)
    if (!hasTrackedSession.current) {
      analytics.track('app_open');
      hasTrackedSession.current = true;
    }

    return () => {
      subscription.remove();
    };
  }, []);

  // Memoized tracking functions
  const trackScreen = useCallback(
    (screenName: string) => {
      analytics.trackScreen(screenName);
    },
    []
  );

  const trackLogin = useCallback(() => {
    analytics.trackLogin('apple');
  }, []);

  const trackSignUp = useCallback(() => {
    analytics.trackSignUp('apple');
  }, []);

  const trackSearch = useCallback(() => {
    analytics.trackSearch();
  }, []);

  const trackUpload = useCallback(
    (action: 'start' | 'complete' | 'fail', params: UploadEventParams) => {
      analytics.trackUpload(action, params);
    },
    []
  );

  const trackVote = useCallback(
    (action: 'cast' | 'remove', params: VoteEventParams) => {
      analytics.trackVote(action, params);
    },
    []
  );

  const track = useCallback(
    (eventName: AnalyticsEventName, params?: Record<string, unknown>) => {
      analytics.track(eventName, params);
    },
    []
  );

  const setEnabled = useCallback((enabled: boolean) => {
    analytics.setEnabled(enabled);
  }, []);

  return {
    trackScreen,
    trackLogin,
    trackSignUp,
    trackSearch,
    trackUpload,
    trackVote,
    track,
    setEnabled,
  };
}
