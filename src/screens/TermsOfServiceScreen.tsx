/**
 * Terms of Service Screen
 *
 * Displays the app's Terms of Service / EULA. Presented as a modal.
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

type TermsOfServiceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TermsOfService'>;
};

export function TermsOfServiceScreen({
  navigation,
}: TermsOfServiceScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Terms of Service</Text>
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

        <Text style={styles.body}>
          By using Unum, you agree to these Terms of Service and our End User License Agreement (EULA). If you do not agree, do not use the app.
        </Text>

        <Text style={styles.sectionTitle}>1. Acceptable Use</Text>
        <Text style={styles.body}>
          Unum allows you to share photos and videos tied to real-world locations. You agree to use Unum only for lawful purposes and in accordance with these terms. You are responsible for all content you post.
        </Text>

        <Text style={styles.sectionTitle}>2. Prohibited Content</Text>
        <Text style={styles.body}>
          You may not upload or share content that:{'\n\n'}
          • Contains nudity, sexually explicit material, or pornography{'\n'}
          • Depicts graphic violence or gore{'\n'}
          • Promotes harassment, bullying, or hate speech{'\n'}
          • Contains threats or incitement to violence{'\n'}
          • Infringes on intellectual property rights{'\n'}
          • Contains spam, advertisements, or solicitations{'\n'}
          • Depicts illegal activities{'\n'}
          • Targets or exploits minors{'\n\n'}
          Content is automatically screened and may be rejected. Users can also report violations, and content with multiple reports will be removed.
        </Text>

        <Text style={styles.sectionTitle}>3. Account and Authentication</Text>
        <Text style={styles.body}>
          You must sign in with Apple to create content. You are responsible for maintaining the security of your account. You must not share your account or use another person's account.
        </Text>

        <Text style={styles.sectionTitle}>4. Content Ownership and License</Text>
        <Text style={styles.body}>
          You retain ownership of content you upload. By posting content on Unum, you grant us a non-exclusive, worldwide, royalty-free license to display, distribute, and store your content within the app. This license ends when you delete your content or account.
        </Text>

        <Text style={styles.sectionTitle}>5. Content Moderation</Text>
        <Text style={styles.body}>
          We use automated systems (AWS Rekognition) and user reports to moderate content. We reserve the right to remove any content that violates these terms without notice. Content that receives multiple reports may be automatically hidden.
        </Text>

        <Text style={styles.sectionTitle}>6. User Conduct</Text>
        <Text style={styles.body}>
          You agree not to:{'\n\n'}
          • Abuse the reporting system by filing false reports{'\n'}
          • Attempt to circumvent content moderation{'\n'}
          • Interfere with or disrupt the app's operation{'\n'}
          • Collect or harvest data from the app or its users{'\n'}
          • Impersonate another person or entity
        </Text>

        <Text style={styles.sectionTitle}>7. Account Termination</Text>
        <Text style={styles.body}>
          We may suspend or terminate your account if you violate these terms. You may delete your account at any time from the profile menu. Account deletion permanently removes all your data, posts, and votes.
        </Text>

        <Text style={styles.sectionTitle}>8. End User License Agreement (EULA)</Text>
        <Text style={styles.body}>
          This app is licensed, not sold, to you. Your use is subject to Apple's standard EULA terms, available at:{'\n\n'}
          https://www.apple.com/legal/internet-services/itunes/dev/stdeula/{'\n\n'}
          In addition:{'\n\n'}
          • The app is provided "as is" without warranty{'\n'}
          • We are not liable for user-generated content{'\n'}
          • We reserve the right to modify or discontinue the app at any time{'\n'}
          • You may not reverse engineer, decompile, or disassemble the app
        </Text>

        <Text style={styles.sectionTitle}>9. Privacy</Text>
        <Text style={styles.body}>
          Your use of Unum is also governed by our Privacy Policy, which describes how we collect, use, and protect your data.
        </Text>

        <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
        <Text style={styles.body}>
          To the maximum extent permitted by law, Unum and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the app. We are not responsible for content posted by other users.
        </Text>

        <Text style={styles.sectionTitle}>11. Changes to These Terms</Text>
        <Text style={styles.body}>
          We may update these Terms of Service from time to time. Continued use of the app after changes constitutes acceptance of the updated terms.
        </Text>

        <Text style={styles.sectionTitle}>12. Contact Us</Text>
        <Text style={styles.body}>
          If you have questions about these Terms of Service, please contact us at:{'\n\n'}
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
});
