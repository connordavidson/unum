import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCamera } from '../hooks/useCamera';
import { useLocation } from '../hooks/useLocation';
import { useUploadData } from '../hooks/useUploadData';
import { COLORS } from '../shared/constants';
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
    capturedPhoto,
    recordedVideo,
    cameraRef,
    onCameraReady,
    flipCamera,
    clearMedia,
    handlePressIn,
    handlePressOut,
  } = useCamera();

  const [caption, setCaption] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);

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
    if (!position) return;

    const mediaUri = capturedPhoto || recordedVideo;
    if (!mediaUri) return;

    setIsUploading(true);
    try {
      await createUpload({
        type: capturedPhoto ? 'photo' : 'video',
        data: mediaUri,
        coordinates: [position.latitude, position.longitude],
        caption: caption.trim() || undefined,
      });
      navigation.goBack();
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadMedia = useCallback(async () => {
    const mediaUri = capturedPhoto || recordedVideo;
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
  }, [capturedPhoto, recordedVideo]);

  const handleDelayedUpload = () => {
    if (!position) return;

    const mediaUri = capturedPhoto || recordedVideo;
    if (!mediaUri) return;

    const uploadData = {
      type: capturedPhoto ? 'photo' : 'video' as const,
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.previewContainer}>
          {capturedPhoto ? (
            <Image source={{ uri: capturedPhoto }} style={styles.preview} />
          ) : (
            <Video
              source={{ uri: recordedVideo! }}
              style={styles.preview}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isLooping
              isMuted={false}
            />
          )}

          {/* Close button */}
          <TouchableOpacity
            style={[styles.closeButton, { top: insets.top + 16 }]}
            onPress={handleClose}
          >
            <Ionicons name="close" size={28} color={COLORS.BACKGROUND} />
          </TouchableOpacity>
        </View>

        {/* Caption and actions */}
        <View style={[styles.previewActions, { paddingBottom: insets.bottom + 16 }]}>
          <TextInput
            style={styles.captionInput}
            placeholder="Add a caption..."
            placeholderTextColor={COLORS.TEXT_TERTIARY}
            value={caption}
            onChangeText={setCaption}
            maxLength={200}
            multiline
          />

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
            <Ionicons name="time-outline" size={20} color={COLORS.TEXT_SECONDARY} />
            <Text style={styles.delayText}>Post in 5 minutes</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Camera view
  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="video" onCameraReady={onCameraReady}>
        {/* Close button */}
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 16 }]}
          onPress={handleClose}
        >
          <Ionicons name="close" size={28} color={COLORS.BACKGROUND} />
        </TouchableOpacity>

        {/* Capture controls */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.captureRow}>
            {/* Flip camera button */}
            <TouchableOpacity
              style={styles.flipButton}
              onPress={flipCamera}
            >
              <Ionicons name="camera-reverse" size={28} color={COLORS.BACKGROUND} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.captureButton, isRecording && styles.captureButtonRecording, !isCameraReady && styles.captureButtonDisabled]}
              onPressIn={isCameraReady ? handlePressIn : undefined}
              onPressOut={isCameraReady ? handlePressOut : undefined}
              activeOpacity={0.8}
              disabled={!isCameraReady}
            >
              {isRecording && <View style={styles.recordingIndicator} />}
            </TouchableOpacity>

            {/* Empty space to balance the layout */}
            <View style={styles.flipButtonPlaceholder} />
          </View>

          <Text style={styles.hint}>
            {isRecording ? 'Recording...' : !isCameraReady ? 'Loading camera...' : 'Tap for photo, hold for video'}
          </Text>
        </View>
      </CameraView>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButtonPlaceholder: {
    width: 50,
    height: 50,
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
    width: 80,
    height: 80,
    borderRadius: 40,
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
  previewContainer: {
    flex: 1,
  },
  preview: {
    flex: 1,
  },
  previewActions: {
    backgroundColor: COLORS.BACKGROUND,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  captionInput: {
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
    minHeight: 48,
    maxHeight: 100,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  actionIconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postIconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
  },
  delayText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
});
