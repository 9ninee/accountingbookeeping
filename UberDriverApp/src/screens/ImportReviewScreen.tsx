import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ImportReviewResult, ImportReviewItem, Transaction } from '../models/types';
import { insertTransactionBatch } from '../services/database';
import { formatCurrency, formatDate } from '../utils/helpers';
import { ImportStackParamList } from '../navigation/AppNavigator';

type ReviewRoute = RouteProp<ImportStackParamList, 'ImportReview'>;

export default function ImportReviewScreen() {
  const navigation = useNavigation();
  const route = useRoute<ReviewRoute>();
  const { reviewResult } = route.params;

  const [items, setItems] = useState<ImportReviewItem[]>(reviewResult.items);
  const [committing, setCommitting] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'new' | 'duplicate' | 'conflict' | null>(null);

  const newItems = items.filter((i) => i.status === 'new' || (i.status === 'conflict' && i.userAction === 'accept'));
  const dupItems = items.filter((i) => i.status === 'duplicate');
  const conflictItems = items.filter((i) => i.status === 'conflict' && i.userAction !== 'accept');

  const handleConflictAction = (index: number, action: 'accept' | 'reject') => {
    setItems((prev) => {
      const updated = [...prev];
      const itemIdx = prev.findIndex((item, idx) => item.status === 'conflict' && idx === index);
      if (itemIdx >= 0) {
        updated[itemIdx] = { ...updated[itemIdx], userAction: action };
      }
      return updated;
    });
  };

  const handleConfirmImport = async () => {
    setCommitting(true);
    try {
      const toInsert = items
        .filter((i) => i.status === 'new' || (i.status === 'conflict' && i.userAction === 'accept'))
        .map((i) => i.transaction as Transaction);

      if (toInsert.length === 0) {
        Alert.alert('Nothing to Import', 'All transactions are duplicates or rejected.');
        setCommitting(false);
        return;
      }

      const result = await insertTransactionBatch(toInsert);
      Alert.alert(
        'Import Complete',
        `${result.inserted} transactions imported successfully.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setCommitting(false);
  };

  const renderSummaryCard = (
    title: string,
    count: number,
    color: string,
    section: 'new' | 'duplicate' | 'conflict'
  ) => (
    <TouchableOpacity
      style={[styles.summaryCard, { borderColor: color }]}
      onPress={() => setExpandedSection(expandedSection === section ? null : section)}
    >
      <Text style={[styles.summaryCount, { color }]}>{count}</Text>
      <Text style={styles.summaryLabel}>{title}</Text>
      <Text style={styles.expandIcon}>{expandedSection === section ? '▼' : '▶'}</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item, index }: { item: ImportReviewItem; index: number }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemDesc} numberOfLines={1}>
            {item.transaction.description || 'Unknown'}
          </Text>
          <Text style={styles.itemMeta}>
            {formatDate(item.transaction.date || '')} · {item.transaction.importSource?.replace(/_/g, ' ')}
          </Text>
        </View>
        <Text style={[styles.itemAmount, {
          color: (item.transaction.amount ?? 0) >= 0 ? '#4CAF50' : '#FF5722',
        }]}>
          {formatCurrency(item.transaction.amount ?? 0)}
        </Text>
      </View>
      {item.status === 'duplicate' && item.duplicateMatch && (
        <Text style={styles.dupReason}>
          {item.duplicateMatch.reason} ({Math.round(item.duplicateMatch.confidence * 100)}% match)
        </Text>
      )}
      {item.status === 'conflict' && (
        <View style={styles.conflictActions}>
          <Text style={styles.conflictText}>{item.conflictDetails || 'Needs review'}</Text>
          <View style={styles.conflictButtons}>
            <TouchableOpacity
              style={[styles.conflictBtn, item.userAction === 'accept' && styles.acceptBtn]}
              onPress={() => handleConflictAction(index, 'accept')}
            >
              <Text style={styles.conflictBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.conflictBtn, item.userAction === 'reject' && styles.rejectBtn]}
              onPress={() => handleConflictAction(index, 'reject')}
            >
              <Text style={styles.conflictBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const getExpandedData = (): ImportReviewItem[] => {
    switch (expandedSection) {
      case 'new': return items.filter((i) => i.status === 'new');
      case 'duplicate': return dupItems;
      case 'conflict': return conflictItems;
      default: return [];
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Import Review</Text>
      <Text style={styles.subtitle}>
        Review before committing to database
      </Text>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        {renderSummaryCard('New', reviewResult.summary.newCount, '#4CAF50', 'new')}
        {renderSummaryCard('Duplicates', reviewResult.summary.duplicateCount, '#FF9800', 'duplicate')}
        {renderSummaryCard('Conflicts', reviewResult.summary.conflictCount, '#FF5722', 'conflict')}
      </View>

      {/* Expanded section */}
      {expandedSection && (
        <FlatList
          data={getExpandedData()}
          keyExtractor={(_, idx) => `${expandedSection}-${idx}`}
          renderItem={renderItem}
          style={styles.itemList}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No items in this category</Text>
          }
        />
      )}

      {/* Action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, committing && styles.disabledBtn]}
          onPress={handleConfirmImport}
          disabled={committing}
        >
          {committing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmBtnText}>
              Confirm Import ({newItems.length})
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  header: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 4 },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1,
  },
  summaryCount: { fontSize: 28, fontWeight: '700' },
  summaryLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  expandIcon: { color: '#555', fontSize: 10, marginTop: 6 },
  itemList: { flex: 1, marginBottom: 12 },
  itemCard: {
    backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#333',
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemDesc: { color: '#fff', fontSize: 15, fontWeight: '500', marginBottom: 4 },
  itemMeta: { color: '#888', fontSize: 12 },
  itemAmount: { fontSize: 16, fontWeight: '700', marginLeft: 8 },
  dupReason: { color: '#FF9800', fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  conflictActions: { marginTop: 8 },
  conflictText: { color: '#FF5722', fontSize: 12, marginBottom: 8 },
  conflictButtons: { flexDirection: 'row', gap: 8 },
  conflictBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center',
    backgroundColor: '#333',
  },
  acceptBtn: { backgroundColor: '#1B5E20' },
  rejectBtn: { backgroundColor: '#B71C1C' },
  conflictBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 30 },
  actionBar: {
    flexDirection: 'row', gap: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#333',
  },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#333',
  },
  cancelBtnText: { color: '#ccc', fontSize: 16, fontWeight: '600' },
  confirmBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#4CAF50',
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabledBtn: { opacity: 0.5 },
});
