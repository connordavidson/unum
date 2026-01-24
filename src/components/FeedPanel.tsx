import React, { useCallback, useRef, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ViewToken } from 'react-native';
import BottomSheet, { BottomSheetFlatList, BottomSheetHandleProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHEET_SNAP_POINTS } from '../shared/constants';
import { FeedCard } from './FeedCard';
import type { Upload, VoteType, UserVotes } from '../shared/types';

interface FeedPanelProps {
  uploads: Upload[];
  userVotes: UserVotes;
  onVote: (uploadId: number, voteType: VoteType) => void;
  onVisibleItemsChange?: (visibleIds: number[]) => void;
  bottomSheetRef: React.RefObject<BottomSheet>;
}

export function FeedPanel({
  uploads,
  userVotes,
  onVote,
  onVisibleItemsChange,
  bottomSheetRef,
}: FeedPanelProps) {
  const insets = useSafeAreaInsets();
  const visibleItemsRef = useRef<Set<number>>(new Set());

  const snapPoints = [
    SHEET_SNAP_POINTS.MINIMIZED,
    SHEET_SNAP_POINTS.COLLAPSED,
    SHEET_SNAP_POINTS.EXPANDED,
  ];

  // Minimize the sheet when there are no items
  useEffect(() => {
    if (uploads.length === 0) {
      bottomSheetRef.current?.snapToIndex(0);
    }
  }, [uploads.length, bottomSheetRef]);

  // Custom handle component that includes the header
  const renderHandle = useCallback(
    (props: BottomSheetHandleProps) => (
      <View style={styles.handleContainer}>
        <View style={styles.indicator} />
        <View style={styles.header}>
          <Text style={styles.title}>
            Feed <Text style={styles.count}>· {uploads.length} {uploads.length === 1 ? 'item' : 'items'}</Text>
          </Text>
        </View>
      </View>
    ),
    [uploads.length]
  );

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const visibleIds = viewableItems.map((item) => item.item.id);
      visibleItemsRef.current = new Set(visibleIds);
      onVisibleItemsChange?.(visibleIds);
    },
    [onVisibleItemsChange]
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

  const keyExtractor = useCallback((item: Upload) => String(item.id), []);

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
      topInset={insets.top}
      handleComponent={renderHandle}
      backgroundStyle={styles.background}
      enablePanDownToClose={false}
      enableContentPanningGesture={false}
      enableHandlePanningGesture={true}
    >
      <BottomSheetFlatList
        data={uploads}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={ListEmptyComponent}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 80,
        }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
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
  handleContainer: {
    backgroundColor: COLORS.BACKGROUND,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
  },
  indicator: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.TEXT_TERTIARY,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
  },
  count: {
    fontSize: 16,
    fontWeight: '400',
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
