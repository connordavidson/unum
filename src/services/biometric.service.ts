/**
 * Biometric Service
 *
 * Handles Face ID / Touch ID authentication and preference storage.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

// ============ Constants ============

const BIOMETRIC_ENABLED_KEY = 'unum_biometric_enabled';

// ============ Types ============

export type BiometricType = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricStatus {
  isAvailable: boolean;
  biometricType: BiometricType;
  isEnrolled: boolean;
}

export interface AuthenticateResult {
  success: boolean;
  error?: string;
}

// ============ Service Functions ============

/**
 * Check if biometric authentication is available on this device
 */
export async function getBiometricStatus(): Promise<BiometricStatus> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometricType: BiometricType = 'none';
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricType = 'face';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricType = 'fingerprint';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometricType = 'iris';
    }

    return {
      isAvailable: hasHardware && isEnrolled,
      biometricType,
      isEnrolled,
    };
  } catch (error) {
    console.error('[BiometricService] Failed to get biometric status:', error);
    return {
      isAvailable: false,
      biometricType: 'none',
      isEnrolled: false,
    };
  }
}

/**
 * Get user-friendly name for the biometric type
 */
export function getBiometricName(type: BiometricType): string {
  switch (type) {
    case 'face':
      return 'Face ID';
    case 'fingerprint':
      return 'Touch ID';
    case 'iris':
      return 'Iris';
    default:
      return 'Biometric';
  }
}

/**
 * Authenticate using biometrics
 */
export async function authenticate(
  promptMessage?: string
): Promise<AuthenticateResult> {
  try {
    const status = await getBiometricStatus();
    if (!status.isAvailable) {
      return {
        success: false,
        error: 'Biometric authentication is not available',
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || 'Authenticate to continue',
      fallbackLabel: 'Use Passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (result.success) {
      return { success: true };
    }

    // Handle different error cases
    if (result.error === 'user_cancel') {
      return { success: false, error: 'Authentication cancelled' };
    } else if (result.error === 'user_fallback') {
      return { success: false, error: 'User chose passcode' };
    } else if (result.error === 'lockout') {
      return { success: false, error: 'Too many attempts. Try again later.' };
    }

    return { success: false, error: result.error || 'Authentication failed' };
  } catch (error) {
    console.error('[BiometricService] Authentication error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    };
  }
}

/**
 * Check if biometric lock is enabled by user preference
 */
export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return value === 'true';
  } catch (error) {
    console.error('[BiometricService] Failed to get biometric preference:', error);
    return false;
  }
}

/**
 * Set biometric lock preference
 */
export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
    console.log('[BiometricService] Biometric lock set to:', enabled);
  } catch (error) {
    console.error('[BiometricService] Failed to set biometric preference:', error);
    throw error;
  }
}
