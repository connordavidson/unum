import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import MapView, { Marker, Circle, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useLocation } from '../hooks/useLocation';
import { useUploadData } from '../hooks/useUploadData';
import { useMapState } from '../hooks/useMapState';
import { FeedPanel } from '../components/FeedPanel';
import { MediaDisplay } from '../components/MediaDisplay';
import { VoteButtons } from '../components/VoteButtons';
import { COLORS, MAP_CONFIG } from '../shared/constants';
import { formatTimestamp } from '../shared/utils/formatting';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type MapScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Map'>;
};

export function MapScreen({ navigation }: MapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const { position } = useLocation();
  const { uploads, userVotes, handleVote } = useUploadData();
  const {
    region,
    clusters,
    visibleUploads,
    showIndividualMarkers,
    showUnclusteredMarkers,
    handleRegionChange,
  } = useMapState(uploads);

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
          ...MAP_CONFIG.DEFAULT_CENTER,
          ...MAP_CONFIG.DEFAULT_DELTA,
        }}
        region={position ? { ...position, ...MAP_CONFIG.DEFAULT_DELTA } : undefined}
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation
        showsMyLocationButton
      >
        {/* Individual markers at high zoom */}
        {showIndividualMarkers &&
          uploads.map((upload) => (
            <Marker
              key={upload.id}
              coordinate={upload.coordinates}
              onPress={handleMarkerPress}
            >
              <Callout tooltip style={styles.callout}>
                <View style={styles.calloutContent}>
                  <MediaDisplay upload={upload} style={styles.calloutMedia} />
                  <View style={styles.calloutActions}>
                    <VoteButtons
                      uploadId={upload.id}
                      votes={upload.votes}
                      userVote={userVotes[upload.id]}
                      onVote={handleVote}
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
          ))}

        {/* Large cluster circles */}
        {clusters.largeClusters.map((cluster, index) => (
          <Circle
            key={`large-${index}`}
            center={cluster.center}
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
              coordinate={cluster.center}
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
          clusters.unclustered.map((upload) => (
            <Marker
              key={`unclustered-${upload.id}`}
              coordinate={upload.coordinates}
              onPress={handleMarkerPress}
            />
          ))}
      </MapView>

      {/* Camera button */}
      <TouchableOpacity
        style={styles.cameraButton}
        onPress={handleCameraPress}
        activeOpacity={0.8}
      >
        <Ionicons name="camera" size={28} color={COLORS.BACKGROUND} />
      </TouchableOpacity>

      {/* Feed bottom sheet */}
      <FeedPanel
        uploads={visibleUploads}
        userVotes={userVotes}
        onVote={handleVote}
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
  cameraButton: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  callout: {
    width: 280,
  },
  calloutContent: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
});
