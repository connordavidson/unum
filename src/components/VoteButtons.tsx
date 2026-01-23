import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS } from '../shared/constants';
import { formatVoteCount } from '../shared/utils/formatting';
import type { VoteType } from '../shared/types';

interface VoteButtonsProps {
  uploadId: string;
  votes: number;
  userVote?: VoteType;
  onVote: (uploadId: string, voteType: VoteType) => void;
  size?: 'small' | 'large';
}

export function VoteButtons({
  uploadId,
  votes,
  userVote,
  onVote,
  size = 'small',
}: VoteButtonsProps) {
  const isSmall = size === 'small';
  const iconSize = isSmall ? 16 : 24;
  const buttonSize = isSmall ? 32 : 44;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          { width: buttonSize, height: buttonSize },
          userVote === 'up' && styles.upvoteActive,
        ]}
        onPress={() => onVote(uploadId, 'up')}
        activeOpacity={0.7}
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

      <Text style={[styles.count, isSmall && styles.countSmall]}>
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
    minWidth: 32,
    textAlign: 'center',
  },
  countSmall: {
    fontSize: 14,
    minWidth: 24,
  },
});
