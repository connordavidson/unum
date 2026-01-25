import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Alert } from 'react-native';
import type { Upload } from '../shared/types';

// Access legacy properties that may not be in types but exist at runtime
const FileSystemCompat = FileSystem as typeof FileSystem & {
  documentDirectory?: string | null;
};

interface UseDownloadResult {
  downloadMedia: (upload: Upload) => Promise<void>;
  isDownloading: boolean;
}

export function useDownload(): UseDownloadResult {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadMedia = useCallback(async (upload: Upload) => {
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
      const downloadResult = await FileSystem.downloadAsync(upload.data, fileUri);

      if (downloadResult.status !== 200) {
        throw new Error('Download failed');
      }

      // Save to media library
      await MediaLibrary.saveToLibraryAsync(downloadResult.uri);

      // Clean up temp file
      await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });

      Alert.alert('Success', 'Media saved to your photo library.');
    } catch (error) {
      console.error('Download failed:', error);
      Alert.alert('Error', 'Failed to download media.');
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return { downloadMedia, isDownloading };
}
