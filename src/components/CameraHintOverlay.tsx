/**
 * CameraHintOverlay
 *
 * Full-screen semi-transparent overlay shown the first time a user opens
 * CameraScreen. Illustrates the four gesture controls around the capture
 * button, then dismisses when tapped. Shown only once — dismissed state is
 * persisted via AsyncStorage.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ============ Types ============

interface CameraHintOverlayProps {
  onDismiss: () => void;
}

// ============ Component ============

export function CameraHintOverlay({ onDismiss }: CameraHintOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const handleDismiss = () => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  return (
    <TouchableWithoutFeedback onPress={handleDismiss} accessibilityLabel="Dismiss camera tutorial">
      <Animated.View style={[styles.overlay, { opacity }]}>

        {/* Top hint — zoom */}
        <View style={styles.topHint}>
          <Ionicons name="arrow-up" size={22} color="#fff" />
          <Text style={styles.hintLabel}>Swipe up to zoom</Text>
        </View>

        {/* Center — capture button replica with gesture callouts */}
        <View style={styles.centerSection}>
          {/* Left — tap hint */}
          <View style={styles.sideHint}>
            <Text style={styles.hintLabel}>Tap</Text>
            <Text style={styles.hintSub}>photo</Text>
          </View>

          {/* Capture button */}
          <View style={styles.captureDemo}>
            <View style={styles.captureOuter}>
              <View style={styles.captureInner} />
            </View>
            <Text style={styles.hintSub}>hold for video</Text>
          </View>

          {/* Right — lock hint */}
          <View style={styles.sideHint}>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
            <Text style={styles.hintLabel}>Slide</Text>
            <Text style={styles.hintSub}>to lock</Text>
          </View>
        </View>

        {/* Dismiss prompt */}
        <View style={styles.dismissRow}>
          <Text style={styles.dismissText}>Tap anywhere to continue</Text>
        </View>

      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

// ============ Styles ============

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 32,
  },
  topHint: {
    alignItems: 'center',
    marginBottom: 40,
  },
  centerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  sideHint: {
    alignItems: 'center',
    width: 64,
    gap: 4,
  },
  captureDemo: {
    alignItems: 'center',
    gap: 12,
  },
  captureOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  hintLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  hintSub: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    textAlign: 'center',
  },
  dismissRow: {
    marginTop: 48,
    alignItems: 'center',
  },
  dismissText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
