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
  ScrollView,
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
import { useSavedCities } from '../hooks/useSavedCities';
import { useAnalytics } from '../hooks/useAnalytics';
import { FeedPanel } from '../components/FeedPanel';
import { MarkerCallout } from '../components/MarkerCallout';
import { ProfileDrawer } from '../components/ProfileDrawer';
import { ReportModal } from '../components/ReportModal';
import { createReport, hasUserReported } from '../api/clients/dynamodb.client';
import { getBlockService } from '../services/block.service';
import { COLORS, MAP_CONFIG, SHADOWS, BUTTON_SIZES } from '../shared/constants';
import { toLatLng } from '../shared/utils';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { SavedCity, Coordinates } from '../shared/types';

type MapScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Map'>;
};

export function MapScreen({ navigation }: MapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();

  const { position, loading: locationLoading } = useLocation();

  // Saved cities (recent searches + favorite)
  const {
    recentSearches,
    favoriteCity,
    loading: savedCitiesLoading,
    addRecentSearch,
    toggleFavorite,
  } = useSavedCities();

  // Search hook — save successful searches to recents
  const {
    searchVisible,
    setSearchVisible,
    searchQuery,
    setSearchQuery,
    searching,
    searchError,
    handleSearch: handleSearchBase,
    navigateToCity,
  } = useMapSearch({
    mapRef,
    onSearchSuccess: addRecentSearch,
  });

  // Analytics-wrapped search handler
  const handleSearch = useCallback(() => {
    trackSearch();
    handleSearchBase();
  }, [handleSearchBase, trackSearch]);

  // Handle tapping a recent search suggestion
  const handleSuggestionPress = useCallback((city: SavedCity) => {
    navigateToCity(city);
  }, [navigateToCity]);

  const { uploads, userVotes, handleVote, refreshUploads, invalidateCache } = useUploadData();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profileDrawerVisible, setProfileDrawerVisible] = useState(false);
  const [reportUploadId, setReportUploadId] = useState<string | null>(null);

  // Auth state for gating camera access
  const { auth } = useAuthContext();

  // Analytics
  const { trackScreen, trackVote, trackSearch, track } = useAnalytics();

  // Track screen view on mount
  useEffect(() => {
    trackScreen('Map');
  }, [trackScreen]);

  // Refresh uploads when screen comes into focus (e.g., after posting)
  // No bbox here — handleMapRegionChange handles region-filtered fetches.
  // Passing a GPS-centered bbox with DEFAULT_DELTA would mismatch the actual
  // map region (adjusted for aspect ratio), causing items to disappear.
  useFocusEffect(
    useCallback(() => {
      console.log('[MapScreen] Focus effect - refreshing uploads');
      refreshUploads();
    }, [refreshUploads])
  );
  const { createDownloadHandler } = useDownload();

  // Determine initial map position: favorite city > GPS > default
  // Wait for saved cities to load so favorite city can take priority over GPS
  const initialPosition = useMemo(() => {
    if (savedCitiesLoading) return null;
    if (favoriteCity) {
      return { latitude: favoriteCity.latitude, longitude: favoriteCity.longitude } as unknown as Coordinates;
    }
    return position;
  }, [savedCitiesLoading, favoriteCity, position]);

  const {
    region,
    zoomLevel,
    clusters,
    visibleUploads,
    showIndividualMarkers,
    showUnclusteredMarkers,
    handleRegionChange,
  } = useMapState(uploads, initialPosition);

  // Handle map region change - update display filters only.
  // Data is already complete from getAll(); no need to re-fetch on zoom/pan.
  const handleMapRegionChange = useCallback((newRegion: typeof region) => {
    handleRegionChange(newRegion);
  }, [handleRegionChange]);

  // Fallback region tracker during gestures.
  // onRegionChangeComplete can be unreliable on iOS — it sometimes doesn't
  // fire after zoom gestures, leaving showIndividualMarkers stale.
  // This fires during animation but only updates state when the integer
  // zoom level changes, limiting re-renders to ~5-10 per gesture.
  const lastZoomRef = useRef(Math.round(Math.log2(360 / MAP_CONFIG.DEFAULT_DELTA.latitudeDelta)));
  const handleRegionChanging = useCallback((newRegion: typeof region) => {
    const newZoom = Math.round(Math.log2(360 / newRegion.latitudeDelta));
    if (newZoom !== lastZoomRef.current) {
      lastZoomRef.current = newZoom;
      handleRegionChange(newRegion);
    }
  }, [handleRegionChange]);

  // Handle pull-to-refresh in feed
  const handleRefresh = useCallback(async () => {
    console.log('[MapScreen] Pull-to-refresh triggered');
    track('feed_refresh');
    setIsRefreshing(true);
    try {
      invalidateCache();
      await refreshUploads();
    } finally {
      setIsRefreshing(false);
      console.log('[MapScreen] Refresh complete');
    }
  }, [refreshUploads, invalidateCache, track]);

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
      // Track vote
      const previousVote = userVotes[uploadId];
      if (previousVote === voteType) {
        trackVote('remove', { vote_type: voteType });
      } else {
        trackVote('cast', { vote_type: voteType });
      }
      handleVote(uploadId, voteType);
    },
    [auth.isAuthenticated, auth.isAppleSignInAvailable, navigation, handleVote, userVotes, trackVote]
  );

  // Report handler
  const handleReport = useCallback((uploadId: string) => {
    if (!auth.isAuthenticated) {
      navigation.navigate('SignIn');
      return;
    }
    setReportUploadId(uploadId);
  }, [auth.isAuthenticated, navigation]);

  const handleReportSubmit = useCallback(async (reason: 'inappropriate' | 'spam' | 'harassment' | 'other', details?: string) => {
    if (!reportUploadId || !auth.user?.id) return;
    const alreadyReported = await hasUserReported(reportUploadId, auth.user.id);
    if (alreadyReported) {
      Alert.alert('Already Reported', 'You have already reported this post.');
      return;
    }
    await createReport(reportUploadId, auth.user.id, reason, details);
    Alert.alert('Report Submitted', 'Thank you for helping keep Unum safe.');
  }, [reportUploadId, auth.user?.id]);

  const handleBlockUser = useCallback(async () => {
    if (!reportUploadId || !auth.user?.id) return;
    const upload = uploads.find(u => u.id === reportUploadId);
    if (!upload?.userId) return;
    await getBlockService().blockUser(auth.user.id, upload.userId);
    Alert.alert('User Blocked', 'You will no longer see posts from this user.');
    invalidateCache();
    refreshUploads();
  }, [reportUploadId, auth.user?.id, uploads, refreshUploads, invalidateCache]);

  // Show loading state while resolving initial position.
  // If a favorite city is set, we don't need to wait for GPS.
  const isLoading = savedCitiesLoading || (!favoriteCity && (locationLoading || !position));

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
          ...(initialPosition || MAP_CONFIG.DEFAULT_CENTER),
          ...MAP_CONFIG.DEFAULT_DELTA,
        }}
        onRegionChange={handleRegionChanging}
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
                    onReport={handleReport}
                  />
                </Callout>
              </Marker>
            );
          })}

        {/* Large cluster circles — always rendered.
            zoomLevel in key forces native MKCircle overlay re-creation on
            zoom changes, preventing iOS rendering bugs where overlays get
            stuck invisible after zoom animations. */}
        {clusters.largeClusters.map((cluster) => (
          <Circle
            key={`${cluster.id}-z${zoomLevel}`}
            center={toLatLng(cluster.center)}
            radius={cluster.radius}
            fillColor="rgba(244, 67, 54, 0.15)"
            strokeColor="rgba(244, 67, 54, 0.4)"
            strokeWidth={2}
            zIndex={1}
          />
        ))}

        {/* Small cluster markers */}
        {!showIndividualMarkers &&
          showUnclusteredMarkers &&
          clusters.smallClusters.map((cluster) => (
            <Marker
              key={cluster.id}
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
        accessibilityLabel="Account"
        accessibilityRole="button"
      >
        <Ionicons name="person" size={20} color={COLORS.BACKGROUND} />
      </TouchableOpacity>

      {/* Profile drawer */}
      <ProfileDrawer
        visible={profileDrawerVisible}
        onClose={() => setProfileDrawerVisible(false)}
        user={auth.user}
        onSignOut={auth.signOut}
        onNavigate={(screen) => navigation.navigate(screen as keyof RootStackParamList)}
      />

      {/* Search button */}
      <TouchableOpacity
        style={[styles.searchButton, { top: insets.top + 16 }]}
        onPress={() => setSearchVisible(true)}
        activeOpacity={0.8}
        accessibilityLabel="Search locations"
        accessibilityRole="button"
      >
        <Ionicons name="search" size={24} color={COLORS.BACKGROUND} />
      </TouchableOpacity>

      {/* Camera button */}
      <TouchableOpacity
        style={styles.cameraButton}
        onPress={handleCameraPress}
        activeOpacity={0.8}
        accessibilityLabel="Open camera"
        accessibilityRole="button"
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
            {/* Recent searches — only show when search input is empty */}
            {!searchQuery && recentSearches.length > 0 && (
              <ScrollView style={styles.recentSearchList} keyboardShouldPersistTaps="handled">
                <View style={styles.recentSearchDivider} />
                {recentSearches.map((city) => {
                  const isFavorite = favoriteCity?.name.toLowerCase() === city.name.toLowerCase();
                  return (
                    <View key={city.name} style={styles.recentSearchRow}>
                      <TouchableOpacity
                        style={styles.recentSearchStar}
                        onPress={() => toggleFavorite(city)}
                        accessibilityLabel={isFavorite ? `Unfavorite ${city.name}` : `Favorite ${city.name}`}
                        accessibilityRole="button"
                      >
                        <Ionicons
                          name={isFavorite ? 'star' : 'star-outline'}
                          size={20}
                          color={isFavorite ? '#FFB300' : COLORS.TEXT_TERTIARY}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.recentSearchName}
                        onPress={() => handleSuggestionPress(city)}
                        accessibilityLabel={`Navigate to ${city.name}`}
                        accessibilityRole="button"
                      >
                        <Text style={styles.recentSearchText} numberOfLines={1}>{city.name}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Feed bottom sheet - only show when map is ready */}
      {!isLoading && (
        <FeedPanel
          uploads={visibleUploads}
          userVotes={userVotes}
          onVote={handleVoteWithAuth}
          onReport={handleReport}
          onVisibleItemsChange={handleVisibleItemsChange}
          bottomSheetRef={bottomSheetRef}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      )}

      {/* Report modal */}
      <ReportModal
        visible={reportUploadId !== null}
        onClose={() => setReportUploadId(null)}
        onSubmit={handleReportSubmit}
        onBlockUser={handleBlockUser}
        uploadId={reportUploadId || ''}
      />
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
  recentSearchList: {
    maxHeight: 240,
  },
  recentSearchDivider: {
    height: 1,
    backgroundColor: COLORS.BORDER,
    marginHorizontal: 12,
  },
  recentSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  recentSearchStar: {
    padding: 4,
    marginRight: 8,
  },
  recentSearchName: {
    flex: 1,
  },
  recentSearchText: {
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
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
