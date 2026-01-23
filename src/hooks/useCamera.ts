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

  // Captured media
  capturedPhoto: string | null;
  recordedVideo: string | null;

  // Refs
  cameraRef: React.RefObject<CameraView>;

  // Actions
  openCamera: () => void;
  closeCamera: () => void;
  flipCamera: () => void;
  takePhoto: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  clearMedia: () => void;

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

  const cameraRef = useRef<CameraView>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);

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
  }, [isRecording]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;

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
  }, []);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording) return;

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
  }, [isRecording]);

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

    if (isRecording) {
      stopRecording();
    } else if (wasHolding) {
      takePhoto();
    }
  }, [isRecording, stopRecording, takePhoto]);

  return {
    permission,
    requestPermission,
    isActive,
    facing,
    isRecording,
    capturedPhoto,
    recordedVideo,
    cameraRef,
    openCamera,
    closeCamera,
    flipCamera,
    takePhoto,
    startRecording,
    stopRecording,
    clearMedia,
    handlePressIn,
    handlePressOut,
  };
}
