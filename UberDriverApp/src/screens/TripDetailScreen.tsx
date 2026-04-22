import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { MileageTrip, RoutePoint } from '../models/types';
import { getMileageTrips, getRoutePointsForTrip, updateMileageTrip, deleteRoutePointsForTrip } from '../services/database';
import { formatMiles, formatDateTime, calculateMileageDeduction } from '../utils/helpers';
import { MileageStackParamList } from '../navigation/AppNavigator';
import { Colors } from '../theme/colors';
import { Fonts } from '../theme/typography';

type TripRoute = RouteProp<MileageStackParamList, 'TripDetail'>;

const PURPOSE_OPTIONS: { label: string; value: MileageTrip['purpose'] }[] = [
  { label: 'Uber Trip', value: 'uber_trip' },
  { label: 'Commute', value: 'commute' },
  { label: 'Errand', value: 'errand' },
  { label: 'Other', value: 'other' },
];

const STORAGE_TIERS = [
  { key: 'hot', label: 'Hot', icon: 'H', color: Colors.error },
  { key: 'warm', label: 'Warm', icon: 'W', color: Colors.onSurfaceVariant },
  { key: 'cold', label: 'Cold', icon: 'C', color: Colors.onSurfaceVariant },
];

export default function TripDetailScreen() {
  const route = useRoute<TripRoute>();
  const navigation = useNavigation();
  const [trip, setTrip] = useState<MileageTrip | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      const trips = await getMileageTrips();
      const found = trips.find((t) => t.id === route.params.tripId);
      if (found) {
        setTrip(found);
        setNotes(found.notes || '');
        const points = await getRoutePointsForTrip(found.id);
        setRoutePoints(points);
      }
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

  const handlePurposeChange = async (purpose: MileageTrip['purpose']) => {
    await updateMileageTrip(trip.id, { purpose });
    setTrip({ ...trip, purpose });
  };

  const handleNotesBlur = async () => {
    if (notes !== (trip.notes || '')) {
      await updateMileageTrip(trip.id, { notes: notes.trim() || null });
      setTrip({ ...trip, notes: notes.trim() || null });
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Trip Log',
      'This action cannot be undone. Data will be purged from all storage tiers.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRoutePointsForTrip(trip.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Hero Section */}
      <View style={styles.heroSection}>
        {/* Map placeholder */}
        <View style={styles.mapCard}>
          <View style={styles.mapGradient} />
          <View style={styles.mapBadges}>
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>Completed</Text>
            </View>
            <View style={styles.tripTypeBadge}>
              <Text style={styles.tripTypeBadgeText}>{trip.purpose.replace(/_/g, ' ')}</Text>
            </View>
          </View>
        </View>

        {/* Distance Card */}
        <View style={styles.distanceCard}>
          <View>
            <Text style={styles.distanceLabel}>TOTAL DISTANCE</Text>
            <View style={styles.distanceRow}>
              <Text style={styles.distanceValue}>{trip.distanceMiles.toFixed(1)}</Text>
              <Text style={styles.distanceUnit}>mi</Text>
            </View>
          </View>
          <View style={styles.distanceStats}>
            <View style={styles.distanceStat}>
              <Text style={styles.distanceStatLabel}>Avg Speed</Text>
              <Text style={styles.distanceStatValue}>
                {avgSpeed.toFixed(0)} <Text style={styles.distanceStatUnit}>mph</Text>
              </Text>
            </View>
            <View style={styles.distanceStat}>
              <Text style={styles.distanceStatLabel}>Duration</Text>
              <Text style={styles.distanceStatValue}>
                {duration} <Text style={styles.distanceStatUnit}>min</Text>
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Time & Location */}
      <View style={styles.locationCard}>
        <View style={styles.locationTimeline}>
          <View style={styles.timelineDotStart} />
          <View style={styles.timelineLine} />
          <View style={styles.timelineDotEnd} />
        </View>
        <View style={styles.locationDetails}>
          <View style={styles.locationPoint}>
            <Text style={styles.locationPointLabel}>START TIME & POINT</Text>
            <Text style={styles.locationPointTime}>{formatDateTime(trip.startTime)}</Text>
            <Text style={styles.locationPointCoords}>
              {trip.startLatitude.toFixed(4)}N, {trip.startLongitude.toFixed(4)}W
            </Text>
          </View>
          {trip.endTime && (
            <View style={styles.locationPoint}>
              <Text style={styles.locationPointLabel}>END TIME & POINT</Text>
              <Text style={styles.locationPointTime}>{formatDateTime(trip.endTime)}</Text>
              {trip.endLatitude != null && (
                <Text style={styles.locationPointCoords}>
                  {trip.endLatitude.toFixed(4)}N, {trip.endLongitude?.toFixed(4)}W
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Storage Tier */}
      <View style={styles.storageCard}>
        <Text style={styles.storageTierLabel}>STORAGE TIER</Text>
        <View style={styles.storageTierRow}>
          {STORAGE_TIERS.map((tier) => (
            <View
              key={tier.key}
              style={[
                styles.storageTierBox,
                trip.storageTier === tier.key && styles.storageTierBoxActive,
                trip.storageTier === tier.key && { borderColor: tier.color + '33' },
                trip.storageTier !== tier.key && { opacity: 0.4 },
              ]}
            >
              <Text style={[styles.storageTierIcon, { color: trip.storageTier === tier.key ? tier.color : Colors.onSurfaceVariant }]}>
                {tier.icon}
              </Text>
              <Text style={[styles.storageTierName, { color: trip.storageTier === tier.key ? tier.color : Colors.onSurfaceVariant }]}>
                {tier.label}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.storageNote}>Data is mirrored in local cache and cloud storage.</Text>
      </View>

      {/* Trip Properties */}
      <View style={styles.propertiesCard}>
        <Text style={styles.propertiesTitle}>Trip Properties</Text>
        <Text style={styles.propertiesLabel}>Trip Purpose</Text>
        <View style={styles.purposeRow}>
          {PURPOSE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.purposeChip,
                trip.purpose === opt.value && styles.purposeChipActive,
              ]}
              onPress={() => handlePurposeChange(opt.value)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.purposeChipText,
                trip.purpose === opt.value && styles.purposeChipTextActive,
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.propertiesLabel}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          onBlur={handleNotesBlur}
          placeholder="Add trip details or expense notes..."
          placeholderTextColor={Colors.onSurfaceVariant + '4D'}
          multiline
          textAlignVertical="top"
        />
      </View>

      {/* GPS Waypoints */}
      <View style={styles.waypointsSection}>
        <View style={styles.waypointsHeader}>
          <Text style={styles.waypointsTitle}>GPS Waypoints</Text>
          <Text style={styles.waypointsCount}>{routePoints.length} Logs Captured</Text>
        </View>
        <View style={styles.waypointsTable}>
          <View style={styles.waypointsHeaderRow}>
            <Text style={[styles.waypointColHeader, { width: 80 }]}>Timestamp</Text>
            <Text style={[styles.waypointColHeader, { flex: 1 }]}>Coordinates</Text>
            <Text style={[styles.waypointColHeader, { width: 60, textAlign: 'right' }]}>Speed</Text>
          </View>
          {routePoints.slice(0, 10).map((point, idx) => (
            <View key={idx} style={styles.waypointRow}>
              <Text style={[styles.waypointCell, styles.monoText, { width: 80 }]}>
                {formatTime(point.timestamp)}
              </Text>
              <Text style={[styles.waypointCell, styles.monoText, { flex: 1 }]}>
                {point.latitude.toFixed(4)}N, {point.longitude.toFixed(4)}W
              </Text>
              <Text style={[styles.waypointCell, styles.waypointSpeed, { width: 60, textAlign: 'right' }]}>
                {point.speed != null ? `${point.speed.toFixed(0)} mph` : '--'}
              </Text>
            </View>
          ))}
          {routePoints.length > 10 && (
            <Text style={styles.morePoints}>
              + {routePoints.length - 10} more points...
            </Text>
          )}
        </View>
      </View>

      {/* Delete Button */}
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
        <Text style={styles.deleteBtnText}>Delete Trip Log</Text>
      </TouchableOpacity>
      <Text style={styles.deleteWarning}>
        This action cannot be undone. Data will be purged from all storage tiers.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  loading: { color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 40, fontFamily: Fonts.regular },

  // Hero
  heroSection: { flexDirection: 'row', gap: 12, marginTop: 12 },
  mapCard: {
    flex: 2, height: 200, borderRadius: 16, overflow: 'hidden',
    backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outlineVariant + '1A',
    justifyContent: 'flex-end',
  },
  mapGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
    backgroundColor: Colors.surfaceContainerLowest + '99',
  },
  mapBadges: { flexDirection: 'row', gap: 8, padding: 12 },
  completedBadge: {
    backgroundColor: Colors.primaryContainer, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  completedBadgeText: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.onPrimaryContainer, textTransform: 'uppercase', letterSpacing: 0.5 },
  tripTypeBadge: {
    backgroundColor: Colors.surfaceContainerHigh + 'CC', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  tripTypeBadgeText: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.secondary, textTransform: 'uppercase', letterSpacing: 0.5 },

  distanceCard: {
    flex: 1, backgroundColor: Colors.surfaceContainer, borderRadius: 16, padding: 20,
    borderLeftWidth: 4, borderLeftColor: Colors.secondary,
    justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12,
    elevation: 6,
  },
  distanceLabel: {
    fontSize: 10, fontFamily: Fonts.semiBold, color: Colors.onSurfaceVariant, letterSpacing: 2,
  },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 },
  distanceValue: { fontSize: 40, fontFamily: Fonts.monoBold, color: Colors.secondary },
  distanceUnit: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.secondary },
  distanceStats: { marginTop: 20, gap: 12 },
  distanceStat: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  distanceStatLabel: { fontSize: 12, color: Colors.onSurfaceVariant, fontFamily: Fonts.medium },
  distanceStatValue: { fontSize: 14, fontFamily: Fonts.monoMedium, color: Colors.onSurface },
  distanceStatUnit: { fontSize: 10, opacity: 0.6 },

  // Location
  locationCard: {
    flexDirection: 'row', gap: 14,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 16, padding: 20, marginTop: 12,
  },
  locationTimeline: { alignItems: 'center', paddingTop: 4 },
  timelineDotStart: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  timelineLine: { width: 2, height: 48, backgroundColor: Colors.outlineVariant + '4D' },
  timelineDotEnd: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error },
  locationDetails: { flex: 1, gap: 20 },
  locationPoint: {},
  locationPointLabel: {
    fontSize: 10, fontFamily: Fonts.bold, color: Colors.onSurfaceVariant, letterSpacing: 1.5,
  },
  locationPointTime: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.onSurface, marginTop: 4 },
  locationPointCoords: { fontSize: 12, fontFamily: Fonts.mono, color: Colors.onSurfaceVariant, marginTop: 2 },

  // Storage
  storageCard: {
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 16, padding: 20, marginTop: 12,
  },
  storageTierLabel: {
    fontSize: 10, fontFamily: Fonts.bold, color: Colors.onSurfaceVariant,
    letterSpacing: 1.5, marginBottom: 12,
  },
  storageTierRow: { flexDirection: 'row', gap: 8 },
  storageTierBox: {
    flex: 1, alignItems: 'center', padding: 12, borderRadius: 12,
    backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: 'transparent',
  },
  storageTierBoxActive: { backgroundColor: Colors.errorContainer + '33' },
  storageTierIcon: { fontSize: 20, fontFamily: Fonts.bold, marginBottom: 4 },
  storageTierName: { fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  storageNote: {
    fontSize: 10, fontFamily: Fonts.regular, color: Colors.onSurfaceVariant, fontStyle: 'italic',
    textAlign: 'center', marginTop: 14,
  },

  // Properties
  propertiesCard: {
    backgroundColor: Colors.surfaceContainer, borderRadius: 16, padding: 24, marginTop: 16,
  },
  propertiesTitle: { fontSize: 18, fontWeight: '700', color: Colors.onSurface, marginBottom: 20 },
  propertiesLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant,
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8,
  },
  purposeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  purposeChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  purposeChipActive: { backgroundColor: Colors.primaryContainer },
  purposeChipText: { fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant },
  purposeChipTextActive: { color: Colors.onPrimaryContainer },
  notesInput: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 16, padding: 16,
    color: Colors.onSurface, fontSize: 14, minHeight: 100,
  },

  // Waypoints
  waypointsSection: { marginTop: 20 },
  waypointsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  waypointsTitle: { fontSize: 18, fontWeight: '700', color: Colors.onSurface },
  waypointsCount: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  waypointsTable: {
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 16, overflow: 'hidden',
  },
  waypointsHeaderRow: {
    flexDirection: 'row', padding: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant + '1A',
    backgroundColor: Colors.surfaceContainerLowest + '80',
  },
  waypointColHeader: {
    fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  waypointRow: {
    flexDirection: 'row', padding: 14, alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant + '0D',
  },
  waypointCell: { fontSize: 12, color: Colors.onSurface },
  monoText: { fontFamily: 'monospace' },
  waypointSpeed: { fontWeight: '700', color: Colors.secondary },
  morePoints: {
    textAlign: 'center', padding: 12, fontSize: 12, color: Colors.onSurfaceVariant,
  },

  // Delete
  deleteBtn: {
    marginTop: 32,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: Colors.errorContainer + '33',
    borderWidth: 1, borderColor: Colors.error + '4D',
  },
  deleteBtnText: { color: Colors.error, fontSize: 16, fontWeight: '700' },
  deleteWarning: {
    textAlign: 'center', color: Colors.onSurfaceVariant, fontSize: 10,
    marginTop: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.6,
  },
});
