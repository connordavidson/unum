import { useState, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { CAMERA_CONFIG } from '../shared/constants';
import { useGestureCapture } from './useGestureCapture';

interface UseCameraResult {
  // Permissions
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => Promise<void>;

  // Camera state
  facing: CameraType;
  isRecording: boolean;
  isCameraReady: boolean;
  zoom: number;

  // Captured media
  capturedPhoto: string | null;
  recordedVideo: string | null;

  // Refs
  cameraRef: React.RefObject<CameraView>;

  // Callbacks
  onCameraReady: () => void;

  // Actions
  flipCamera: () => void;
  takePhoto: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  clearMedia: () => void;
  setZoom: (zoom: number) => void;

  // Press handlers for tap/hold gesture
  handlePressIn: () => void;
  handlePressOut: () => void;
}

export function useCamera(): UseCameraResult {
  const [permission, requestPermissionAsync] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [recordedVideo, setRecordedVideo] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [zoom, setZoomState] = useState(0);

  const setZoom = useCallback((value: number) => {
    // Clamp zoom between 0 and 1
    setZoomState(Math.max(0, Math.min(1, value)));
  }, []);

  const cameraRef = useRef<CameraView>(null);
  const isRecordingRef = useRef(false);

  // Keep ref in sync with state for use in callbacks
  isRecordingRef.current = isRecording;

  const onCameraReady = useCallback(() => {
    setIsCameraReady(true);
  }, []);

  const requestPermission = useCallback(async () => {
    await requestPermissionAsync();
  }, [requestPermissionAsync]);

  const flipCamera = useCallback(() => {
    if (isRecording) return;
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
    setIsCameraReady(false);
    // onCameraReady will be called when the new CameraView mounts (via key={facing})
  }, [isRecording]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: CAMERA_CONFIG.PHOTO_QUALITY,
        base64: false,
      });

      if (photo?.uri) {
        setCapturedPhoto(photo.uri);
      }
    } catch (err) {
      console.error('Failed to take photo:', err);
      Alert.alert('Photo Error', 'Failed to capture photo. Please try again.');
    }
  }, [isCameraReady]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording || !isCameraReady) return;

    setIsRecording(true);

    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: CAMERA_CONFIG.MAX_VIDEO_DURATION,
      });

      if (video?.uri) {
        setRecordedVideo(video.uri);
      }
    } catch (err) {
      console.error('Failed to record video:', err);
      Alert.alert('Recording Error', 'Failed to record video. Please try again.');
    } finally {
      setIsRecording(false);
    }
  }, [isRecording, isCameraReady]);

  const stopRecording = useCallback(async () => {
    if (!cameraRef.current || !isRecording) return;

    try {
      await cameraRef.current.stopRecording();
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }

    setIsRecording(false);
  }, [isRecording]);

  const clearMedia = useCallback(() => {
    setCapturedPhoto(null);
    setRecordedVideo(null);
    setZoomState(0);
  }, []);

  // Use gesture capture hook for tap/hold discrimination
  const { handlePressIn, handlePressOut } = useGestureCapture({
    onTap: takePhoto,
    onHoldStart: startRecording,
    onHoldEnd: () => {
      // Use ref to check if actually recording (avoids stale closure)
      if (isRecordingRef.current) {
        stopRecording();
      }
    },
    enabled: isCameraReady,
  });

  return {
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
    takePhoto,
    startRecording,
    stopRecording,
    clearMedia,
    setZoom,
    handlePressIn,
    handlePressOut,
  };
}
