/**
 * MarkerCallout Component
 *
 * Displays upload details in a map marker callout.
 * Shows media preview, voting buttons, and timestamp.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MediaDisplay } from './MediaDisplay';
import { VoteButtons } from './VoteButtons';
import { formatTimestamp } from '../shared/utils';
import { COLORS, SHADOWS } from '../shared/constants';
import type { Upload, VoteType } from '../shared/types';

interface MarkerCalloutProps {
  upload: Upload;
  userVote?: VoteType;
  onVote: (uploadId: string, voteType: VoteType) => void;
  onDownload: (uploadId: string) => void;
}

export function MarkerCallout({
  upload,
  userVote,
  onVote,
  onDownload,
}: MarkerCalloutProps) {
  return (
    <View style={styles.container}>
      <MediaDisplay upload={upload} style={styles.media} />
      <View style={styles.actions}>
        <VoteButtons
          uploadId={upload.id}
          votes={upload.votes}
          coordinates={upload.coordinates}
          userVote={userVote}
          onVote={onVote}
          onDownload={onDownload}
          size="large"
        />
      </View>
      <View style={styles.timestamp}>
        <Ionicons name="time-outline" size={12} color={COLORS.TEXT_TERTIARY} />
        <Text style={styles.timestampText}>
          {formatTimestamp(upload.timestamp)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    padding: 12,
    width: 256,
    ...SHADOWS.MEDIUM,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  timestamp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  timestampText: {
    fontSize: 12,
    color: COLORS.TEXT_TERTIARY,
  },
});
