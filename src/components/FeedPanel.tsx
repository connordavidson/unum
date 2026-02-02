import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewToken,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, { BottomSheetFlatList, BottomSheetHandleProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS, SHEET_SNAP_POINTS } from '../shared/constants';
import { FeedCard } from './FeedCard';
import type { Upload, VoteType, UserVotes } from '../shared/types';

const PULL_THRESHOLD = 80; // How far to pull before triggering refresh

interface FeedPanelProps {
  uploads: Upload[];
  userVotes: UserVotes;
  onVote: (uploadId: string, voteType: VoteType) => void;
  onReport?: (uploadId: string) => void;
  onVisibleItemsChange?: (visibleIds: string[]) => void;
  bottomSheetRef: React.RefObject<BottomSheet>;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
}

export function FeedPanel({
  uploads,
  userVotes,
  onVote,
  onReport,
  onVisibleItemsChange,
  bottomSheetRef,
  onRefresh,
  isRefreshing = false,
}: FeedPanelProps) {
  const insets = useSafeAreaInsets();
  const visibleItemsRef = useRef<Set<string>>(new Set());
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const thresholdReachedRef = useRef(false);

  const snapPoints = [
    SHEET_SNAP_POINTS.MINIMIZED,
    SHEET_SNAP_POINTS.COLLAPSED,
    SHEET_SNAP_POINTS.EXPANDED,
  ];

  // Track when sheet is expanded (not minimized)
  const handleSheetChange = useCallback((index: number) => {
    setIsSheetExpanded(index > 0);
  }, []);

  // Minimize the sheet when there are no items
  useEffect(() => {
    if (uploads.length === 0) {
      bottomSheetRef.current?.snapToIndex(0);
    }
  }, [uploads.length, bottomSheetRef]);

  // Handle scroll to track pull distance
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;

      // Negative offset means pulling down past the top
      if (offsetY < 0) {
        const distance = Math.abs(offsetY);
        setPullDistance(distance);

        // Fire haptic when threshold is first reached
        if (distance >= PULL_THRESHOLD && !thresholdReachedRef.current && !isRefreshing) {
          thresholdReachedRef.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (distance < PULL_THRESHOLD) {
          thresholdReachedRef.current = false;
        }
      } else {
        setPullDistance(0);
        thresholdReachedRef.current = false;
      }
    },
    [isRefreshing]
  );

  // Handle scroll end (user releases)
  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;

      if (offsetY < 0 && Math.abs(offsetY) >= PULL_THRESHOLD && !isRefreshing && onRefresh) {
        // Fire haptic on release
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        // Trigger refresh
        onRefresh();
      }

      // Reset
      setPullDistance(0);
      thresholdReachedRef.current = false;
    },
    [isRefreshing, onRefresh]
  );

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
        onReport={onReport}
        isVisible={isSheetExpanded && visibleItemsRef.current.has(item.id)}
      />
    ),
    [userVotes, onVote, onReport, isSheetExpanded]
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

  // Pull-to-refresh header component
  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const showPullIndicator = pullDistance > 0 || isRefreshing;

  const ListHeaderComponent = useCallback(
    () => {
      if (!showPullIndicator) return null;

      return (
        <View style={[styles.pullIndicator, { height: isRefreshing ? 50 : pullDistance }]}>
          <Animated.View
            style={{
              opacity: pullProgress,
              transform: [{ scale: 0.5 + pullProgress * 0.5 }],
            }}
          >
            <ActivityIndicator size="small" color={COLORS.PRIMARY} />
          </Animated.View>
        </View>
      );
    },
    [showPullIndicator, pullDistance, pullProgress]
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      topInset={insets.top}
      handleComponent={renderHandle}
      backgroundStyle={styles.background}
      enablePanDownToClose={false}
      enableContentPanningGesture={false}
      enableHandlePanningGesture={true}
      onChange={handleSheetChange}
    >
      <BottomSheetFlatList
        data={uploads}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={ListEmptyComponent}
        ListHeaderComponent={ListHeaderComponent}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 80,
        }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        scrollEventThrottle={16}
        bounces={true}
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
  pullIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
