import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Transaction, TransactionType, TransactionCategory } from '../models/types';
import { getTransactions, updateTransaction, deleteTransaction } from '../services/database';
import { formatCurrency, formatDate } from '../utils/helpers';
import { TransactionsStackParamList } from '../navigation/AppNavigator';

type DetailRoute = RouteProp<TransactionsStackParamList, 'TransactionDetail'>;

export default function TransactionDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation();
  const [txn, setTxn] = useState<Transaction | null>(null);

  useEffect(() => {
    (async () => {
      const all = await getTransactions({ excludeDuplicates: false });
      const found = all.find((t) => t.id === route.params.transactionId);
      setTxn(found || null);
    })();
  }, [route.params.transactionId]);

  if (!txn) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  const toggleType = async () => {
    const newType: TransactionType = txn.type === 'business' ? 'personal' : 'business';
    await updateTransaction(txn.id, { type: newType });
    setTxn({ ...txn, type: newType });
  };

  const handleDelete = () => {
    Alert.alert('Delete Transaction', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(txn.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.description}>{txn.description}</Text>
      <Text style={[styles.amount, { color: txn.amount >= 0 ? '#4CAF50' : '#FF5722' }]}>
        {formatCurrency(txn.amount, txn.currency)}
      </Text>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Date</Text>
        <Text style={styles.detailValue}>{formatDate(txn.date)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Type</Text>
        <TouchableOpacity onPress={toggleType}>
          <Text style={[styles.detailValue, { color: '#4CAF50' }]}>
            {txn.type} (tap to change)
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Category</Text>
        <Text style={styles.detailValue}>{txn.category?.replace(/_/g, ' ') || 'Uncategorized'}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Import Source</Text>
        <Text style={styles.detailValue}>{txn.importSource.replace(/_/g, ' ')}</Text>
      </View>
      {txn.merchantName && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Merchant</Text>
          <Text style={styles.detailValue}>{txn.merchantName}</Text>
        </View>
      )}
      {txn.sourceReference && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Reference</Text>
          <Text style={styles.detailValue}>{txn.sourceReference}</Text>
        </View>
      )}
      {txn.notes && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Notes</Text>
          <Text style={styles.detailValue}>{txn.notes}</Text>
        </View>
      )}
      {txn.isDuplicate && (
        <View style={[styles.detailRow, { borderColor: '#FF9800' }]}>
          <Text style={[styles.detailLabel, { color: '#FF9800' }]}>Duplicate</Text>
          <Text style={[styles.detailValue, { color: '#FF9800' }]}>Flagged as duplicate</Text>
        </View>
      )}

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
        <Text style={styles.deleteBtnText}>Delete Transaction</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  loading: { color: '#888', textAlign: 'center', marginTop: 40 },
  description: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 8 },
  amount: { fontSize: 36, fontWeight: '700', marginBottom: 24 },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  detailLabel: { color: '#888', fontSize: 15 },
  detailValue: { color: '#fff', fontSize: 15, fontWeight: '500', textTransform: 'capitalize' },
  deleteBtn: {
    marginTop: 32, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#FF5722', alignItems: 'center',
  },
  deleteBtnText: { color: '#FF5722', fontSize: 16, fontWeight: '600' },
});
