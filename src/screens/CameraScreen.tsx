import React, { useEffect } from 'react';
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
} from 'react-native';
import { CameraView } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
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
    capturedPhoto,
    recordedVideo,
    cameraRef,
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
        uri: mediaUri,
        coordinates: position,
        caption: caption.trim() || undefined,
      });
      navigation.goBack();
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
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
              style={styles.retakeButton}
              onPress={handleRetake}
              disabled={isUploading}
            >
              <Ionicons name="refresh" size={24} color={COLORS.TEXT_PRIMARY} />
              <Text style={styles.retakeText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]}
              onPress={handleUpload}
              disabled={isUploading || !position}
            >
              {isUploading ? (
                <ActivityIndicator color={COLORS.BACKGROUND} />
              ) : (
                <>
                  <Ionicons name="arrow-up" size={24} color={COLORS.BACKGROUND} />
                  <Text style={styles.uploadText}>Post</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Camera view
  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        {/* Close button */}
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 16 }]}
          onPress={handleClose}
        >
          <Ionicons name="close" size={28} color={COLORS.BACKGROUND} />
        </TouchableOpacity>

        {/* Flip camera button */}
        <TouchableOpacity
          style={[styles.flipButton, { top: insets.top + 16 }]}
          onPress={flipCamera}
        >
          <Ionicons name="camera-reverse" size={28} color={COLORS.BACKGROUND} />
        </TouchableOpacity>

        {/* Capture controls */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.captureContainer}>
            <TouchableOpacity
              style={[styles.captureButton, isRecording && styles.captureButtonRecording]}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              activeOpacity={0.8}
            >
              {isRecording && <View style={styles.recordingIndicator} />}
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            {isRecording ? 'Recording...' : 'Tap for photo, hold for video'}
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
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureContainer: {
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
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
  },
  retakeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.SUCCESS,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.BACKGROUND,
  },
});
