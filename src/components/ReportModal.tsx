/**
 * ReportModal Component
 *
 * Allows users to report inappropriate content.
 * Shows reason picker and optional details input.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../shared/constants';

export type ReportReason = 'inappropriate' | 'spam' | 'harassment' | 'other';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason, details?: string) => Promise<void>;
  onBlockUser?: () => Promise<void>;
  uploadId: string;
}

const REPORT_REASONS: { value: ReportReason; label: string; icon: string }[] = [
  { value: 'inappropriate', label: 'Inappropriate Content', icon: 'warning-outline' },
  { value: 'spam', label: 'Spam', icon: 'megaphone-outline' },
  { value: 'harassment', label: 'Harassment', icon: 'alert-circle-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export function ReportModal({
  visible,
  onClose,
  onSubmit,
  onBlockUser,
  uploadId,
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) return;

    setSubmitting(true);
    try {
      await onSubmit(selectedReason, details.trim() || undefined);
      Alert.alert('Report Submitted', 'Thank you for helping keep Unum safe.');
      handleClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlockUser = async () => {
    if (!onBlockUser) return;

    Alert.alert(
      'Block User',
      'You will no longer see posts from this user. You can unblock them later in your profile settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await onBlockUser();
              Alert.alert('User Blocked', 'You will no longer see their posts.');
              handleClose();
            } catch {
              Alert.alert('Error', 'Failed to block user. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    setSelectedReason(null);
    setDetails('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Report Post</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={COLORS.TEXT_PRIMARY} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>Why are you reporting this post?</Text>

          {REPORT_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason.value}
              style={[
                styles.reasonButton,
                selectedReason === reason.value && styles.reasonButtonSelected,
              ]}
              onPress={() => setSelectedReason(reason.value)}
            >
              <Ionicons
                name={reason.icon as any}
                size={20}
                color={selectedReason === reason.value ? COLORS.PRIMARY : COLORS.TEXT_SECONDARY}
              />
              <Text
                style={[
                  styles.reasonText,
                  selectedReason === reason.value && styles.reasonTextSelected,
                ]}
              >
                {reason.label}
              </Text>
              {selectedReason === reason.value && (
                <Ionicons name="checkmark" size={20} color={COLORS.PRIMARY} />
              )}
            </TouchableOpacity>
          ))}

          {selectedReason && (
            <TextInput
              style={styles.detailsInput}
              placeholder="Additional details (optional)"
              placeholderTextColor={COLORS.TEXT_TERTIARY}
              value={details}
              onChangeText={setDetails}
              multiline
              maxLength={500}
            />
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.submitButton, !selectedReason && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!selectedReason || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitText}>Submit Report</Text>
              )}
            </TouchableOpacity>

            {onBlockUser && (
              <TouchableOpacity
                style={styles.blockButton}
                onPress={handleBlockUser}
              >
                <Ionicons name="ban-outline" size={16} color={COLORS.DANGER} />
                <Text style={styles.blockText}>Block User</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.BACKGROUND,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 16,
  },
  reasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    gap: 12,
  },
  reasonButtonSelected: {
    backgroundColor: `${COLORS.PRIMARY}15`,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
  },
  reasonText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.TEXT_PRIMARY,
  },
  reasonTextSelected: {
    fontWeight: '500',
    color: COLORS.PRIMARY,
  },
  detailsInput: {
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: COLORS.TEXT_PRIMARY,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 4,
    marginBottom: 16,
  },
  actions: {
    marginTop: 8,
    gap: 12,
  },
  submitButton: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  blockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 8,
  },
  blockText: {
    color: COLORS.DANGER,
    fontSize: 14,
    fontWeight: '500',
  },
});
