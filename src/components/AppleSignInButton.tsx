/**
 * Apple Sign-In Button Component
 *
 * Wrapper around the native Apple Sign-In button with consistent styling.
 */

import React from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Platform,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { COLORS } from '../shared/constants';

// ============ Types ============

export interface AppleSignInButtonProps {
  /** Called when sign-in is initiated */
  onPress: () => void;
  /** Whether the button is in loading state */
  isLoading?: boolean;
  /** Button style: 'white', 'black', or 'whiteOutline' */
  buttonStyle?: 'white' | 'black' | 'whiteOutline';
}

// ============ Component ============

export function AppleSignInButton({
  onPress,
  isLoading = false,
  buttonStyle = 'black',
}: AppleSignInButtonProps): React.ReactElement | null {
  // Only show on iOS
  if (Platform.OS !== 'ios') {
    return (
      <View style={styles.unavailableContainer}>
        <Text style={styles.unavailableText}>
          Apple Sign-In is only available on iOS devices
        </Text>
      </View>
    );
  }

  // Map button style to Apple's enum
  const appleButtonStyle =
    buttonStyle === 'white'
      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
      : buttonStyle === 'whiteOutline'
      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE
      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, styles.button]}>
        <ActivityIndicator color={COLORS.TEXT_PRIMARY} />
      </View>
    );
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={appleButtonStyle}
      cornerRadius={12}
      style={styles.button}
      onPress={onPress}
    />
  );
}

// ============ Styles ============

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 50,
  },
  loadingContainer: {
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unavailableContainer: {
    padding: 16,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    borderRadius: 12,
  },
  unavailableText: {
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    fontSize: 14,
  },
});
