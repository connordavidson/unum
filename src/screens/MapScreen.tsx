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
  Alert,
} from 'react-native';
import MapView, { Marker, Circle, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useFocusEffect } from '@react-navigation/native';
import { useLocation } from '../hooks/useLocation';
import { useUploadData } from '../hooks/useUploadData';
import { useAuthContext } from '../contexts/AuthContext';
import { useMapState } from '../hooks/useMapState';
import { useDownload } from '../hooks/useDownload';
import { useMapSearch } from '../hooks/useMapSearch';
import { FeedPanel } from '../components/FeedPanel';
import { MarkerCallout } from '../components/MarkerCallout';
import { ProfileDrawer } from '../components/ProfileDrawer';
import { COLORS, MAP_CONFIG, SHADOWS, BUTTON_SIZES } from '../shared/constants';
import { toLatLng } from '../shared/utils';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type MapScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Map'>;
};

export function MapScreen({ navigation }: MapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();

  const { position, loading: locationLoading } = useLocation();

  // Search hook
  const {
    searchVisible,
    setSearchVisible,
    searchQuery,
    setSearchQuery,
    searching,
    searchError,
    handleSearch,
  } = useMapSearch({ mapRef });

  const { uploads, userVotes, handleVote, refreshUploads } = useUploadData();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profileDrawerVisible, setProfileDrawerVisible] = useState(false);

  // Auth state for gating camera access
  const { auth } = useAuthContext();

  // Refresh uploads when screen comes into focus (e.g., after posting)
  // Calculate bounding box from position to fetch AWS data
  useFocusEffect(
    useCallback(() => {
      const center = position || MAP_CONFIG.DEFAULT_CENTER;
      // Handle both tuple [lat, lon] and object {latitude, longitude} formats
      const lat = Array.isArray(center) ? center[0] : center.latitude;
      const lon = Array.isArray(center) ? center[1] : center.longitude;

      const boundingBox = {
        minLat: lat - MAP_CONFIG.DEFAULT_DELTA.latitudeDelta / 2,
        maxLat: lat + MAP_CONFIG.DEFAULT_DELTA.latitudeDelta / 2,
        minLon: lon - MAP_CONFIG.DEFAULT_DELTA.longitudeDelta / 2,
        maxLon: lon + MAP_CONFIG.DEFAULT_DELTA.longitudeDelta / 2,
      };

      console.log('[MapScreen] Focus effect - refreshing with bounding box:', boundingBox);
      refreshUploads(boundingBox);
    }, [refreshUploads, position])
  );
  const { createDownloadHandler } = useDownload();
  const {
    region,
    clusters,
    visibleUploads,
    showIndividualMarkers,
    showUnclusteredMarkers,
    handleRegionChange,
  } = useMapState(uploads, position);

  // Handle map region change - update clustering AND fetch new data
  const handleMapRegionChange = useCallback((newRegion: typeof region) => {
    // Update clustering state
    handleRegionChange(newRegion);

    // Fetch data for new region
    const boundingBox = {
      minLat: newRegion.latitude - newRegion.latitudeDelta / 2,
      maxLat: newRegion.latitude + newRegion.latitudeDelta / 2,
      minLon: newRegion.longitude - newRegion.longitudeDelta / 2,
      maxLon: newRegion.longitude + newRegion.longitudeDelta / 2,
    };
    console.log('[MapScreen] Region changed - refreshing with bounding box:', boundingBox);
    refreshUploads(boundingBox);
  }, [handleRegionChange, refreshUploads]);

  // Handle pull-to-refresh in feed
  const handleRefresh = useCallback(async () => {
    console.log('[MapScreen] Pull-to-refresh triggered');
    setIsRefreshing(true);
    try {
      // Calculate bounding box from current region
      const boundingBox = {
        minLat: region.latitude - region.latitudeDelta / 2,
        maxLat: region.latitude + region.latitudeDelta / 2,
        minLon: region.longitude - region.longitudeDelta / 2,
        maxLon: region.longitude + region.longitudeDelta / 2,
      };
      console.log('[MapScreen] Refreshing with bounding box:', boundingBox);
      await refreshUploads(boundingBox);
      // Re-trigger region change to update clusters and visible uploads
      handleRegionChange(region);
    } finally {
      setIsRefreshing(false);
      console.log('[MapScreen] Refresh complete');
    }
  }, [refreshUploads, handleRegionChange, region]);

  // Create a map of upload IDs to uploads for quick lookup
  const uploadsById = useMemo(() => {
    const map = new Map<string, typeof uploads[0]>();
    uploads.forEach((upload) => map.set(upload.id, upload));
    return map;
  }, [uploads]);

  // Create download handler using the convenience wrapper
  // Pass the authenticated user's ID to embed in EXIF metadata
  const handleDownload = useMemo(
    () => createDownloadHandler(uploadsById, auth.user?.id),
    [createDownloadHandler, uploadsById, auth.user?.id]
  );

  // Track which items are visible in the feed
  const [visibleFeedIds, setVisibleFeedIds] = useState<Set<string>>(new Set());

  const handleVisibleItemsChange = useCallback((visibleIds: string[]) => {
    setVisibleFeedIds(new Set(visibleIds));
  }, []);

  const handleCameraPress = useCallback(() => {
    // Check if user is authenticated before allowing camera access
    if (!auth.isAuthenticated) {
      if (auth.isAppleSignInAvailable) {
        // Show sign-in screen
        navigation.navigate('SignIn');
      } else {
        // Non-iOS device - show message
        Alert.alert(
          'Sign In Required',
          'Posting content requires an iOS device with Apple Sign-In.'
        );
      }
      return;
    }
    navigation.navigate('Camera');
  }, [navigation, auth.isAuthenticated, auth.isAppleSignInAvailable]);

  const handleMarkerPress = useCallback(() => {
    // Minimize bottom sheet when interacting with map
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  // Handle account button press
  const handleAccountPress = useCallback(() => {
    if (auth.isAuthenticated) {
      setProfileDrawerVisible(true);
    } else {
      navigation.navigate('SignIn');
    }
  }, [auth.isAuthenticated, navigation]);

  // Wrap vote handler with auth check
  const handleVoteWithAuth = useCallback(
    (uploadId: string, voteType: 'up' | 'down') => {
      // Check if user is authenticated before allowing vote
      if (!auth.isAuthenticated) {
        if (auth.isAppleSignInAvailable) {
          navigation.navigate('SignIn');
        } else {
          Alert.alert(
            'Sign In Required',
            'Voting requires an iOS device with Apple Sign-In.'
          );
        }
        return;
      }
      handleVote(uploadId, voteType);
    },
    [auth.isAuthenticated, auth.isAppleSignInAvailable, navigation, handleVote]
  );

  // Show loading state while getting location (but still render buttons)
  const isLoading = locationLoading || !position;

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={[styles.map, styles.loadingContainer]}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        </View>
      ) : (
        <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...position,
          ...MAP_CONFIG.DEFAULT_DELTA,
        }}
        onRegionChangeComplete={handleMapRegionChange}
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
                  <MarkerCallout
                    upload={upload}
                    userVote={userVotes[upload.id]}
                    onVote={handleVoteWithAuth}
                    onDownload={handleDownload}
                  />
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
            fillColor="rgba(244, 67, 54, 0.15)"
            strokeColor="rgba(244, 67, 54, 0.4)"
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
      )}

      {/* Account button */}
      <TouchableOpacity
        style={[styles.accountButton, { top: insets.top + 16 }]}
        onPress={handleAccountPress}
        activeOpacity={0.8}
      >
        <Ionicons name="person" size={20} color={COLORS.BACKGROUND} />
      </TouchableOpacity>

      {/* Profile drawer */}
      <ProfileDrawer
        visible={profileDrawerVisible}
        onClose={() => setProfileDrawerVisible(false)}
        user={auth.user}
        onSignOut={auth.signOut}
      />

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

      {/* Feed bottom sheet - only show when map is ready */}
      {!isLoading && (
        <FeedPanel
          uploads={visibleUploads}
          userVotes={userVotes}
          onVote={handleVoteWithAuth}
          onVisibleItemsChange={handleVisibleItemsChange}
          bottomSheetRef={bottomSheetRef}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND,
  },
  map: {
    flex: 1,
  },
  accountButton: {
    position: 'absolute',
    left: 16,
    width: BUTTON_SIZES.SMALL,
    height: BUTTON_SIZES.SMALL,
    borderRadius: BUTTON_SIZES.SMALL / 2,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.MEDIUM,
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
  clusterMarker: {
    alignItems: 'center',
  },
  clusterBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(244, 67, 54, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#c62828',
    borderWidth: 3,
    borderColor: COLORS.BACKGROUND,
    ...SHADOWS.SMALL,
  },
  markerPinActive: {
    backgroundColor: '#000',
  },
});
