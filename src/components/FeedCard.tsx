import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FEED_CONFIG } from '../shared/constants';
import { formatTimestamp, truncateText } from '../shared/utils/formatting';
import { useDownload } from '../hooks/useDownload';
import { MediaDisplay } from './MediaDisplay';
import { VoteButtons } from './VoteButtons';
import type { Upload, VoteType } from '../shared/types';

interface FeedCardProps {
  upload: Upload;
  userVote?: VoteType;
  onVote: (uploadId: number, voteType: VoteType) => void;
  isVisible?: boolean;
}

export function FeedCard({
  upload,
  userVote,
  onVote,
  isVisible = false,
}: FeedCardProps) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const { downloadMedia } = useDownload();

  const handleDownload = useCallback((_uploadId: number) => {
    downloadMedia(upload);
  }, [downloadMedia, upload]);

  const hasLongCaption =
    upload.caption && upload.caption.length > FEED_CONFIG.CAPTION_MAX_LENGTH;

  const displayCaption =
    upload.caption && !captionExpanded && hasLongCaption
      ? truncateText(upload.caption, FEED_CONFIG.CAPTION_MAX_LENGTH)
      : upload.caption;

  return (
    <View style={styles.card}>
      <MediaDisplay upload={upload} autoPlay={isVisible} />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.timestamp}>{formatTimestamp(upload.timestamp)}</Text>
          <VoteButtons
            uploadId={upload.id}
            votes={upload.votes}
            coordinates={upload.coordinates}
            userVote={userVote}
            onVote={onVote}
            onDownload={handleDownload}
            size="small"
          />
        </View>

        {upload.caption && (
          <TouchableOpacity
            onPress={() => hasLongCaption && setCaptionExpanded(!captionExpanded)}
            activeOpacity={hasLongCaption ? 0.7 : 1}
          >
            <Text style={styles.caption}>
              {displayCaption}
              {hasLongCaption && !captionExpanded && (
                <Text style={styles.showMore}> Show more</Text>
              )}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timestamp: {
    fontSize: 12,
    color: COLORS.TEXT_TERTIARY,
  },
  caption: {
    fontSize: 14,
    color: COLORS.TEXT_PRIMARY,
    lineHeight: 20,
  },
  showMore: {
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '500',
  },
});
