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

type TxnNav = NativeStackNavigationProp<TransactionsStackParamList, 'TransactionsList'>;

const PAGE_SIZE = 50;
const ITEM_HEIGHT = 88; // approximate fixed height for getItemLayout

const TransactionItem = React.memo(({ item, onPress }: { item: Transaction; onPress: () => void }) => (
  <TouchableOpacity style={styles.txnCard} onPress={onPress}>
    <View style={styles.txnRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.txnDesc} numberOfLines={1}>{item.description}</Text>
        <View style={styles.txnMeta}>
          <Text style={styles.txnDate}>{formatDate(item.date)}</Text>
          <View style={[styles.typeBadge, item.type === 'business' ? styles.bizBadge : styles.persBadge]}>
            <Text style={styles.typeBadgeText}>{item.type === 'business' ? 'BIZ' : 'PER'}</Text>
          </View>
          {item.category && (
            <Text style={styles.txnCategory}>{item.category.replace(/_/g, ' ')}</Text>
          )}
        </View>
      </View>
      <Text style={[styles.txnAmount, { color: item.amount >= 0 ? '#4CAF50' : '#FF5722' }]}>
        {formatCurrency(item.amount, item.currency)}
      </Text>
    </View>
    <View style={styles.txnFooter}>
      <Text style={styles.txnSource}>{item.importSource.replace(/_/g, ' ')}</Text>
      {item.validationStatus === 'verified' && (
        <Text style={styles.verifiedBadge}>Verified</Text>
      )}
      {item.validationStatus === 'conflict' && (
        <Text style={styles.conflictBadge}>Conflict</Text>
      )}
    </View>
  </TouchableOpacity>
));

export default function TransactionsScreen() {
  const navigation = useNavigation<TxnNav>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadData = useCallback(async (reset = true) => {
    const newOffset = reset ? 0 : offset;
    const result = await getTransactionsPaginated(
      filter === 'all' ? undefined : { type: filter },
      { limit: PAGE_SIZE, offset: newOffset }
    );

    if (reset) {
      setTransactions(result.data);
    } else {
      setTransactions((prev) => [...prev, ...result.data]);
    }
    setHasMore(result.hasMore);
    setOffset(newOffset + result.data.length);
  }, [filter, offset]);

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

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color="#4CAF50" />
        <Text style={styles.footerText}>Loading more...</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
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

      {/* Transaction list */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionItem
            item={item}
            onPress={() => navigation.navigate('TransactionDetail', { transactionId: item.id })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}
        contentContainerStyle={{ paddingBottom: 80 }}
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
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  filterTab: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#333',
  },
  filterTabActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  filterText: { color: '#888', fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  txnCard: {
    backgroundColor: '#1a1a2e', marginHorizontal: 12, marginBottom: 8,
    borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#333',
  },
  txnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  txnDesc: { color: '#fff', fontSize: 15, fontWeight: '500', marginBottom: 6 },
  txnMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  txnDate: { color: '#888', fontSize: 13 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  bizBadge: { backgroundColor: '#1B5E2033' },
  persBadge: { backgroundColor: '#FF980033' },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: '#ccc' },
  txnCategory: { color: '#666', fontSize: 12, textTransform: 'capitalize' },
  txnAmount: { fontSize: 17, fontWeight: '700', marginLeft: 8 },
  txnFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  txnSource: { color: '#555', fontSize: 11, textTransform: 'capitalize' },
  verifiedBadge: { color: '#4CAF50', fontSize: 11, fontWeight: '600' },
  conflictBadge: { color: '#FF5722', fontSize: 11, fontWeight: '600' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 60, fontSize: 15, paddingHorizontal: 40 },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  footerLoader: { padding: 16, alignItems: 'center' },
  footerText: { color: '#888', fontSize: 12, marginTop: 4 },
});
