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
import { Colors } from '../theme/colors';
import { Fonts } from '../theme/typography';

type MileageNav = NativeStackNavigationProp<MileageStackParamList, 'MileageHome'>;

const PAGE_SIZE = 50;

const PURPOSE_COLORS: Record<string, string> = {
  uber_trip: Colors.primary,
  commute: Colors.tertiary,
  errand: Colors.secondary,
  other: Colors.onSurfaceVariant,
};

const PURPOSE_LABELS: Record<string, string> = {
  uber_trip: 'Business',
  commute: 'Commute',
  errand: 'Personal',
  other: 'Other',
};

const TripItem = React.memo(({ item, onPress }: { item: MileageTrip; onPress: () => void }) => {
  const purposeColor = PURPOSE_COLORS[item.purpose] || Colors.onSurfaceVariant;
  const isBusiness = item.purpose === 'uber_trip' || item.purpose === 'commute';
  const duration = item.endTime
    ? Math.round((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60000)
    : 0;
  const durationStr = duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60}m` : `${duration} mins`;

  return (
    <TouchableOpacity style={styles.tripCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.tripRow}>
        <View style={styles.tripLeft}>
          <View style={[styles.tripIconWrap, { borderLeftColor: purposeColor, borderLeftWidth: 4 }]}>
            <Text style={[styles.tripIcon, { color: purposeColor }]}>
              {item.purpose === 'uber_trip' ? 'T' : item.purpose === 'errand' ? 'P' : 'W'}
            </Text>
          </View>
          <View>
            <View style={styles.tripTitleRow}>
              <Text style={styles.tripDate}>{formatDateTime(item.startTime)}</Text>
              <View style={[
                styles.purposeBadge,
                { backgroundColor: isBusiness ? Colors.secondary + '1A' : Colors.surfaceContainerHighest },
              ]}>
                <Text style={[
                  styles.purposeBadgeText,
                  { color: isBusiness ? Colors.secondary : Colors.onSurfaceVariant },
                ]}>
                  {PURPOSE_LABELS[item.purpose] || 'Other'}
                </Text>
              </View>
            </View>
            <Text style={styles.tripMeta}>
              {formatDateTime(item.startTime).split(',')[1]?.trim().split(' ').slice(-2).join(' ')} {duration > 0 ? `\u2022 ${durationStr}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.tripRight}>
          <Text style={styles.tripMiles}>{formatMiles(item.distanceMiles)}</Text>
          <Text style={styles.tripSource}>Calculated</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

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
        <View style={styles.spinnerWrap}>
          <ActivityIndicator color={Colors.primary} size="small" />
        </View>
        <Text style={styles.footerText}>LOADING MORE TRIPS</Text>
      </View>
    );
  };

  const estimatedEarnings = tracking.currentDistanceMiles * 0.67;

  return (
    <View style={styles.container}>
      {/* Start/Stop Button */}
      <View style={styles.heroSection}>
        <TouchableOpacity
          style={[styles.trackButton, tracking.isTracking ? styles.stopButton : styles.startButton]}
          onPress={tracking.isTracking ? handleStop : handleStart}
          activeOpacity={0.85}
        >
          <View style={styles.trackButtonInner}>
            <Text style={styles.trackButtonIcon}>{tracking.isTracking ? '\u25A0' : '\u25B6'}</Text>
            <Text style={styles.trackButtonText}>
              {tracking.isTracking ? 'END TRIP' : 'START TRIP'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Live Tracking Info */}
        {tracking.isTracking && (
          <View style={styles.liveCard}>
            <View style={styles.liveStatusRow}>
              <View style={styles.liveStatusBadge}>
                <View style={styles.liveStatusDot} />
                <Text style={styles.liveStatusText}>LIVE TRACKING</Text>
              </View>
            </View>
            <Text style={styles.liveSubLabel}>Current Distance</Text>
            <View style={styles.liveDistanceRow}>
              <Text style={styles.liveDistance}>
                {tracking.currentDistanceMiles.toFixed(1)}
              </Text>
              <Text style={styles.liveDistanceUnit}>MI</Text>
            </View>
            <View style={styles.liveStatsRow}>
              <View style={styles.liveStatBox}>
                <Text style={styles.liveStatLabel}>GPS STRENGTH</Text>
                <Text style={styles.liveStatValue}>{tracking.pointCount} Points Found</Text>
              </View>
              <View style={styles.liveStatBox}>
                <Text style={styles.liveStatLabel}>EST. EARNINGS</Text>
                <Text style={[styles.liveStatValue, { color: Colors.primary }]}>
                  ${estimatedEarnings.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Trip History */}
      <View style={styles.historyHeader}>
        <View>
          <Text style={styles.historyTitle}>Trip History</Text>
          <Text style={styles.historySubtitle}>Review your tax-deductible mileage</Text>
        </View>
        <Text style={styles.filterIcon}>F</Text>
      </View>

      <FlatList
        data={completedTrips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TripItem
            item={item}
            onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} />}
        contentContainerStyle={{ paddingBottom: 100 }}
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
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },

  // Hero
  heroSection: { alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  trackButton: {
    width: 160, height: 160, borderRadius: 80,
    justifyContent: 'center', alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 40,
    shadowOpacity: 0.3,
    elevation: 12,
  },
  startButton: {
    backgroundColor: '#1B5E20',
    shadowColor: '#1B5E20',
  },
  stopButton: {
    backgroundColor: '#B71C1C',
    shadowColor: '#B71C1C',
  },
  trackButtonInner: { alignItems: 'center' },
  trackButtonIcon: { color: '#fff', fontSize: 48, marginBottom: 4 },
  trackButtonText: {
    color: '#fff', fontSize: 16, fontFamily: Fonts.extraBold, letterSpacing: 2,
  },

  // Live Card
  liveCard: {
    width: '100%',
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.primary + '66',
    borderRadius: 16,
    padding: 24,
    marginTop: 24,
  },
  liveStatusRow: { alignItems: 'flex-end', position: 'absolute', top: 12, right: 12 },
  liveStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surfaceContainerHighest,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.outlineVariant + '33',
  },
  liveStatusDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary,
  },
  liveStatusText: {
    fontSize: 10, fontFamily: Fonts.semiBold, color: Colors.onSurfaceVariant, letterSpacing: 0.5,
  },
  liveSubLabel: {
    fontSize: 11, color: Colors.onSurfaceVariant, letterSpacing: 1.5,
    textTransform: 'uppercase', fontFamily: Fonts.semiBold, marginBottom: 4,
  },
  liveDistanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  liveDistance: { fontSize: 52, fontFamily: Fonts.monoBold, color: '#fff' },
  liveDistanceUnit: { fontSize: 20, fontFamily: Fonts.semiBold, color: Colors.primaryFixedDim },
  liveStatsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  liveStatBox: {
    flex: 1, backgroundColor: Colors.surfaceContainerLowest + '80', borderRadius: 12, padding: 12,
  },
  liveStatLabel: {
    fontSize: 10, fontFamily: Fonts.semiBold, color: Colors.onSurfaceVariant,
    letterSpacing: 0.5, marginBottom: 6,
  },
  liveStatValue: { fontSize: 14, fontFamily: Fonts.monoMedium, color: Colors.onSurfaceVariant },

  // History
  historyHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginTop: 32, marginBottom: 16,
  },
  historyTitle: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.onSurface },
  historySubtitle: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.onSurfaceVariant, marginTop: 2 },
  filterIcon: { fontSize: 18, color: Colors.onSurfaceVariant },

  // Trip Card
  tripCard: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 16,
    padding: 20,
    marginBottom: 10,
  },
  tripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  tripIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.surfaceContainerLow,
    justifyContent: 'center', alignItems: 'center',
  },
  tripIcon: { fontSize: 18, fontFamily: Fonts.bold },
  tripTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripDate: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.onSurface },
  purposeBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
  },
  purposeBadgeText: { fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  tripMeta: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.onSurfaceVariant, marginTop: 4 },
  tripRight: { alignItems: 'flex-end' },
  tripMiles: { fontSize: 20, fontFamily: Fonts.monoBold, color: Colors.secondary },
  tripSource: {
    fontSize: 10, color: Colors.onSurfaceVariant, textTransform: 'uppercase',
    letterSpacing: 1, marginTop: 4,
  },

  // Footer
  footerLoader: { padding: 32, alignItems: 'center', gap: 8 },
  spinnerWrap: { marginBottom: 4 },
  footerText: {
    fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant + '66',
    letterSpacing: 2,
  },

  emptyText: {
    color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 48,
    fontSize: 15, paddingHorizontal: 40,
  },
});
