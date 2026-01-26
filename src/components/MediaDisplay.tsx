import React, { useState, useEffect } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
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
  const [isMuted, setIsMuted] = useState(true);

  // Video player (only used for video type)
  const videoPlayer = useVideoPlayer(
    upload.type === 'video' ? upload.data : '',
    (player) => {
      player.loop = true;
      player.muted = true;
    }
  );

  // Sync muted state with player
  useEffect(() => {
    if (videoPlayer) {
      videoPlayer.muted = isMuted;
    }
  }, [isMuted, videoPlayer]);

  // Handle autoPlay and track playing state
  useEffect(() => {
    if (upload.type !== 'video' || !videoPlayer) return;

    if (autoPlay) {
      videoPlayer.play();
      setIsPlaying(true);
    } else {
      videoPlayer.pause();
      setIsPlaying(false);
    }

    // Set loading to false after a short delay (video is ready)
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [autoPlay, videoPlayer, upload.type]);

  const togglePlayback = () => {
    if (!videoPlayer) return;

    if (isPlaying) {
      videoPlayer.pause();
      setIsPlaying(false);
    } else {
      videoPlayer.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
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
      <VideoView
        player={videoPlayer}
        style={styles.media}
        contentFit="cover"
        nativeControls={false}
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

      {/* Mute/Unmute button */}
      {!isLoading && (
        <TouchableOpacity style={styles.muteButton} onPress={toggleMute}>
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={20}
            color={COLORS.BACKGROUND}
          />
        </TouchableOpacity>
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
  muteButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
