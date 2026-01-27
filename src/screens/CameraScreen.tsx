import React, { useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { useCamera } from '../hooks/useCamera';
import { useLocation } from '../hooks/useLocation';
import { useUploadData } from '../hooks/useUploadData';
import { useAnalytics } from '../hooks/useAnalytics';
import { COLORS, BUTTON_SIZES, CAMERA_CONFIG } from '../shared/constants';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type CameraScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Camera'>;
};

export function CameraScreen({ navigation }: CameraScreenProps) {
  const insets = useSafeAreaInsets();
  const { position } = useLocation();
  const { createUpload } = useUploadData();

  const {
    permission,
    requestPermission,
    facing,
    isRecording,
    isCameraReady,
    zoom,
    capturedPhoto,
    recordedVideo,
    cameraRef,
    onCameraReady,
    flipCamera,
    clearMedia,
    setZoom,
    handlePressIn,
    handlePressOut,
  } = useCamera();

  // Analytics
  const { trackScreen, trackUpload, track } = useAnalytics();

  // Track screen view on mount
  useEffect(() => {
    trackScreen('Camera');
  }, [trackScreen]);

  // Track photo capture
  useEffect(() => {
    if (capturedPhoto) {
      track('photo_capture');
    }
  }, [capturedPhoto, track]);

  // Track video recording completion
  useEffect(() => {
    if (recordedVideo) {
      track('video_record');
    }
  }, [recordedVideo, track]);

  // Shared values for vertical slide-to-zoom
  const isRecordingShared = useSharedValue(false);
  const baselineY = useSharedValue(0);
  const hasSetBaseline = useSharedValue(false);
  const gestureActive = useSharedValue(false);

  // Keep shared value in sync with isRecording state
  useEffect(() => {
    isRecordingShared.value = isRecording;
    // Reset baseline when recording stops
    if (!isRecording) {
      hasSetBaseline.value = false;
      baselineY.value = 0;
    }
  }, [isRecording, isRecordingShared, hasSetBaseline, baselineY]);

  // Callbacks for gesture handlers (must be called via runOnJS from worklets)
  const onGestureStart = useCallback(() => {
    if (isCameraReady) {
      handlePressIn();
    }
  }, [isCameraReady, handlePressIn]);

  const onGestureEnd = useCallback(() => {
    handlePressOut();
  }, [handlePressOut]);

  const updateZoom = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, [setZoom]);

  // Pan gesture for capture button: handles tap, hold-to-record, and slide-to-zoom
  const captureGesture = Gesture.Pan()
    .minDistance(0)
    .onTouchesDown(() => {
      'worklet';
      gestureActive.value = true;
      runOnJS(onGestureStart)();
    })
    .onTouchesUp(() => {
      'worklet';
      // Always fire when finger is lifted
      if (gestureActive.value) {
        gestureActive.value = false;
        hasSetBaseline.value = false;
        baselineY.value = 0;
        runOnJS(onGestureEnd)();
      }
    })
    .onUpdate((event) => {
      'worklet';
      // Only zoom while recording
      if (isRecordingShared.value) {
        // Set baseline on first movement after recording starts
        if (!hasSetBaseline.value) {
          baselineY.value = event.absoluteY;
          hasSetBaseline.value = true;
        }
        // Calculate zoom: moving UP (negative delta) = zoom IN
        const delta = -(event.absoluteY - baselineY.value);
        // Scale: ZOOM_SCALE_PX of movement = full zoom range
        const newZoom = Math.max(0, Math.min(1, delta / CAMERA_CONFIG.ZOOM_SCALE_PX));
        runOnJS(updateZoom)(newZoom);
      }
    });

  const [caption, setCaption] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);

  // Keyboard animation
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        Animated.spring(keyboardOffset, {
          toValue: -event.endCoordinates.height + 164,
          useNativeDriver: true,
          speed: 20,
          bounciness: 0,
        }).start();
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.spring(keyboardOffset, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 0,
        }).start();
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [keyboardOffset]);

  // Video player for preview
  const videoPlayer = useVideoPlayer(recordedVideo || '', (player) => {
    player.loop = true;
    player.muted = false;
  });

  // Auto-play when video is recorded
  useEffect(() => {
    if (recordedVideo && videoPlayer) {
      videoPlayer.play();
    }
  }, [recordedVideo, videoPlayer]);

  // Helper to get current media URI and type
  const getMediaUri = useCallback(() => capturedPhoto || recordedVideo, [capturedPhoto, recordedVideo]);
  const getMediaType = useCallback((): 'photo' | 'video' => (capturedPhoto ? 'photo' : 'video'), [capturedPhoto]);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleClose = () => {
    navigation.goBack();
  };

  const handleRetake = () => {
    clearMedia();
    setCaption('');
  };

  const handleUpload = async () => {
    const mediaUri = getMediaUri();
    if (!position || !mediaUri) return;

    const mediaType = getMediaType();
    const hasCaption = caption.trim().length > 0;

    setIsUploading(true);
    trackUpload('start', { media_type: mediaType, has_caption: hasCaption });

    try {
      await createUpload({
        type: mediaType,
        data: mediaUri,
        coordinates: [position.latitude, position.longitude],
        caption: caption.trim() || undefined,
      });
      trackUpload('complete', { media_type: mediaType, has_caption: hasCaption });
      navigation.goBack();
    } catch (error) {
      console.error('Upload failed:', error);
      trackUpload('fail', { media_type: mediaType, has_caption: hasCaption });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadMedia = useCallback(async () => {
    const mediaUri = getMediaUri();
    if (!mediaUri) return;

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant media library access to save files.');
        return;
      }

      await MediaLibrary.saveToLibraryAsync(mediaUri);
      Alert.alert('Success', 'Saved to your photo library.');
    } catch (error) {
      console.error('Download failed:', error);
      Alert.alert('Error', 'Failed to save media.');
    }
  }, [getMediaUri]);

  const handleDelayedUpload = () => {
    const mediaUri = getMediaUri();
    if (!position || !mediaUri) return;

    const uploadData = {
      type: getMediaType(),
      data: mediaUri,
      coordinates: [position.latitude, position.longitude] as [number, number],
      caption: caption.trim() || undefined,
    };

    // Schedule post in 5 minutes
    setTimeout(async () => {
      try {
        await createUpload(uploadData);
      } catch (error) {
        console.error('Delayed upload failed:', error);
      }
    }, 5 * 60 * 1000);

    // Show confirmation and go back
    alert('Post scheduled for 5 minutes from now');
    navigation.goBack();
  };

  // Permission not granted
  if (!permission?.granted) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="camera-outline" size={64} color={COLORS.TEXT_SECONDARY} />
        <Text style={styles.permissionText}>Camera access is required</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeButtonAlt} onPress={handleClose}>
          <Text style={styles.closeButtonAltText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Preview captured media
  if (capturedPhoto || recordedVideo) {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          {/* Preview fills entire screen and stays fixed */}
          {capturedPhoto ? (
            <Image source={{ uri: capturedPhoto }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <VideoView
              player={videoPlayer}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          )}

          {/* Close button */}
          <TouchableOpacity
            style={[styles.closeButton, { top: insets.top + 16 }]}
            onPress={handleClose}
          >
            <Ionicons name="close" size={28} color={COLORS.BACKGROUND} />
          </TouchableOpacity>

        {/* Action buttons - fixed at bottom */}
        <View style={[styles.previewActionsContainer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={handleRetake}
              disabled={isUploading}
            >
              <Ionicons name="refresh" size={24} color={COLORS.TEXT_PRIMARY} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={handleDownloadMedia}
              disabled={isUploading}
            >
              <Ionicons name="download-outline" size={24} color={COLORS.TEXT_PRIMARY} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.postIconButton, isUploading && styles.uploadButtonDisabled]}
              onPress={handleUpload}
              disabled={isUploading || !position}
            >
              {isUploading ? (
                <ActivityIndicator color={COLORS.BACKGROUND} />
              ) : (
                <Ionicons name="arrow-up" size={24} color={COLORS.BACKGROUND} />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.delayButton, isUploading && styles.uploadButtonDisabled]}
            onPress={handleDelayedUpload}
            disabled={isUploading || !position}
          >
            <Ionicons name="time-outline" size={20} color={COLORS.BACKGROUND} />
            <Text style={styles.delayText}>Post in 5 minutes</Text>
          </TouchableOpacity>
        </View>

        {/* Caption input - slides up with keyboard */}
        <Animated.View
          style={[
            styles.captionContainer,
            { transform: [{ translateY: keyboardOffset }] },
          ]}
        >
          <TextInput
            style={styles.captionInput}
            placeholder="Add a caption..."
            placeholderTextColor={COLORS.TEXT_TERTIARY}
            value={caption}
            onChangeText={setCaption}
            maxLength={200}
            multiline
          />
        </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  // Camera view
  return (
    <View style={styles.container}>
      <CameraView
        key={facing}
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="video"
        zoom={zoom}
        onCameraReady={onCameraReady}
      />

      {/* Overlay controls - positioned absolutely on top of camera */}
      {/* Close button */}
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 16 }]}
        onPress={handleClose}
      >
        <Ionicons name="close" size={28} color={COLORS.BACKGROUND} />
      </TouchableOpacity>

      {/* Capture controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.hint}>
          {isRecording ? 'Recording... Slide up to zoom' : !isCameraReady ? 'Loading camera...' : 'Tap for photo, hold for video'}
        </Text>

        <View style={styles.captureRow}>
          {/* Flip camera button */}
          <TouchableOpacity
            style={styles.flipButton}
            onPress={flipCamera}
          >
            <Ionicons name="camera-reverse" size={28} color={COLORS.BACKGROUND} />
          </TouchableOpacity>

          {/* Capture button with pan gesture for hold-to-record and slide-to-zoom */}
          <GestureDetector gesture={captureGesture}>
            <View
              style={[
                styles.captureButton,
                isRecording && styles.captureButtonRecording,
                !isCameraReady && styles.captureButtonDisabled,
              ]}
            >
              {isRecording && <View style={styles.recordingIndicator} />}
            </View>
          </GestureDetector>

          {/* Empty space to balance the layout */}
          <View style={styles.flipButtonPlaceholder} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  camera: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    left: 16,
    width: BUTTON_SIZES.SMALL,
    height: BUTTON_SIZES.SMALL,
    borderRadius: BUTTON_SIZES.SMALL / 2,
    backgroundColor: COLORS.OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButton: {
    width: BUTTON_SIZES.MEDIUM,
    height: BUTTON_SIZES.MEDIUM,
    borderRadius: BUTTON_SIZES.MEDIUM / 2,
    backgroundColor: COLORS.OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButtonPlaceholder: {
    width: BUTTON_SIZES.MEDIUM,
    height: BUTTON_SIZES.MEDIUM,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 16,
  },
  captureButton: {
    width: BUTTON_SIZES.CAPTURE,
    height: BUTTON_SIZES.CAPTURE,
    borderRadius: BUTTON_SIZES.CAPTURE / 2,
    backgroundColor: COLORS.BACKGROUND,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonRecording: {
    backgroundColor: COLORS.DANGER,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  recordingIndicator: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: COLORS.DANGER,
  },
  hint: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 16,
  },
  permissionText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 16,
  },
  permissionButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: COLORS.BACKGROUND,
    fontSize: 16,
    fontWeight: '600',
  },
  closeButtonAlt: {
    marginTop: 16,
  },
  closeButtonAltText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 16,
  },
  previewActionsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  captionContainer: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  captionInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 18,
    color: COLORS.TEXT_PRIMARY,
    minHeight: 50,
    maxHeight: 100,
    textAlignVertical: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  actionIconButton: {
    width: BUTTON_SIZES.LARGE,
    height: BUTTON_SIZES.LARGE,
    borderRadius: BUTTON_SIZES.LARGE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postIconButton: {
    width: BUTTON_SIZES.LARGE,
    height: BUTTON_SIZES.LARGE,
    borderRadius: BUTTON_SIZES.LARGE / 2,
    backgroundColor: COLORS.SUCCESS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  delayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  delayText: {
    fontSize: 14,
    color: COLORS.BACKGROUND,
  },
});
