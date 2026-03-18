import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MileageTrip } from '../models/types';
import { getMileageTripsPaginated } from '../services/database';
import { startTrip, stopTrip, getTrackingStatus } from '../services/mileageTracker';
import { formatMiles, formatDateTime } from '../utils/helpers';
import { MileageStackParamList } from '../navigation/AppNavigator';

type MileageNav = NativeStackNavigationProp<MileageStackParamList, 'MileageHome'>;

const PAGE_SIZE = 50;

const TripItem = React.memo(({ item, onPress }: { item: MileageTrip; onPress: () => void }) => (
  <TouchableOpacity style={styles.tripCard} onPress={onPress}>
    <View style={styles.tripRow}>
      <View>
        <Text style={styles.tripDate}>{formatDateTime(item.startTime)}</Text>
        <Text style={styles.tripPurpose}>{item.purpose.replace(/_/g, ' ')}</Text>
      </View>
      <Text style={styles.tripMiles}>{formatMiles(item.distanceMiles)}</Text>
    </View>
  </TouchableOpacity>
));

export default function MileageScreen() {
  const navigation = useNavigation<MileageNav>();
  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [tracking, setTracking] = useState(getTrackingStatus());
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadInitial = useCallback(async () => {
    const result = await getMileageTripsPaginated(
      undefined,
      { limit: PAGE_SIZE, offset: 0 }
    );
    setTrips(result.data);
    setHasMore(result.hasMore);
    setOffset(result.data.length);
    setTracking(getTrackingStatus());
  }, []);

  useFocusEffect(useCallback(() => { loadInitial(); }, [loadInitial]));

  // Live distance updates while tracking
  useEffect(() => {
    if (tracking.isTracking) {
      intervalRef.current = setInterval(() => {
        setTracking(getTrackingStatus());
      }, 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tracking.isTracking]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitial();
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const result = await getMileageTripsPaginated(
      undefined,
      { limit: PAGE_SIZE, offset }
    );
    setTrips((prev) => [...prev, ...result.data]);
    setHasMore(result.hasMore);
    setOffset(offset + result.data.length);
    setLoadingMore(false);
  };

  const handleStart = async () => {
    const trip = await startTrip('uber_trip');
    if (!trip) {
      Alert.alert('Permission Required', 'Location permission is needed to track mileage.');
      return;
    }
    setTracking(getTrackingStatus());
    await loadInitial();
  };

  const handleStop = async () => {
    Alert.alert('End Trip', 'Are you sure you want to end this trip?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Trip',
        style: 'destructive',
        onPress: async () => {
          await stopTrip();
          setTracking(getTrackingStatus());
          await loadInitial();
        },
      },
    ]);
  };

  const completedTrips = trips.filter((t) => !t.isActive);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color="#2196F3" />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Start/Stop button */}
      <TouchableOpacity
        style={[styles.trackButton, tracking.isTracking ? styles.stopButton : styles.startButton]}
        onPress={tracking.isTracking ? handleStop : handleStart}
      >
        <Text style={styles.trackButtonIcon}>{tracking.isTracking ? '◼' : '▶'}</Text>
        <Text style={styles.trackButtonText}>
          {tracking.isTracking ? 'End Trip' : 'Start Trip'}
        </Text>
      </TouchableOpacity>

      {/* Live tracking info */}
      {tracking.isTracking && (
        <View style={styles.liveCard}>
          <Text style={styles.liveLabel}>Current Trip</Text>
          <Text style={styles.liveDistance}>
            {formatMiles(tracking.currentDistanceMiles)}
          </Text>
          <Text style={styles.livePoints}>{tracking.pointCount} GPS points recorded</Text>
        </View>
      )}

      {/* Trip history */}
      <Text style={styles.historyHeader}>Trip History</Text>
      <FlatList
        data={completedTrips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TripItem
            item={item}
            onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2196F3" />}
        contentContainerStyle={{ paddingBottom: 20 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No completed trips yet. Start your first trip above!</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  trackButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 20, borderRadius: 16, marginBottom: 16,
  },
  startButton: { backgroundColor: '#1B5E20' },
  stopButton: { backgroundColor: '#B71C1C' },
  trackButtonIcon: { color: '#fff', fontSize: 24, marginRight: 12 },
  trackButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  liveCard: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 20,
    marginBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: '#4CAF50',
  },
  liveLabel: { color: '#4CAF50', fontSize: 14, marginBottom: 8 },
  liveDistance: { color: '#fff', fontSize: 48, fontWeight: '700' },
  livePoints: { color: '#666', fontSize: 12, marginTop: 8 },
  historyHeader: { color: '#ccc', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  tripCard: {
    backgroundColor: '#1a1a2e', borderRadius: 10, padding: 16, marginBottom: 8,
    borderWidth: 1, borderColor: '#333',
  },
  tripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripDate: { color: '#fff', fontSize: 15 },
  tripPurpose: { color: '#888', fontSize: 13, marginTop: 4, textTransform: 'capitalize' },
  tripMiles: { color: '#2196F3', fontSize: 18, fontWeight: '700' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 15 },
  footerLoader: { padding: 16, alignItems: 'center' },
});
