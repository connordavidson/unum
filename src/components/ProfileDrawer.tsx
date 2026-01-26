/**
 * Profile Drawer Component
 *
 * Slides in from the left to show user info and sign out option.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../shared/constants';
import type { AuthUser } from '../shared/types/auth';

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
          {/* Future menu items can go here */}
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
