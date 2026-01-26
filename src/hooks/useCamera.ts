import { useState, useRef, useCallback } from 'react';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { CAMERA_CONFIG } from '../shared/constants';

interface UseCameraResult {
  // Permissions
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => Promise<void>;

  // Camera state
  isActive: boolean;
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
  openCamera: () => void;
  closeCamera: () => void;
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
  const [isActive, setIsActive] = useState(false);
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
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const isRecordingRef = useRef(false);

  // Keep ref in sync with state for use in callbacks
  isRecordingRef.current = isRecording;

  const onCameraReady = useCallback(() => {
    setIsCameraReady(true);
  }, []);

  const requestPermission = useCallback(async () => {
    await requestPermissionAsync();
  }, [requestPermissionAsync]);

  const openCamera = useCallback(() => {
    setIsActive(true);
    setCapturedPhoto(null);
    setRecordedVideo(null);
  }, []);

  const closeCamera = useCallback(() => {
    setIsActive(false);
    setCapturedPhoto(null);
    setRecordedVideo(null);
    setIsRecording(false);
  }, []);

  const flipCamera = useCallback(() => {
    if (isRecording) return;
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
    setIsCameraReady(false);
    // Fallback: expo-camera may not always fire onCameraReady after facing change
    setTimeout(() => {
      setIsCameraReady(true);
    }, 500);
  }, [isRecording]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo?.uri) {
        setCapturedPhoto(photo.uri);
      }
    } catch (err) {
      console.error('Failed to take photo:', err);
    }
  }, [isCameraReady]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording || !isCameraReady) return;

    setIsRecording(true);

    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: 60,
      });

      if (video?.uri) {
        setRecordedVideo(video.uri);
      }
    } catch (err) {
      console.error('Failed to record video:', err);
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

  // Tap for photo, hold for video
  const handlePressIn = useCallback(() => {
    isHoldingRef.current = true;

    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        startRecording();
      }
    }, CAMERA_CONFIG.HOLD_DELAY_MS);
  }, [startRecording]);

  const handlePressOut = useCallback(() => {
    const wasHolding = isHoldingRef.current;
    isHoldingRef.current = false;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    // Use ref to get current recording state (avoids stale closure)
    if (isRecordingRef.current) {
      stopRecording();
    } else if (wasHolding) {
      takePhoto();
    }
  }, [stopRecording, takePhoto]);

  return {
    permission,
    requestPermission,
    isActive,
    facing,
    isRecording,
    isCameraReady,
    zoom,
    capturedPhoto,
    recordedVideo,
    cameraRef,
    onCameraReady,
    openCamera,
    closeCamera,
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
