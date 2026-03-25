import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Transaction, TransactionType } from '../models/types';
import { getTransactionsPaginated } from '../services/database';
import { formatCurrency, formatDate } from '../utils/helpers';
import { TransactionsStackParamList } from '../navigation/AppNavigator';
import { Colors } from '../theme/colors';

type TxnNav = NativeStackNavigationProp<TransactionsStackParamList, 'TransactionsList'>;

const PAGE_SIZE = 50;
const ITEM_HEIGHT = 120;

const TransactionItem = React.memo(({ item, onPress }: { item: Transaction; onPress: () => void }) => {
  const isBusiness = item.type === 'business';
  const isIncome = item.amount >= 0;
  const borderColor = isBusiness ? Colors.primary : Colors.tertiary;

  return (
    <TouchableOpacity
      style={[styles.txnCard, { borderLeftColor: borderColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.txnTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.txnDesc} numberOfLines={1}>{item.description}</Text>
          <View style={styles.txnMeta}>
            <View style={[
              styles.typeBadge,
              { backgroundColor: isBusiness ? Colors.primary + '1A' : Colors.tertiary + '1A' },
            ]}>
              <Text style={[
                styles.typeBadgeText,
                { color: isBusiness ? Colors.primary : Colors.tertiary },
              ]}>
                {isBusiness ? 'BIZ' : 'PER'}
              </Text>
            </View>
            <Text style={styles.txnDate}>
              {formatDate(item.date)} {item.category ? `\u2022 ${item.category.replace(/_/g, ' ')}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.txnAmountWrap}>
          <Text style={[styles.txnAmount, { color: isIncome ? Colors.primary : Colors.error }]}>
            {isIncome ? '+' : ''}{formatCurrency(item.amount, item.currency)}
          </Text>
          <View style={styles.validationRow}>
            {item.validationStatus === 'verified' && (
              <>
                <View style={[styles.statusDot, { backgroundColor: Colors.primary }]} />
                <Text style={[styles.statusText, { color: Colors.primary }]}>Verified</Text>
              </>
            )}
            {item.validationStatus === 'conflict' && (
              <>
                <View style={[styles.statusDot, { backgroundColor: Colors.error }]} />
                <Text style={[styles.statusText, { color: Colors.error }]}>Conflict</Text>
              </>
            )}
          </View>
        </View>
      </View>
      <View style={styles.txnFooter}>
        <View style={styles.txnSourceRow}>
          <Text style={styles.txnSourceIcon}>
            {item.importSource === 'bank_sync' ? 'B' : item.importSource === 'csv_import' ? 'C' : 'M'}
          </Text>
          <Text style={styles.txnSource}>{item.importSource.replace(/_/g, ' ')}</Text>
        </View>
        <Text style={styles.txnRef}>#{item.id.slice(0, 8).toUpperCase()}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function TransactionsScreen() {
  const navigation = useNavigation<TxnNav>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadInitial = useCallback(async () => {
    const result = await getTransactionsPaginated(
      filter === 'all' ? undefined : { type: filter },
      { limit: PAGE_SIZE, offset: 0 }
    );
    setTransactions(result.data);
    setHasMore(result.hasMore);
    setOffset(result.data.length);
  }, [filter]);

  useFocusEffect(useCallback(() => { loadInitial(); }, [loadInitial]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitial();
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const result = await getTransactionsPaginated(
      filter === 'all' ? undefined : { type: filter },
      { limit: PAGE_SIZE, offset }
    );
    setTransactions((prev) => [...prev, ...result.data]);
    setHasMore(result.hasMore);
    setOffset(offset + result.data.length);
    setLoadingMore(false);
  };

  const getItemLayout = (_: any, index: number) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  });

  const totalVolume = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={Colors.primary} size="small" />
        <Text style={styles.footerText}>FETCHING LEDGER DATA</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filterWrap}>
        <View style={styles.filterRow}>
          {(['all', 'business', 'personal'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, filter === f && styles.filterTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f === 'all' ? 'All' : f === 'business' ? 'Business' : 'Personal'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Header Stats */}
      <View style={styles.headerStats}>
        <View style={styles.headerStatsLeft}>
          <Text style={styles.volumeLabel}>MONTHLY VOLUME</Text>
          <Text style={styles.volumeValue}>{formatCurrency(totalVolume)}</Text>
        </View>
        <View style={styles.syncBadge}>
          <View style={styles.syncDot} />
          <Text style={styles.syncText}>LIVE SYNCING</Text>
        </View>
      </View>

      {/* Transaction List */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionItem
            item={item}
            onPress={() => navigation.navigate('TransactionDetail', { transactionId: item.id })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
        getItemLayout={getItemLayout}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No transactions yet. Add manually or import from the Import tab.</Text>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddTransaction')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Filter
  filterWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  filterRow: {
    flexDirection: 'row', gap: 4, padding: 4,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 24,
  },
  filterTab: {
    flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  filterText: { color: Colors.onSurfaceVariant, fontWeight: '600', fontSize: 14 },
  filterTextActive: { color: Colors.onPrimary, fontWeight: '700' },

  // Header Stats
  headerStats: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 20,
  },
  headerStatsLeft: {},
  volumeLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
  },
  volumeValue: { fontSize: 32, fontWeight: '700', color: Colors.primary },
  syncBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: Colors.outlineVariant + '1A',
  },
  syncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  syncText: {
    fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant, letterSpacing: 0.5,
  },

  // Transaction Card
  txnCard: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 16,
    padding: 20,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  txnTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  txnDesc: { color: Colors.onSurface, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  txnMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  txnDate: { color: Colors.onSurfaceVariant, fontSize: 12, fontWeight: '500' },
  txnAmountWrap: { alignItems: 'flex-end' },
  txnAmount: { fontSize: 20, fontWeight: '700' },
  validationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  txnFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.outlineVariant + '1A',
  },
  txnSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txnSourceIcon: { fontSize: 12, color: Colors.onSurfaceVariant },
  txnSource: {
    fontSize: 11, fontWeight: '500', color: Colors.onSurfaceVariant, fontStyle: 'italic',
  },
  txnRef: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant + '99' },

  // Empty & Footer
  emptyText: {
    color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 60,
    fontSize: 15, paddingHorizontal: 40,
  },
  footerLoader: { padding: 32, alignItems: 'center', gap: 8 },
  footerText: {
    fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant + '66',
    letterSpacing: 2,
  },

  // FAB
  fab: {
    position: 'absolute', bottom: 90, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
  fabText: { color: Colors.onPrimary, fontSize: 28, fontWeight: '700', marginTop: -2 },
});
