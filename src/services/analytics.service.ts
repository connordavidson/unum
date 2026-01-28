/**
 * Analytics Service
 *
 * Firebase Analytics wrapper for tracking user events.
 * Provides type-safe event tracking with privacy controls.
 */

import analytics from '@react-native-firebase/analytics';

// ============ Types ============

export type AnalyticsEventName =
  // App lifecycle
  | 'app_open'
  | 'app_backgrounded'
  // Media capture
  | 'photo_capture'
  | 'video_record'
  // Upload flow
  | 'upload_start'
  | 'upload_complete'
  | 'upload_fail'
  // Voting
  | 'vote_cast'
  | 'vote_remove'
  // Map interactions
  | 'marker_tap'
  | 'feed_scroll'
  | 'feed_refresh';

export interface UploadEventParams {
  media_type: 'photo' | 'video';
  has_caption?: boolean;
}

export interface VoteEventParams {
  vote_type: 'up' | 'down';
}

// ============ Service Implementation ============

/**
 * Analytics Service
 *
 * Singleton service for Firebase Analytics tracking.
 * Events are automatically batched and sent when the app has connectivity.
 */
class AnalyticsService {
  private userId: string | null = null;
  private isEnabled: boolean = true;

  /**
   * Set the current user ID for analytics
   * Call when user signs in or out
   */
  async setUserId(userId: string | null): Promise<void> {
    this.userId = userId;
    try {
      await analytics().setUserId(userId);
      console.log('[Analytics] User ID set:', userId ? userId.substring(0, 8) + '...' : 'null');
    } catch (error) {
      console.error('[Analytics] Failed to set user ID:', error);
    }
  }

  /**
   * Set a user property
   */
  async setUserProperty(name: string, value: string | null): Promise<void> {
    try {
      await analytics().setUserProperty(name, value);
    } catch (error) {
      console.error('[Analytics] Failed to set user property:', error);
    }
  }

  /**
   * Track a screen view
   */
  async trackScreen(screenName: string): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await analytics().logScreenView({
        screen_name: screenName,
        screen_class: screenName,
      });
      console.log('[Analytics] Screen view:', screenName);
    } catch (error) {
      console.error('[Analytics] Failed to track screen:', error);
    }
  }

  /**
   * Track a custom event
   */
  async track(eventName: AnalyticsEventName, params?: Record<string, unknown>): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await analytics().logEvent(eventName, params);
      console.log('[Analytics] Event:', eventName, params || '');
    } catch (error) {
      console.error('[Analytics] Failed to track event:', error);
    }
  }

  /**
   * Track user login
   */
  async trackLogin(method: string = 'apple'): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await analytics().logLogin({ method });
      console.log('[Analytics] Login:', method);
    } catch (error) {
      console.error('[Analytics] Failed to track login:', error);
    }
  }

  /**
   * Track user sign up
   */
  async trackSignUp(method: string = 'apple'): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await analytics().logSignUp({ method });
      console.log('[Analytics] Sign up:', method);
    } catch (error) {
      console.error('[Analytics] Failed to track sign up:', error);
    }
  }

  /**
   * Track a search event
   * Note: We don't log the actual search term for privacy
   */
  async trackSearch(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await analytics().logSearch({ search_term: 'location_search' });
      console.log('[Analytics] Search');
    } catch (error) {
      console.error('[Analytics] Failed to track search:', error);
    }
  }

  /**
   * Track upload events
   */
  async trackUpload(
    action: 'start' | 'complete' | 'fail',
    params: UploadEventParams
  ): Promise<void> {
    const eventName = `upload_${action}` as AnalyticsEventName;
    await this.track(eventName, params);
  }

  /**
   * Track vote events
   */
  async trackVote(action: 'cast' | 'remove', params: VoteEventParams): Promise<void> {
    const eventName = `vote_${action}` as AnalyticsEventName;
    await this.track(eventName, params);
  }

  /**
   * Enable or disable analytics collection
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.isEnabled = enabled;
    try {
      await analytics().setAnalyticsCollectionEnabled(enabled);
      console.log('[Analytics] Collection enabled:', enabled);
    } catch (error) {
      console.error('[Analytics] Failed to set collection enabled:', error);
    }
  }
}

// ============ Singleton Factory ============

let instance: AnalyticsService | null = null;

export function getAnalyticsService(): AnalyticsService {
  if (!instance) {
    instance = new AnalyticsService();
  }
  return instance;
}

export function resetAnalyticsService(): void {
  instance = null;
}
