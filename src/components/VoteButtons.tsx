import React, { useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../shared/constants';
import { formatVoteCount } from '../shared/utils/formatting';
import type { VoteType, Coordinates } from '../shared/types';

interface VoteButtonsProps {
  uploadId: string;
  votes: number;
  coordinates?: Coordinates;
  userVote?: VoteType;
  onVote: (uploadId: string, voteType: VoteType) => void;
  onDownload?: (uploadId: string) => void;
  size?: 'small' | 'large';
}

export function VoteButtons({
  uploadId,
  votes,
  coordinates,
  userVote,
  onVote,
  onDownload,
  size = 'small',
}: VoteButtonsProps) {
  const isSmall = size === 'small';
  const iconSize = isSmall ? 16 : 24;
  const buttonSize = isSmall ? 32 : 44;

  const handleNavigate = useCallback(() => {
    if (!coordinates) return;
    const [lat, lng] = coordinates;
    const url = Platform.select({
      ios: `maps://app?daddr=${lat},${lng}`,
      android: `google.navigation:q=${lat},${lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    });
    Linking.openURL(url);
  }, [coordinates]);

  return (
    <View style={styles.container}>
      {coordinates && (
        <TouchableOpacity
          style={[styles.button, { width: buttonSize, height: buttonSize }]}
          onPress={handleNavigate}
          activeOpacity={0.7}
          accessibilityLabel="Navigate to location"
          accessibilityRole="button"
        >
          <Ionicons name="navigate-outline" size={iconSize} color={COLORS.TEXT_SECONDARY} />
        </TouchableOpacity>
      )}

      {onDownload && (
        <TouchableOpacity
          style={[styles.button, { width: buttonSize, height: buttonSize }]}
          onPress={() => onDownload(uploadId)}
          activeOpacity={0.7}
          accessibilityLabel="Download"
          accessibilityRole="button"
        >
          <Ionicons name="download-outline" size={iconSize} color={COLORS.TEXT_SECONDARY} />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[
          styles.button,
          { width: buttonSize, height: buttonSize },
          userVote === 'up' && styles.upvoteActive,
        ]}
        onPress={() => onVote(uploadId, 'up')}
        activeOpacity={0.7}
        accessibilityLabel={userVote === 'up' ? 'Remove upvote' : 'Upvote'}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.arrow,
            { fontSize: iconSize },
            userVote === 'up' && styles.upvoteText,
          ]}
        >
          ▲
        </Text>
      </TouchableOpacity>

      <Text
        style={[styles.count, isSmall && styles.countSmall]}
        accessibilityLabel={`${formatVoteCount(votes)} votes`}
      >
        {formatVoteCount(votes)}
      </Text>

      <TouchableOpacity
        style={[
          styles.button,
          { width: buttonSize, height: buttonSize },
          userVote === 'down' && styles.downvoteActive,
        ]}
        onPress={() => onVote(uploadId, 'down')}
        activeOpacity={0.7}
        accessibilityLabel={userVote === 'down' ? 'Remove downvote' : 'Downvote'}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.arrow,
            { fontSize: iconSize },
            userVote === 'down' && styles.downvoteText,
          ]}
        >
          ▼
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
  },
  arrow: {
    color: COLORS.TEXT_SECONDARY,
  },
  upvoteActive: {
    backgroundColor: COLORS.UPVOTE_BG,
  },
  upvoteText: {
    color: COLORS.SUCCESS,
  },
  downvoteActive: {
    backgroundColor: COLORS.DOWNVOTE_BG,
  },
  downvoteText: {
    color: COLORS.DANGER,
  },
  count: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    textAlign: 'center',
  },
  countSmall: {
    fontSize: 14,
  },
});
