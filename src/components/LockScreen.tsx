/**
 * Lock Screen Component
 *
 * Full-screen overlay that requires biometric authentication to dismiss.
 */

import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../shared/constants';
import {
  authenticate,
  getBiometricStatus,
  getBiometricName,
  BiometricType,
} from '../services/biometric.service';

interface LockScreenProps {
  visible: boolean;
  onUnlock: () => void;
}

export function LockScreen({
  visible,
  onUnlock,
}: LockScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [biometricType, setBiometricType] = React.useState<BiometricType>('face');
  const [error, setError] = React.useState<string | null>(null);

  // Get biometric type on mount
  useEffect(() => {
    getBiometricStatus().then((status) => {
      setBiometricType(status.biometricType);
    });
  }, []);

  // Auto-trigger authentication when lock screen becomes visible
  useEffect(() => {
    if (visible) {
      handleAuthenticate();
    }
  }, [visible]);

  const handleAuthenticate = useCallback(async () => {
    setError(null);
    const result = await authenticate('Unlock Unum');

    if (result.success) {
      onUnlock();
    } else if (result.error && result.error !== 'Authentication cancelled') {
      setError(result.error);
    }
  }, [onUnlock]);

  const getIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (biometricType) {
      case 'face':
        return 'scan-outline';
      case 'fingerprint':
        return 'finger-print-outline';
      default:
        return 'lock-closed-outline';
    }
  };

  if (!visible) {
    return <></>;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* App Icon/Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="location" size={48} color={COLORS.PRIMARY} />
          </View>
          <Text style={styles.appName}>Unum</Text>
        </View>

        {/* Lock Message */}
        <View style={styles.messageContainer}>
          <Ionicons
            name={getIcon()}
            size={64}
            color={COLORS.TEXT_SECONDARY}
          />
          <Text style={styles.lockMessage}>
            {getBiometricName(biometricType)} is required to unlock
          </Text>
          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}
        </View>

        {/* Unlock Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.unlockButton}
            onPress={handleAuthenticate}
            activeOpacity={0.8}
            accessibilityLabel={`Unlock with ${getBiometricName(biometricType)}`}
            accessibilityRole="button"
          >
            <Ionicons
              name={getIcon()}
              size={24}
              color={COLORS.BACKGROUND}
            />
            <Text style={styles.unlockButtonText}>
              Unlock with {getBiometricName(biometricType)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.TEXT_PRIMARY,
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockMessage: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.DANGER,
    textAlign: 'center',
    marginTop: 12,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    width: '100%',
    paddingBottom: 32,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
  },
  unlockButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.BACKGROUND,
  },
});
