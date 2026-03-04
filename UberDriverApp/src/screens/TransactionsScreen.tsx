import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Transaction, TransactionType } from '../models/types';
import { getTransactions } from '../services/database';
import { formatCurrency, formatDate } from '../utils/helpers';
import { TransactionsStackParamList } from '../navigation/AppNavigator';

type TxnNav = NativeStackNavigationProp<TransactionsStackParamList, 'TransactionsList'>;

export default function TransactionsScreen() {
  const navigation = useNavigation<TxnNav>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const data = await getTransactions(
      filter === 'all' ? undefined : { type: filter }
    );
    setTransactions(data);
  }, [filter]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <TouchableOpacity
      style={styles.txnCard}
      onPress={() => navigation.navigate('TransactionDetail', { transactionId: item.id })}
    >
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
      <Text style={styles.txnSource}>{item.importSource.replace(/_/g, ' ')}</Text>
    </TouchableOpacity>
  );

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
        renderItem={renderTransaction}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}
        contentContainerStyle={{ paddingBottom: 20 }}
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
  txnSource: { color: '#555', fontSize: 11, marginTop: 6, textTransform: 'capitalize' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 60, fontSize: 15, paddingHorizontal: 40 },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
});
