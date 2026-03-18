import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getTransactionSummary, getMileageSummary } from '../services/database';
import { getTrackingStatus } from '../services/mileageTracker';
import { getStorageStats, forceCleanup, StorageStats } from '../services/storageManager';
import { formatCurrency, formatMiles, getCurrentMonthRange, calculateMileageDeduction } from '../utils/helpers';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [monthRange] = useState(getCurrentMonthRange());
  const [txnSummary, setTxnSummary] = useState({
    totalIncome: 0, totalBusinessExpenses: 0, totalPersonalExpenses: 0,
    byCategory: {} as Record<string, number>,
  });
  const [mileageSummary, setMileageSummary] = useState({ totalMiles: 0, tripCount: 0 });
  const [trackingStatus, setTrackingStatus] = useState(getTrackingStatus());
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  const loadData = useCallback(async () => {
    const [txn, mil, storage] = await Promise.all([
      getTransactionSummary(monthRange.start, monthRange.end),
      getMileageSummary(monthRange.start, monthRange.end),
      getStorageStats(),
    ]);
    setTxnSummary(txn);
    setMileageSummary(mil);
    setTrackingStatus(getTrackingStatus());
    setStorageStats(storage);
  }, [monthRange]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCleanup = () => {
    Alert.alert(
      'Clean Up Storage',
      'This will archive old trip route data to free up space. Trip summaries (distance, dates) are preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clean Up',
          onPress: async () => {
            const result = await forceCleanup();
            await loadData();
            Alert.alert(
              'Cleanup Complete',
              `Archived ${result.hotToWarm + result.warmToCold} trips, freed ${result.freedPoints} route points.`
            );
          },
        },
      ]
    );
  };

  const netIncome = txnSummary.totalIncome - txnSummary.totalBusinessExpenses;
  const mileageDeduction = calculateMileageDeduction(mileageSummary.totalMiles);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}
    >
      {/* Tracking status banner */}
      {trackingStatus.isTracking && (
        <View style={styles.trackingBanner}>
          <Text style={styles.trackingText}>
            Trip Active — {formatMiles(trackingStatus.currentDistanceMiles)}
          </Text>
        </View>
      )}

      <Text style={styles.header}>This Month</Text>

      {/* Income & Expenses */}
      <View style={styles.row}>
        <SummaryCard title="Income" value={formatCurrency(txnSummary.totalIncome)} color="#4CAF50" />
        <SummaryCard title="Business Exp." value={formatCurrency(txnSummary.totalBusinessExpenses)} color="#FF5722" />
      </View>
      <View style={styles.row}>
        <SummaryCard title="Personal Exp." value={formatCurrency(txnSummary.totalPersonalExpenses)} color="#FF9800" />
        <SummaryCard title="Net Income" value={formatCurrency(netIncome)} color={netIncome >= 0 ? '#4CAF50' : '#FF5722'} />
      </View>

      {/* Mileage */}
      <Text style={styles.sectionHeader}>Mileage</Text>
      <View style={styles.row}>
        <SummaryCard title="Miles Driven" value={formatMiles(mileageSummary.totalMiles)} color="#2196F3" />
        <SummaryCard title="Trips" value={String(mileageSummary.tripCount)} color="#2196F3" />
      </View>
      <View style={styles.deductionCard}>
        <Text style={styles.deductionLabel}>Estimated Mileage Deduction (IRS)</Text>
        <Text style={styles.deductionValue}>{formatCurrency(mileageDeduction)}</Text>
      </View>

      {/* Top categories */}
      {Object.keys(txnSummary.byCategory).length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Top Categories</Text>
          {Object.entries(txnSummary.byCategory)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([cat, amount]) => (
              <View key={cat} style={styles.categoryRow}>
                <Text style={styles.categoryName}>{cat.replace(/_/g, ' ')}</Text>
                <Text style={styles.categoryAmount}>{formatCurrency(amount)}</Text>
              </View>
            ))}
        </>
      )}

      {/* Storage Usage */}
      {storageStats && (
        <>
          <Text style={styles.sectionHeader}>Storage</Text>
          <View style={[styles.storageCard, storageStats.isOverThreshold && styles.storageWarning]}>
            <View style={styles.storageRow}>
              <View>
                <Text style={styles.storageLabel}>Database Size</Text>
                <Text style={styles.storageValue}>{storageStats.dbSizeMB} MB</Text>
              </View>
              <View>
                <Text style={styles.storageLabel}>Route Points</Text>
                <Text style={styles.storageValue}>{storageStats.totalRoutePoints.toLocaleString()}</Text>
              </View>
            </View>
            {storageStats.isOverThreshold && (
              <TouchableOpacity style={styles.cleanupBtn} onPress={handleCleanup}>
                <Text style={styles.cleanupBtnText}>Clean Up Old Data</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function SummaryCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  header: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 16 },
  sectionHeader: { fontSize: 18, fontWeight: '600', color: '#ccc', marginTop: 24, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#333',
  },
  cardTitle: { fontSize: 13, color: '#888', marginBottom: 6 },
  cardValue: { fontSize: 22, fontWeight: '700' },
  trackingBanner: {
    backgroundColor: '#1B5E20', borderRadius: 8, padding: 12, marginBottom: 16,
    alignItems: 'center',
  },
  trackingText: { color: '#4CAF50', fontWeight: '600', fontSize: 16 },
  deductionCard: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: '#2196F3',
  },
  deductionLabel: { color: '#888', fontSize: 14 },
  deductionValue: { color: '#2196F3', fontSize: 24, fontWeight: '700', marginTop: 8 },
  categoryRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  categoryName: { color: '#ccc', fontSize: 15, textTransform: 'capitalize' },
  categoryAmount: { color: '#fff', fontSize: 15, fontWeight: '600' },
  storageCard: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#333',
  },
  storageWarning: { borderColor: '#FF9800' },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between' },
  storageLabel: { color: '#888', fontSize: 13 },
  storageValue: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 4 },
  cleanupBtn: {
    backgroundColor: '#FF9800', borderRadius: 8, paddingVertical: 10, alignItems: 'center',
    marginTop: 12,
  },
  cleanupBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
