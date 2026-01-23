import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ViewToken } from 'react-native';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { COLORS, SHEET_SNAP_POINTS } from '../shared/constants';
import { FeedCard } from './FeedCard';
import type { Upload, VoteType, UserVotes } from '../shared/types';

interface FeedPanelProps {
  uploads: Upload[];
  userVotes: UserVotes;
  onVote: (uploadId: string, voteType: VoteType) => void;
  bottomSheetRef: React.RefObject<BottomSheet>;
}

export function FeedPanel({
  uploads,
  userVotes,
  onVote,
  bottomSheetRef,
}: FeedPanelProps) {
  const visibleItemsRef = useRef<Set<string>>(new Set());

  const snapPoints = [
    SHEET_SNAP_POINTS.MINIMIZED,
    SHEET_SNAP_POINTS.COLLAPSED,
    SHEET_SNAP_POINTS.EXPANDED,
  ];

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      visibleItemsRef.current = new Set(
        viewableItems.map((item) => item.item.id)
      );
    },
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: Upload }) => (
      <FeedCard
        upload={item}
        userVote={userVotes[item.id]}
        onVote={onVote}
        isVisible={visibleItemsRef.current.has(item.id)}
      />
    ),
    [userVotes, onVote]
  );

  const keyExtractor = useCallback((item: Upload) => item.id, []);

  const ListEmptyComponent = useCallback(
    () => (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No uploads in this area</Text>
      </View>
    ),
    []
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={styles.background}
      enablePanDownToClose={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Feed</Text>
        <Text style={styles.count}>
          {uploads.length} {uploads.length === 1 ? 'item' : 'items'}
        </Text>
      </View>

      <BottomSheetFlatList
        data={uploads}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={ListEmptyComponent}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
        }}
        showsVerticalScrollIndicator={false}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: COLORS.BACKGROUND,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  indicator: {
    backgroundColor: COLORS.TEXT_TERTIARY,
    width: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
  },
  count: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  listContent: {
    paddingBottom: 32,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },
});
