import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { MileageTrip } from '../models/types';
import { getMileageTrips } from '../services/database';
import { formatMiles, formatDateTime, calculateMileageDeduction } from '../utils/helpers';
import { MileageStackParamList } from '../navigation/AppNavigator';

type TripRoute = RouteProp<MileageStackParamList, 'TripDetail'>;

export default function TripDetailScreen() {
  const route = useRoute<TripRoute>();
  const [trip, setTrip] = useState<MileageTrip | null>(null);

  useEffect(() => {
    (async () => {
      const trips = await getMileageTrips();
      setTrip(trips.find((t) => t.id === route.params.tripId) || null);
    })();
  }, [route.params.tripId]);

  if (!trip) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  const duration = trip.endTime
    ? Math.round((new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 60000)
    : 0;
  const avgSpeed = duration > 0 ? (trip.distanceMiles / (duration / 60)) : 0;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.distance}>{formatMiles(trip.distanceMiles)}</Text>
      <Text style={styles.purpose}>{trip.purpose.replace(/_/g, ' ')}</Text>

      <View style={styles.statsRow}>
        <StatBox label="Duration" value={`${duration} min`} />
        <StatBox label="Avg Speed" value={`${avgSpeed.toFixed(1)} mph`} />
        <StatBox label="GPS Points" value={String(trip.routePoints.length)} />
      </View>

      <View style={styles.deductionCard}>
        <Text style={styles.deductionLabel}>IRS Mileage Deduction</Text>
        <Text style={styles.deductionValue}>
          ${calculateMileageDeduction(trip.distanceMiles).toFixed(2)}
        </Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Start Time</Text>
        <Text style={styles.detailValue}>{formatDateTime(trip.startTime)}</Text>
      </View>
      {trip.endTime && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>End Time</Text>
          <Text style={styles.detailValue}>{formatDateTime(trip.endTime)}</Text>
        </View>
      )}
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Start Location</Text>
        <Text style={styles.detailValue}>
          {trip.startLatitude.toFixed(4)}, {trip.startLongitude.toFixed(4)}
        </Text>
      </View>
      {trip.endLatitude != null && trip.endLongitude != null && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>End Location</Text>
          <Text style={styles.detailValue}>
            {trip.endLatitude.toFixed(4)}, {trip.endLongitude.toFixed(4)}
          </Text>
        </View>
      )}
      {trip.notes && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Notes</Text>
          <Text style={styles.detailValue}>{trip.notes}</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  loading: { color: '#888', textAlign: 'center', marginTop: 40 },
  distance: { color: '#fff', fontSize: 48, fontWeight: '700', textAlign: 'center', marginTop: 20 },
  purpose: { color: '#888', fontSize: 16, textAlign: 'center', marginBottom: 24, textTransform: 'capitalize' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statBox: {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#333',
  },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  deductionCard: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, marginBottom: 20,
    alignItems: 'center', borderWidth: 1, borderColor: '#2196F3',
  },
  deductionLabel: { color: '#888', fontSize: 14 },
  deductionValue: { color: '#2196F3', fontSize: 28, fontWeight: '700', marginTop: 6 },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  detailLabel: { color: '#888', fontSize: 15 },
  detailValue: { color: '#fff', fontSize: 15, fontWeight: '500' },
});
