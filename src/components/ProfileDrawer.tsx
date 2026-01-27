/**
 * Profile Drawer Component
 *
 * Slides in from the left to show user info and sign out option.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  Alert,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../shared/constants';
import type { AuthUser } from '../shared/types/auth';
import {
  getBiometricStatus,
  getBiometricName,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
  authenticate,
  BiometricType,
} from '../services/biometric.service';

const DRAWER_WIDTH = Dimensions.get('window').width * 0.75;

interface ProfileDrawerProps {
  visible: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onSignOut: () => void;
}

export function ProfileDrawer({
  visible,
  onClose,
  user,
  onSignOut,
}: ProfileDrawerProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>('none');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isTogglingBiometric, setIsTogglingBiometric] = useState(false);

  // Load biometric status when drawer opens
  useEffect(() => {
    if (visible) {
      loadBiometricStatus();
    }
  }, [visible]);

  const loadBiometricStatus = async () => {
    const status = await getBiometricStatus();
    setBiometricAvailable(status.isAvailable);
    setBiometricType(status.biometricType);

    const enabled = await isBiometricLockEnabled();
    setBiometricEnabled(enabled);
  };

  const handleBiometricToggle = useCallback(async (value: boolean) => {
    if (isTogglingBiometric) return;

    setIsTogglingBiometric(true);

    try {
      if (value) {
        // Require authentication to enable
        const result = await authenticate(`Enable ${getBiometricName(biometricType)}`);
        if (result.success) {
          await setBiometricLockEnabled(true);
          setBiometricEnabled(true);
        } else if (result.error && result.error !== 'Authentication cancelled') {
          Alert.alert('Error', result.error);
        }
      } else {
        // Require authentication to disable
        const result = await authenticate(`Disable ${getBiometricName(biometricType)}`);
        if (result.success) {
          await setBiometricLockEnabled(false);
          setBiometricEnabled(false);
        } else if (result.error && result.error !== 'Authentication cancelled') {
          Alert.alert('Error', result.error);
        }
      }
    } catch (error) {
      console.error('[ProfileDrawer] Failed to toggle biometric:', error);
      Alert.alert('Error', 'Failed to update setting');
    } finally {
      setIsTogglingBiometric(false);
    }
  }, [biometricType, isTogglingBiometric]);

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            onSignOut();
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX: slideAnim }],
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={COLORS.BACKGROUND} />
          </View>
          <Text style={styles.displayName}>
            {user?.displayName || 'Unum User'}
          </Text>
          {user?.email && (
            <Text style={styles.email}>{user.email}</Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Menu Items */}
        <View style={styles.menu}>
          {/* Biometric Lock Toggle */}
          {biometricAvailable && (
            <View style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Ionicons
                  name={biometricType === 'face' ? 'scan-outline' : 'finger-print-outline'}
                  size={24}
                  color={COLORS.TEXT_PRIMARY}
                />
                <Text style={styles.menuItemText}>
                  Require {getBiometricName(biometricType)}
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleBiometricToggle}
                disabled={isTogglingBiometric}
                trackColor={{ false: COLORS.BORDER, true: COLORS.PRIMARY }}
                thumbColor={COLORS.BACKGROUND}
                ios_backgroundColor={COLORS.BORDER}
              />
            </View>
          )}
        </View>

        {/* Sign Out Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
            <Ionicons name="log-out-outline" size={22} color={COLORS.DANGER} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: COLORS.BACKGROUND,
    ...SHADOWS.LARGE,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    textAlign: 'center',
  },
  email: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.BORDER,
    marginHorizontal: 24,
  },
  menu: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
  },
  footer: {
    paddingHorizontal: 24,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 16,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    color: COLORS.DANGER,
    fontWeight: '500',
  },
});
