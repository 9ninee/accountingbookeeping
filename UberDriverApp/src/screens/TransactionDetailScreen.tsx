import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Transaction, TransactionType } from '../models/types';
import { getTransactions, updateTransaction, deleteTransaction } from '../services/database';
import { formatCurrency, formatDate } from '../utils/helpers';
import { TransactionsStackParamList } from '../navigation/AppNavigator';
import { Colors } from '../theme/colors';

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

  const isBusiness = txn.type === 'business';
  const isIncome = txn.amount >= 0;

  const toggleType = async () => {
    const newType: TransactionType = txn.type === 'business' ? 'personal' : 'business';
    await updateTransaction(txn.id, { type: newType });
    setTxn({ ...txn, type: newType });
  };

  const handleDelete = () => {
    Alert.alert('Delete Transaction', 'Are you sure? This action cannot be undone.', [
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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.description}>{txn.description}</Text>
        <Text style={[styles.amount, { color: isIncome ? Colors.primary : Colors.error }]}>
          {isIncome ? '+' : ''}{formatCurrency(txn.amount, txn.currency)}
        </Text>
        <View style={styles.headerMeta}>
          <View style={[
            styles.typeBadge,
            { backgroundColor: isBusiness ? Colors.primary + '1A' : Colors.tertiary + '1A' },
          ]}>
            <Text style={[styles.typeBadgeText, { color: isBusiness ? Colors.primary : Colors.tertiary }]}>
              {isBusiness ? 'Business' : 'Personal'}
            </Text>
          </View>
          {txn.validationStatus === 'verified' && (
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: Colors.primary }]} />
              <Text style={[styles.statusText, { color: Colors.primary }]}>Verified</Text>
            </View>
          )}
          {txn.validationStatus === 'conflict' && (
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: Colors.error }]} />
              <Text style={[styles.statusText, { color: Colors.error }]}>Conflict</Text>
            </View>
          )}
        </View>
      </View>

      {/* Details */}
      <View style={styles.detailsCard}>
        <DetailRow label="Date" value={formatDate(txn.date)} />
        <DetailRow
          label="Type"
          value={txn.type}
          onPress={toggleType}
          actionText="tap to change"
          valueColor={Colors.primary}
        />
        <DetailRow
          label="Category"
          value={txn.category?.replace(/_/g, ' ') || 'Uncategorized'}
        />
        <DetailRow
          label="Import Source"
          value={txn.importSource.replace(/_/g, ' ')}
        />
        {txn.merchantName && (
          <DetailRow label="Merchant" value={txn.merchantName} />
        )}
        {txn.sourceReference && (
          <DetailRow label="Reference" value={txn.sourceReference} />
        )}
        {txn.notes && (
          <DetailRow label="Notes" value={txn.notes} />
        )}
        <DetailRow
          label="Transaction ID"
          value={`#${txn.id.slice(0, 12).toUpperCase()}`}
          valueColor={Colors.onSurfaceVariant + '99'}
        />
      </View>

      {/* Duplicate Warning */}
      {txn.isDuplicate && (
        <View style={styles.duplicateWarning}>
          <Text style={styles.duplicateIcon}>!</Text>
          <View>
            <Text style={styles.duplicateTitle}>Flagged as Duplicate</Text>
            <Text style={styles.duplicateText}>
              This transaction matches an existing record and was auto-flagged.
            </Text>
          </View>
        </View>
      )}

      {/* Delete Button */}
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
        <Text style={styles.deleteBtnText}>Delete Transaction</Text>
      </TouchableOpacity>
      <Text style={styles.deleteWarning}>
        This action cannot be undone.
      </Text>
    </ScrollView>
  );
}

function DetailRow({
  label, value, onPress, actionText, valueColor,
}: {
  label: string; value: string; onPress?: () => void; actionText?: string; valueColor?: string;
}) {
  const ValueComponent = onPress ? TouchableOpacity : View;
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <ValueComponent onPress={onPress}>
        <Text style={[detailStyles.value, valueColor ? { color: valueColor } : {}]}>
          {value} {actionText ? `(${actionText})` : ''}
        </Text>
      </ValueComponent>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant + '1A',
  },
  label: { fontSize: 14, color: Colors.onSurfaceVariant, fontWeight: '500' },
  value: {
    fontSize: 14, color: Colors.onSurface, fontWeight: '600', textTransform: 'capitalize',
    maxWidth: 200, textAlign: 'right',
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  loading: { color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 40 },

  // Header
  headerCard: {
    backgroundColor: Colors.surfaceContainer, borderRadius: 20, padding: 24, marginTop: 8,
  },
  description: { fontSize: 22, fontWeight: '700', color: Colors.onSurface, marginBottom: 8 },
  amount: { fontSize: 36, fontWeight: '800', marginBottom: 16 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },

  // Details
  detailsCard: {
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 20, padding: 20, marginTop: 12,
  },

  // Duplicate
  duplicateWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.tertiary + '1A', borderRadius: 16, padding: 20, marginTop: 12,
    borderWidth: 1, borderColor: Colors.tertiary + '33',
  },
  duplicateIcon: {
    fontSize: 24, fontWeight: '700', color: Colors.tertiary,
    width: 40, height: 40, textAlign: 'center', lineHeight: 40,
    borderRadius: 20, backgroundColor: Colors.tertiary + '33',
  },
  duplicateTitle: { fontSize: 14, fontWeight: '700', color: Colors.tertiary, marginBottom: 2 },
  duplicateText: { fontSize: 12, color: Colors.onSurfaceVariant },

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
