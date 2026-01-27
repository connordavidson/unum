import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { Alert, Platform } from 'react-native';
import type { Upload } from '../shared/types';
import { addDownloaderExif, readExifFromImage } from '../services/exif.service';

// Access legacy properties that may not be in types but exist at runtime
const FileSystemCompat = FileSystem as typeof FileSystem & {
  documentDirectory?: string | null;
};

interface UseDownloadResult {
  downloadMedia: (upload: Upload, downloaderId?: string) => Promise<void>;
  /** Create a download handler that looks up uploads by ID from a map */
  createDownloadHandler: (uploadsById: Map<string, Upload>, downloaderId?: string) => (uploadId: string) => void;
  isDownloading: boolean;
}

export function useDownload(): UseDownloadResult {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadMedia = useCallback(async (upload: Upload, downloaderId?: string) => {
    try {
      setIsDownloading(true);

      // Request permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant media library access to save files.');
        return;
      }

      // Determine file extension
      const extension = upload.type === 'video' ? 'mp4' : 'jpg';
      const fileName = `unum_${upload.id}_${Date.now()}.${extension}`;
      const fileUri = `${FileSystemCompat.documentDirectory}${fileName}`;

      // Download the file
      console.log('[useDownload] Downloading from:', upload.data);
      const downloadResult = await FileSystem.downloadAsync(upload.data, fileUri);

      if (downloadResult.status !== 200) {
        throw new Error('Download failed');
      }
      console.log('[useDownload] Downloaded to:', downloadResult.uri);

      // Check EXIF data in downloaded file
      if (upload.type === 'photo') {
        const downloadedExif = await readExifFromImage(downloadResult.uri);
        console.log('[useDownload] EXIF in downloaded file:', JSON.stringify(downloadedExif));
      }

      // Add downloader ID to EXIF for photos
      let finalUri = downloadResult.uri;
      if (upload.type === 'photo' && downloaderId) {
        console.log('[useDownload] Adding downloader EXIF:', downloaderId);
        finalUri = await addDownloaderExif(downloadResult.uri, downloaderId);

        // Verify EXIF after adding downloader
        const finalExif = await readExifFromImage(finalUri);
        console.log('[useDownload] EXIF after adding downloader:', JSON.stringify(finalExif));
      }

      // Save to media library using CameraRoll (preserves EXIF better on iOS)
      console.log('[useDownload] Saving to media library:', finalUri);
      if (Platform.OS === 'ios') {
        // CameraRoll.saveAsset preserves EXIF metadata on iOS
        await CameraRoll.saveAsset(finalUri, {
          type: upload.type === 'video' ? 'video' : 'photo',
        });
      } else {
        // Fall back to MediaLibrary on Android
        await MediaLibrary.saveToLibraryAsync(finalUri);
      }

      // Clean up temp file
      await FileSystem.deleteAsync(finalUri, { idempotent: true });

      Alert.alert('Success', 'Media saved to your photo library.');
    } catch (error) {
      console.error('Download failed:', error);
      Alert.alert('Error', 'Failed to download media.');
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const createDownloadHandler = useCallback(
    (uploadsById: Map<string, Upload>, downloaderId?: string) => (uploadId: string) => {
      const upload = uploadsById.get(uploadId);
      if (upload) {
        downloadMedia(upload, downloaderId);
      }
    },
    [downloadMedia]
  );

  return { downloadMedia, createDownloadHandler, isDownloading };
}
