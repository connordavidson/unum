/**
 * Sign-In Screen
 *
 * Modal screen displayed when unauthenticated users try to post content.
 * Provides Apple Sign-In or the option to cancel.
 */

import React, { useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthContext } from "../contexts/AuthContext";
import { useAnalytics } from "../hooks/useAnalytics";
import { AppleSignInButton } from "../components/AppleSignInButton";
import { COLORS, SHADOWS } from "../shared/constants";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

// ============ Types ============

type SignInScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "SignIn">;
};

// ============ Component ============

export function SignInScreen({
  navigation,
}: SignInScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { auth } = useAuthContext();
  const { trackScreen, trackLogin } = useAnalytics();

  // Track screen view on mount
  useEffect(() => {
    trackScreen('SignIn');
  }, [trackScreen]);

  const handleSignIn = useCallback(async () => {
    const success = await auth.signInWithApple();
    if (success) {
      // Track successful login
      trackLogin();
      // Close modal and return to map
      navigation.goBack();
    }
  }, [auth, navigation, trackLogin]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Content */}
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="camera" size={64} color={COLORS.PRIMARY} />
        </View>

        {/* Title and description */}
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.description}>
          Sign in with your Apple ID to share photos and videos on the map. Your
          posts will be visible to everyone.
        </Text>

        {/* Error message */}
        {auth.error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{auth.error}</Text>
          </View>
        )}

        {/* Apple Sign-In Button */}
        <View style={styles.buttonContainer}>
          <AppleSignInButton
            onPress={handleSignIn}
            isLoading={auth.isLoading}
            buttonStyle="black"
          />
        </View>

        {/* Privacy note */}
        <Text style={styles.privacyNote}>
          We only use your Apple ID to identify your posts.{"\n"}
          Your email is never shared publicly.
        </Text>

        {/* Legal links */}
        <Text style={styles.legalNote}>
          By signing in, you agree to our{" "}
          <Text
            style={styles.legalLink}
            onPress={() => navigation.navigate("TermsOfService")}
          >
            Terms of Service
          </Text>
          {" "}and{" "}
          <Text
            style={styles.legalLink}
            onPress={() => navigation.navigate("PrivacyPolicy")}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>

      {/* Cancel button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleClose}
          disabled={auth.isLoading}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ============ Styles ============

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  errorContainer: {
    backgroundColor: "#ffebee",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: "100%",
  },
  errorText: {
    color: COLORS.DANGER,
    fontSize: 14,
    textAlign: "center",
  },
  buttonContainer: {
    width: "100%",
    marginBottom: 24,
  },
  privacyNote: {
    fontSize: 12,
    color: COLORS.TEXT_TERTIARY,
    textAlign: "center",
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 32,
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },
  legalNote: {
    fontSize: 12,
    color: COLORS.TEXT_TERTIARY,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 16,
  },
  legalLink: {
    color: COLORS.PRIMARY,
    textDecorationLine: "underline",
  },
});
