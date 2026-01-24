import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Text,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Circle, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useLocation } from '../hooks/useLocation';
import { useUploadData } from '../hooks/useUploadData';
import { useMapState } from '../hooks/useMapState';
import { useDownload } from '../hooks/useDownload';
import { FeedPanel } from '../components/FeedPanel';
import { MediaDisplay } from '../components/MediaDisplay';
import { VoteButtons } from '../components/VoteButtons';
import { COLORS, MAP_CONFIG, SHADOWS, BUTTON_SIZES } from '../shared/constants';
import { formatTimestamp, toLatLng } from '../shared/utils';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type MapScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Map'>;
};

export function MapScreen({ navigation }: MapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const hasInitializedRef = useRef(false);
  const insets = useSafeAreaInsets();

  const { position } = useLocation();

  // Search state
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);

    try {
      const results = await Location.geocodeAsync(searchQuery);
      if (results.length > 0) {
        const { latitude, longitude } = results[0];
        mapRef.current?.animateToRegion({
          latitude,
          longitude,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }, 500);
        setSearchVisible(false);
        setSearchQuery('');
      } else {
        setSearchError('Location not found');
      }
    } catch (error) {
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Center on user's location once on startup
  useEffect(() => {
    if (position && !hasInitializedRef.current && mapRef.current) {
      hasInitializedRef.current = true;
      mapRef.current.animateToRegion({
        ...position,
        ...MAP_CONFIG.DEFAULT_DELTA,
      }, 500);
    }
  }, [position]);
  const { uploads, userVotes, handleVote } = useUploadData();
  const { downloadMedia } = useDownload();
  const {
    region,
    clusters,
    visibleUploads,
    showIndividualMarkers,
    showUnclusteredMarkers,
    handleRegionChange,
  } = useMapState(uploads);

  // Create a map of upload IDs to uploads for quick lookup
  const uploadsById = useMemo(() => {
    const map = new Map<number, typeof uploads[0]>();
    uploads.forEach((upload) => map.set(upload.id, upload));
    return map;
  }, [uploads]);

  const handleDownload = useCallback((uploadId: number) => {
    const upload = uploadsById.get(uploadId);
    if (upload) {
      downloadMedia(upload);
    }
  }, [uploadsById, downloadMedia]);

  // Track which items are visible in the feed
  const [visibleFeedIds, setVisibleFeedIds] = useState<Set<number>>(new Set());

  const handleVisibleItemsChange = useCallback((visibleIds: number[]) => {
    setVisibleFeedIds(new Set(visibleIds));
  }, []);

  const handleCameraPress = useCallback(() => {
    navigation.navigate('Camera');
  }, [navigation]);

  const handleMarkerPress = useCallback(() => {
    // Minimize bottom sheet when interacting with map
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...(position || MAP_CONFIG.DEFAULT_CENTER),
          ...MAP_CONFIG.DEFAULT_DELTA,
        }}
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation
        showsMyLocationButton
      >
        {/* Individual markers at high zoom */}
        {showIndividualMarkers &&
          uploads.map((upload) => {
            const isVisibleInFeed = visibleFeedIds.has(upload.id);
            return (
              <Marker
                key={upload.id}
                coordinate={toLatLng(upload.coordinates)}
                onPress={handleMarkerPress}
              >
                <View style={[styles.markerPin, isVisibleInFeed && styles.markerPinActive]} />
                <Callout tooltip style={styles.callout}>
                  <View style={styles.calloutContent}>
                    <MediaDisplay upload={upload} style={styles.calloutMedia} />
                    <View style={styles.calloutActions}>
                      <VoteButtons
                        uploadId={upload.id}
                        votes={upload.votes}
                        coordinates={upload.coordinates}
                        userVote={userVotes[upload.id]}
                        onVote={handleVote}
                        onDownload={handleDownload}
                        size="large"
                      />
                    </View>
                    <View style={styles.calloutTimestamp}>
                      <Ionicons name="time-outline" size={12} color={COLORS.TEXT_TERTIARY} />
                      <View style={styles.timestampText}>
                        {/* Text wrapper for proper styling */}
                      </View>
                    </View>
                  </View>
                </Callout>
              </Marker>
            );
          })}

        {/* Large cluster circles */}
        {clusters.largeClusters.map((cluster, index) => (
          <Circle
            key={`large-${index}`}
            center={toLatLng(cluster.center)}
            radius={cluster.radius}
            fillColor="rgba(76, 175, 80, 0.3)"
            strokeColor={COLORS.SUCCESS}
            strokeWidth={2}
          />
        ))}

        {/* Small cluster markers */}
        {!showIndividualMarkers &&
          showUnclusteredMarkers &&
          clusters.smallClusters.map((cluster, index) => (
            <Marker
              key={`small-${index}`}
              coordinate={toLatLng(cluster.center)}
              onPress={handleMarkerPress}
            >
              <View style={styles.clusterMarker}>
                <View style={styles.clusterBadge}>
                  <Ionicons name="location" size={20} color={COLORS.BACKGROUND} />
                </View>
              </View>
            </Marker>
          ))}

        {/* Unclustered markers */}
        {!showIndividualMarkers &&
          showUnclusteredMarkers &&
          clusters.unclustered.map((upload) => {
            const isVisibleInFeed = visibleFeedIds.has(upload.id);
            return (
              <Marker
                key={`unclustered-${upload.id}`}
                coordinate={toLatLng(upload.coordinates)}
                onPress={handleMarkerPress}
              >
                <View style={[styles.markerPin, isVisibleInFeed && styles.markerPinActive]} />
              </Marker>
            );
          })}
      </MapView>

      {/* Search button */}
      <TouchableOpacity
        style={[styles.searchButton, { top: insets.top + 16 }]}
        onPress={() => setSearchVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="search" size={24} color={COLORS.BACKGROUND} />
      </TouchableOpacity>

      {/* Camera button */}
      <TouchableOpacity
        style={styles.cameraButton}
        onPress={handleCameraPress}
        activeOpacity={0.8}
      >
        <Ionicons name="camera" size={28} color={COLORS.BACKGROUND} />
      </TouchableOpacity>

      {/* Search modal */}
      <Modal
        visible={searchVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSearchVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSearchVisible(false)}
          />
          <View style={[styles.searchContainer, { marginTop: insets.top + 76 }]}>
            <View style={styles.searchInputRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a location..."
                placeholderTextColor={COLORS.TEXT_TERTIARY}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                autoFocus
                returnKeyType="search"
              />
              {searching ? (
                <ActivityIndicator color={COLORS.PRIMARY} style={styles.searchIcon} />
              ) : (
                <TouchableOpacity onPress={handleSearch} style={styles.searchIcon}>
                  <Ionicons name="arrow-forward" size={24} color={COLORS.PRIMARY} />
                </TouchableOpacity>
              )}
            </View>
            {searchError && <Text style={styles.searchError}>{searchError}</Text>}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Feed bottom sheet */}
      <FeedPanel
        uploads={visibleUploads}
        userVotes={userVotes}
        onVote={handleVote}
        onVisibleItemsChange={handleVisibleItemsChange}
        bottomSheetRef={bottomSheetRef}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  searchButton: {
    position: 'absolute',
    right: 16,
    width: BUTTON_SIZES.SMALL,
    height: BUTTON_SIZES.SMALL,
    borderRadius: BUTTON_SIZES.SMALL / 2,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.MEDIUM,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    width: BUTTON_SIZES.XLARGE,
    height: BUTTON_SIZES.XLARGE,
    borderRadius: BUTTON_SIZES.XLARGE / 2,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.MEDIUM,
  },
  modalOverlay: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  searchContainer: {
    marginHorizontal: 16,
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    padding: 4,
    ...SHADOWS.LARGE,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
  },
  searchIcon: {
    padding: 12,
  },
  searchError: {
    color: COLORS.DANGER,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  callout: {
    width: 280,
  },
  calloutContent: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    padding: 12,
    ...SHADOWS.MEDIUM,
  },
  calloutMedia: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    marginBottom: 12,
  },
  calloutActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  calloutTimestamp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  timestampText: {
    fontSize: 12,
    color: COLORS.TEXT_TERTIARY,
  },
  clusterMarker: {
    alignItems: 'center',
  },
  clusterBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.SUCCESS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.DANGER,
    borderWidth: 3,
    borderColor: COLORS.BACKGROUND,
    ...SHADOWS.SMALL,
  },
  markerPinActive: {
    backgroundColor: '#000',
  },
});
