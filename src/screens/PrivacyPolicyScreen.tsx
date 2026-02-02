/**
 * Privacy Policy Screen
 *
 * Displays the app's privacy policy. Presented as a modal.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../shared/constants';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type PrivacyPolicyScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PrivacyPolicy'>;
};

export function PrivacyPolicyScreen({
  navigation,
}: PrivacyPolicyScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={24} color={COLORS.TEXT_PRIMARY} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <Text style={styles.lastUpdated}>Last updated: January 31, 2025</Text>

        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.body}>
          When you use Unum, we collect the following information:{'\n\n'}
          <Text style={styles.bold}>Account Information:</Text> When you sign in with Apple, we receive your Apple ID identifier and, if you choose to share it, your email address. We use this solely to identify your account.{'\n\n'}
          <Text style={styles.bold}>Location Data:</Text> When you create a post, we collect the GPS coordinates from your device to place the content on the map. Location is only collected at the moment of posting.{'\n\n'}
          <Text style={styles.bold}>Photos and Videos:</Text> Content you upload is stored on our servers (Amazon Web Services) and displayed publicly on the map.{'\n\n'}
          <Text style={styles.bold}>Device Information:</Text> We collect basic device and crash data through Firebase Crashlytics to improve app stability. This includes device model, OS version, and crash logs.
        </Text>

        <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
        <Text style={styles.body}>
          We use your information to:{'\n\n'}
          • Display your posts on the map for other users to see{'\n'}
          • Identify your account so you can manage your posts and votes{'\n'}
          • Moderate content to ensure community safety{'\n'}
          • Diagnose and fix app crashes and bugs{'\n'}
          • Enforce our Terms of Service
        </Text>

        <Text style={styles.sectionTitle}>3. Content Moderation</Text>
        <Text style={styles.body}>
          All uploaded content is automatically screened using AWS Rekognition for inappropriate material, including explicit, violent, or otherwise objectionable content. Content that violates our guidelines is rejected before it is posted. Users may also report content, and posts that receive multiple reports are automatically hidden for review.
        </Text>

        <Text style={styles.sectionTitle}>4. Data Storage and Security</Text>
        <Text style={styles.body}>
          Your data is stored securely on Amazon Web Services (AWS) infrastructure, including:{'\n\n'}
          • DynamoDB for account and post data{'\n'}
          • S3 for media files (photos and videos){'\n'}
          • Cognito for authentication{'\n\n'}
          We use industry-standard encryption in transit (TLS) and at rest. Authentication tokens are stored in your device's secure keychain.
        </Text>

        <Text style={styles.sectionTitle}>5. Third-Party Services</Text>
        <Text style={styles.body}>
          We use the following third-party services:{'\n\n'}
          • <Text style={styles.bold}>Apple Sign-In</Text> — Authentication{'\n'}
          • <Text style={styles.bold}>Amazon Web Services</Text> — Data storage, content moderation{'\n'}
          • <Text style={styles.bold}>Google Maps</Text> — Map display{'\n'}
          • <Text style={styles.bold}>Firebase Crashlytics</Text> — Crash reporting and analytics{'\n\n'}
          These services have their own privacy policies governing their use of your data.
        </Text>

        <Text style={styles.sectionTitle}>6. Data Sharing</Text>
        <Text style={styles.body}>
          We do not sell your personal information. Your posts (photos, videos, and their locations) are visible to all users of the app. We may share data with law enforcement if required by law.
        </Text>

        <Text style={styles.sectionTitle}>7. Data Retention and Deletion</Text>
        <Text style={styles.body}>
          You can delete your account at any time from the profile menu. When you delete your account, we permanently delete:{'\n\n'}
          • All your posts and associated media{'\n'}
          • Your votes and reports{'\n'}
          • Your account profile{'\n'}
          • All locally stored data{'\n\n'}
          This action is irreversible.
        </Text>

        <Text style={styles.sectionTitle}>8. Children's Privacy</Text>
        <Text style={styles.body}>
          Unum is not intended for children under 17. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us so we can delete it.
        </Text>

        <Text style={styles.sectionTitle}>9. Your Rights</Text>
        <Text style={styles.body}>
          You have the right to:{'\n\n'}
          • Access your data (visible through the app){'\n'}
          • Delete your data (via account deletion){'\n'}
          • Block other users{'\n'}
          • Report inappropriate content
        </Text>

        <Text style={styles.sectionTitle}>10. Changes to This Policy</Text>
        <Text style={styles.body}>
          We may update this Privacy Policy from time to time. We will notify users of significant changes through the app. Continued use of Unum after changes constitutes acceptance of the updated policy.
        </Text>

        <Text style={styles.sectionTitle}>11. Contact Us</Text>
        <Text style={styles.body}>
          If you have questions about this Privacy Policy or your data, please contact us at:{'\n\n'}
          support@unumapp.com
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  lastUpdated: {
    fontSize: 13,
    color: COLORS.TEXT_TERTIARY,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginTop: 24,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
  },
});
