import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getTransactionSummary, getMileageSummary } from '../services/database';
import { getTrackingStatus } from '../services/mileageTracker';
import { getStorageStats, forceCleanup, StorageStats } from '../services/storageManager';
import { formatCurrency, formatMiles, getCurrentMonthRange, calculateMileageDeduction } from '../utils/helpers';
import { Colors } from '../theme/colors';

const CATEGORY_ICONS: Record<string, string> = {
  fuel: 'F',
  vehicle_maintenance: 'M',
  food_drink: 'D',
  tolls_parking: 'T',
  insurance: 'I',
};

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
  const expenseRatio = txnSummary.totalIncome > 0
    ? Math.min((txnSummary.totalBusinessExpenses / txnSummary.totalIncome) * 100, 100)
    : 0;

  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Trip Active Banner */}
      {trackingStatus.isTracking && (
        <View style={styles.trackingBanner}>
          <View style={styles.trackingLeft}>
            <View style={styles.pulseIndicator} />
            <Text style={styles.trackingLabel}>TRIP ACTIVE</Text>
          </View>
          <Text style={styles.trackingDistance}>
            {formatMiles(trackingStatus.currentDistanceMiles)}
          </Text>
        </View>
      )}

      {/* Monthly Summary Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Monthly Summary</Text>
        <Text style={styles.sectionSubtitle}>{monthLabel.toUpperCase()}</Text>
      </View>

      {/* Bento Grid */}
      <View style={styles.bentoGrid}>
        {/* Income */}
        <View style={styles.bentoCard}>
          <View style={styles.bentoCardGlow} />
          <Text style={styles.bentoLabel}>Income</Text>
          <Text style={[styles.bentoValue, { color: Colors.primary }]}>
            {formatCurrency(txnSummary.totalIncome)}
          </Text>
          <View style={styles.bentoTrend}>
            <Text style={styles.trendText}>This month</Text>
          </View>
        </View>

        {/* Business Expenses */}
        <View style={[styles.bentoCard, styles.bentoCardBordered, { borderLeftColor: Colors.error + '80' }]}>
          <Text style={styles.bentoLabel}>Business Exp.</Text>
          <Text style={[styles.bentoValue, { color: Colors.error }]}>
            {formatCurrency(txnSummary.totalBusinessExpenses)}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${expenseRatio}%`, backgroundColor: Colors.error }]} />
          </View>
        </View>

        {/* Personal Expenses */}
        <View style={[styles.bentoCard, styles.bentoCardBordered, { borderLeftColor: Colors.tertiary + '80' }]}>
          <Text style={styles.bentoLabel}>Personal Exp.</Text>
          <Text style={[styles.bentoValue, { color: Colors.tertiary }]}>
            {formatCurrency(txnSummary.totalPersonalExpenses)}
          </Text>
          <Text style={[styles.bentoTrendText, { color: Colors.tertiary + 'CC' }]}>Within Budget</Text>
        </View>

        {/* Net Profit */}
        <View style={[styles.bentoCard, styles.netProfitCard]}>
          <Text style={[styles.bentoLabel, { color: Colors.primary }]}>Net Profit</Text>
          <Text style={[styles.bentoValue, { color: Colors.onSurface }]}>
            {formatCurrency(netIncome)}
          </Text>
          <View style={styles.bentoTrend}>
            <Text style={[styles.trendText, { color: Colors.primary, fontWeight: '700' }]}>
              Ready to Transfer
            </Text>
          </View>
        </View>
      </View>

      {/* Telemetry & Mileage */}
      <Text style={styles.sectionTitle}>Telemetry & Mileage</Text>
      <View style={styles.mileageRow}>
        <View style={styles.mileageCard}>
          <Text style={styles.mileageCardLabel}>TOTAL MILES</Text>
          <Text style={styles.mileageCardValue}>{mileageSummary.totalMiles.toFixed(1)}</Text>
        </View>
        <View style={styles.mileageCard}>
          <Text style={[styles.mileageCardLabel, { color: Colors.secondary }]}>TRIP COUNT</Text>
          <Text style={[styles.mileageCardValue, { color: Colors.secondary }]}>{mileageSummary.tripCount}</Text>
        </View>
      </View>

      {/* IRS Deduction Card */}
      <View style={styles.irsCard}>
        <View style={styles.irsLeft}>
          <View style={styles.irsIconWrap}>
            <Text style={styles.irsIcon}>$</Text>
          </View>
          <View>
            <Text style={styles.irsTitle}>IRS Mileage Deduction</Text>
            <Text style={styles.irsSubtitle}>Estimated tax savings for 2024</Text>
          </View>
        </View>
        <Text style={styles.irsValue}>{formatCurrency(mileageDeduction)}</Text>
      </View>

      {/* Top Categories */}
      {Object.keys(txnSummary.byCategory).length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Categories</Text>
            <Text style={styles.viewAll}>View All</Text>
          </View>
          {Object.entries(txnSummary.byCategory)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([cat, amount]) => (
              <View key={cat} style={styles.categoryRow}>
                <View style={styles.categoryLeft}>
                  <View style={styles.categoryIconWrap}>
                    <Text style={styles.categoryIcon}>
                      {CATEGORY_ICONS[cat] || cat[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.categoryName}>{cat.replace(/_/g, ' ')}</Text>
                </View>
                <Text style={styles.categoryAmount}>{formatCurrency(amount)}</Text>
              </View>
            ))}
        </>
      )}

      {/* System Health */}
      {storageStats && (
        <View style={styles.systemCard}>
          <Text style={styles.systemTitle}>System Health</Text>
          <View style={styles.systemStatsRow}>
            <View>
              <Text style={styles.systemStatLabel}>DATABASE SIZE</Text>
              <View style={styles.systemStatValueRow}>
                <Text style={styles.systemStatValue}>{storageStats.dbSizeMB}</Text>
                <Text style={styles.systemStatUnit}>MB</Text>
              </View>
            </View>
            <View>
              <Text style={styles.systemStatLabel}>ROUTE POINTS</Text>
              <View style={styles.systemStatValueRow}>
                <Text style={styles.systemStatValue}>
                  {(storageStats.totalRoutePoints / 1000).toFixed(1)}
                </Text>
                <Text style={styles.systemStatUnit}>K</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.cleanupBtn} onPress={handleCleanup}>
            <Text style={styles.cleanupBtnText}>CLEAN UP OLD DATA</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 20 },

  // Tracking Banner
  trackingBanner: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  trackingLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pulseIndicator: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.onPrimary,
  },
  trackingLabel: {
    color: Colors.onPrimary, fontWeight: '700', fontSize: 13,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  trackingDistance: {
    color: Colors.onPrimary, fontWeight: '800', fontSize: 14,
  },

  // Section Headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20, fontWeight: '700', color: Colors.onSurface,
    marginTop: 16, marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 11, fontWeight: '600', color: Colors.onSurfaceVariant,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  viewAll: {
    fontSize: 12, fontWeight: '700', color: Colors.secondary,
  },

  // Bento Grid
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bentoCard: {
    width: '48%',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 16,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  bentoCardBordered: {
    borderLeftWidth: 4,
  },
  bentoCardGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 64,
    height: 64,
    borderBottomLeftRadius: 64,
    backgroundColor: Colors.primary + '0D',
  },
  netProfitCard: {
    backgroundColor: Colors.primary + '1A',
    borderWidth: 1,
    borderColor: Colors.primary + '33',
  },
  bentoLabel: {
    fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, marginBottom: 8,
  },
  bentoValue: {
    fontSize: 24, fontWeight: '700',
  },
  bentoTrend: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12,
  },
  trendText: {
    fontSize: 10, color: Colors.primary + 'CC',
  },
  bentoTrendText: {
    fontSize: 10, marginTop: 12, fontWeight: '500',
  },
  progressTrack: {
    width: '100%', height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceContainerHighest, marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 2,
  },

  // Mileage
  mileageRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  mileageCard: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: 16, padding: 16,
  },
  mileageCardLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  mileageCardValue: {
    fontSize: 22, fontWeight: '700', color: Colors.onSurface, marginTop: 6,
  },

  // IRS Card
  irsCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.secondary + '4D',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  irsLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  irsIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.secondary + '1A',
    justifyContent: 'center', alignItems: 'center',
  },
  irsIcon: { fontSize: 20, fontWeight: '700', color: Colors.secondary },
  irsTitle: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  irsSubtitle: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  irsValue: { fontSize: 18, fontWeight: '700', color: Colors.secondary },

  // Categories
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center',
  },
  categoryIcon: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  categoryName: {
    fontSize: 14, fontWeight: '600', color: Colors.onSurface,
    textTransform: 'capitalize',
  },
  categoryAmount: { fontSize: 14, fontWeight: '700', color: Colors.error },

  // System Health
  systemCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 20,
    padding: 24,
    marginTop: 24,
  },
  systemTitle: {
    fontSize: 18, fontWeight: '700', color: Colors.onSurface, marginBottom: 16,
  },
  systemStatsRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20,
  },
  systemStatLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  systemStatValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  systemStatValue: { fontSize: 28, fontWeight: '800', color: Colors.onSurface },
  systemStatUnit: { fontSize: 12, color: Colors.onSurfaceVariant },
  cleanupBtn: {
    backgroundColor: Colors.tertiary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.tertiary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  cleanupBtnText: {
    color: Colors.onTertiary, fontSize: 14, fontWeight: '700', letterSpacing: 1,
  },
});
