/**
 * UploadToast
 *
 * Global animated banner that shows background upload status.
 * Rendered as an absolute-positioned overlay inside NavigationContainer
 * so it appears above all screens regardless of navigation state.
 *
 * States:
 * - "Uploading..." with spinner while activeCount > 0 and no finished job
 * - "Posted!" with checkmark on success — auto-dismisses after 3 s
 * - "Upload failed" on failure — auto-dismisses after 6 s
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUploadQueue } from '../contexts/UploadQueueContext';
import { COLORS } from '../shared/constants';

const TOAST_HEIGHT = 44;
const SUCCESS_DISMISS_MS = 3000;
const FAILURE_DISMISS_MS = 6000;
const ANIMATION_DURATION = 250;

export function UploadToast() {
  const { activeCount, latestFinishedJob, dismissToast } = useUploadQueue();
  const insets = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(-TOAST_HEIGHT - 20)).current;
  const isVisible = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animateIn = useCallback(() => {
    if (isVisible.current) return;
    isVisible.current = true;
    Animated.timing(translateY, {
      toValue: 0,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const animateOut = useCallback((onDone?: () => void) => {
    isVisible.current = false;
    Animated.timing(translateY, {
      toValue: -TOAST_HEIGHT - 20,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    }).start(() => onDone?.());
  }, [translateY]);

  const handleDismiss = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    animateOut(() => dismissToast());
  }, [animateOut, dismissToast]);

  // Show toast when uploading starts and no finished job is shown
  useEffect(() => {
    if (activeCount > 0 && !latestFinishedJob) {
      animateIn();
    }
  }, [activeCount, latestFinishedJob, animateIn]);

  // React to job completion
  useEffect(() => {
    if (!latestFinishedJob) return;

    // Clear any existing auto-dismiss timer
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }

    animateIn();

    const delay = latestFinishedJob.status === 'success' ? SUCCESS_DISMISS_MS : FAILURE_DISMISS_MS;
    dismissTimer.current = setTimeout(() => {
      animateOut(() => dismissToast());
    }, delay);

    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, [latestFinishedJob, animateIn, animateOut, dismissToast]);

  // Hide when nothing is happening
  useEffect(() => {
    if (activeCount === 0 && !latestFinishedJob) {
      animateOut();
    }
  }, [activeCount, latestFinishedJob, animateOut]);

  const isUploading = activeCount > 0 && !latestFinishedJob;
  const isSuccess = latestFinishedJob?.status === 'success';
  const isFailed = latestFinishedJob?.status === 'failed';

  const backgroundColor = isFailed ? COLORS.DANGER : isSuccess ? COLORS.SUCCESS : COLORS.PRIMARY;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 8, backgroundColor },
        { transform: [{ translateY }] },
      ]}
      pointerEvents={isUploading || isSuccess || isFailed ? 'box-none' : 'none'}
    >
      <TouchableOpacity
        style={styles.inner}
        onPress={isFailed ? handleDismiss : undefined}
        activeOpacity={isFailed ? 0.7 : 1}
      >
        {isUploading && (
          <>
            <ActivityIndicator size="small" color="#fff" style={styles.icon} />
            <Text style={styles.text}>Uploading...</Text>
          </>
        )}
        {isSuccess && (
          <>
            <View style={styles.icon}>
              <Text style={styles.checkmark}>✓</Text>
            </View>
            <Text style={styles.text}>Posted!</Text>
          </>
        )}
        {isFailed && (
          <>
            <Text style={styles.text}>Upload failed — tap to dismiss</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 22,
    paddingHorizontal: 16,
    height: TOAST_HEIGHT,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 9999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
