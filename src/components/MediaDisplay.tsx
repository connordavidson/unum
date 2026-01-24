import React, { useState, useRef } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../shared/constants';
import type { Upload } from '../shared/types';

interface MediaDisplayProps {
  upload: Upload;
  autoPlay?: boolean;
  style?: object;
}

export function MediaDisplay({
  upload,
  autoPlay = false,
  style,
}: MediaDisplayProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef<Video>(null);

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsLoading(false);
      setIsPlaying(status.isPlaying);
    }
  };

  const togglePlayback = async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  if (upload.type === 'photo') {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={{ uri: upload.data }}
          style={styles.media}
          resizeMode="cover"
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
        />
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.PRIMARY} />
          </View>
        )}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={togglePlayback}
      activeOpacity={0.9}
    >
      <Video
        ref={videoRef}
        source={{ uri: upload.data }}
        style={styles.media}
        resizeMode={ResizeMode.COVER}
        shouldPlay={autoPlay}
        isLooping
        isMuted={false}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        onLoadStart={() => setIsLoading(true)}
      />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        </View>
      )}

      {!isPlaying && !isLoading && (
        <View style={styles.playOverlay}>
          <View style={styles.playButton}>
            <Ionicons name="play" size={32} color={COLORS.BACKGROUND} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    borderRadius: 8,
    overflow: 'hidden',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND_LIGHT,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
});
