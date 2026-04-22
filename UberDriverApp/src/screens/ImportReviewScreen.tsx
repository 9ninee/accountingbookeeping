import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ImportReviewResult, ImportReviewItem, Transaction } from '../models/types';
import { insertTransactionBatch } from '../services/database';
import { formatCurrency, formatDate } from '../utils/helpers';
import { ImportStackParamList } from '../navigation/AppNavigator';
import { Colors } from '../theme/colors';
import { Fonts } from '../theme/typography';

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
    badgeLabel: string,
    section: 'new' | 'duplicate' | 'conflict'
  ) => (
    <TouchableOpacity
      style={styles.summaryCard}
      onPress={() => setExpandedSection(expandedSection === section ? null : section)}
      activeOpacity={0.7}
    >
      <View style={styles.summaryCardTop}>
        <Text style={[styles.summaryIcon, { color }]}>
          {section === 'new' ? '+' : section === 'duplicate' ? '=' : '!'}
        </Text>
        <View style={[styles.summaryBadge, { backgroundColor: color + '1A' }]}>
          <Text style={[styles.summaryBadgeText, { color }]}>{badgeLabel}</Text>
        </View>
      </View>
      <Text style={styles.summaryCount}>{count}</Text>
      <Text style={styles.summaryLabel}>{title}</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item, index }: { item: ImportReviewItem; index: number }) => (
    <View style={[styles.itemCard, { borderWidth: 1, borderColor: Colors.outlineVariant + '1A' }]}>
      <View style={styles.itemRow}>
        <View style={styles.itemLeft}>
          <View style={[styles.itemIconWrap, {
            backgroundColor: item.status === 'conflict' ? Colors.error + '1A' :
              item.status === 'duplicate' ? Colors.tertiary + '1A' : Colors.primary + '1A',
          }]}>
            <Text style={[styles.itemIconText, {
              color: item.status === 'conflict' ? Colors.error :
                item.status === 'duplicate' ? Colors.tertiary : Colors.primary,
            }]}>
              {item.status === 'conflict' ? '!' : item.status === 'duplicate' ? 'D' : 'N'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemDesc} numberOfLines={1}>
              {item.transaction.description || 'Unknown'}
            </Text>
            <Text style={styles.itemMeta}>
              {formatDate(item.transaction.date || '')} {item.transaction.importSource ? `\u2022 ${item.transaction.importSource.replace(/_/g, ' ')}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.itemAmountWrap}>
          <Text style={[styles.itemAmount, {
            color: (item.transaction.amount ?? 0) >= 0 ? Colors.primary : Colors.error,
          }]}>
            {formatCurrency(item.transaction.amount ?? 0)}
          </Text>
          {item.status === 'conflict' && (
            <Text style={styles.conflictLabel}>
              {item.conflictDetails?.includes('Amount') ? 'AMOUNT MISMATCH' : 'NEEDS REVIEW'}
            </Text>
          )}
        </View>
      </View>

      {item.status === 'duplicate' && item.duplicateMatch && (
        <View style={styles.dupInfo}>
          <Text style={styles.dupReason}>
            {item.duplicateMatch.reason} ({Math.round(item.duplicateMatch.confidence * 100)}% confidence)
          </Text>
        </View>
      )}

      {item.status === 'conflict' && (
        <View style={styles.conflictActions}>
          <View style={styles.conflictButtons}>
            <TouchableOpacity
              style={[styles.conflictBtn, styles.rejectBtn, item.userAction === 'reject' && styles.rejectBtnActive]}
              onPress={() => handleConflictAction(index, 'reject')}
            >
              <Text style={styles.conflictBtnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.conflictBtn, styles.acceptBtn, item.userAction === 'accept' && styles.acceptBtnActive]}
              onPress={() => handleConflictAction(index, 'accept')}
            >
              <Text style={styles.conflictBtnText}>Accept</Text>
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
      {/* Header */}
      <Text style={styles.header}>Import Review</Text>
      <Text style={styles.subtitle}>Review before committing to database.</Text>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        {renderSummaryCard('Ready for import', reviewResult.summary.newCount, Colors.primary, 'New', 'new')}
        {renderSummaryCard('Auto-skipped', reviewResult.summary.duplicateCount, Colors.tertiary, 'Duplicates', 'duplicate')}
        {renderSummaryCard('Manual action required', reviewResult.summary.conflictCount, Colors.error, 'Conflicts', 'conflict')}
      </View>

      {/* Expanded Section */}
      {expandedSection && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {expandedSection === 'new' ? 'New Transactions' :
                expandedSection === 'duplicate' ? 'Potential Duplicates' : 'Conflicts'}
            </Text>
            {expandedSection === 'conflict' && conflictItems.length > 0 && (
              <View style={styles.actionBadge}>
                <Text style={styles.actionBadgeText}>Action Required</Text>
              </View>
            )}
          </View>
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
        </>
      )}

      {/* Bottom Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, committing && styles.disabledBtn]}
          onPress={handleConfirmImport}
          disabled={committing}
          activeOpacity={0.85}
        >
          {committing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.confirmBtnInner}>
              <Text style={styles.confirmBtnText}>Confirm Import</Text>
              <View style={styles.confirmCount}>
                <Text style={styles.confirmCountText}>{newItems.length}</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16, paddingTop: 8 },
  header: { fontSize: 32, fontFamily: Fonts.extraBold, color: Colors.onSurface, marginBottom: 4 },
  subtitle: { color: Colors.onSurfaceVariant, fontSize: 16, fontFamily: Fonts.regular, marginBottom: 24 },

  // Summary Cards
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: 16, padding: 20,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12,
    elevation: 6,
  },
  summaryCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  summaryIcon: { fontSize: 20, fontFamily: Fonts.bold },
  summaryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  summaryBadgeText: { fontSize: 10, fontFamily: Fonts.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryCount: { fontSize: 28, fontFamily: Fonts.monoBold, color: Colors.onSurface },
  summaryLabel: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.onSurfaceVariant, marginTop: 4 },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.onSurface },
  actionBadge: { backgroundColor: Colors.error, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  actionBadgeText: { color: Colors.onError, fontSize: 10, fontFamily: Fonts.bold },

  // Items
  itemList: { flex: 1, marginBottom: 12 },
  itemCard: {
    backgroundColor: Colors.surfaceContainer, borderRadius: 16, padding: 20, marginBottom: 10,
    overflow: 'hidden',
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemLeft: { flexDirection: 'row', gap: 14, flex: 1 },
  itemIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  itemIconText: { fontSize: 18, fontFamily: Fonts.bold },
  itemDesc: { color: Colors.onSurface, fontSize: 15, fontFamily: Fonts.semiBold, marginBottom: 4 },
  itemMeta: { color: Colors.onSurfaceVariant, fontSize: 12, fontFamily: Fonts.regular },
  itemAmountWrap: { alignItems: 'flex-end' },
  itemAmount: { fontSize: 18, fontFamily: Fonts.monoBold },
  conflictLabel: {
    fontSize: 10, fontFamily: Fonts.bold, color: Colors.error,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },

  // Duplicate
  dupInfo: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.outlineVariant + '1A' },
  dupReason: { color: Colors.tertiary, fontSize: 12, fontFamily: Fonts.regular, fontStyle: 'italic' },

  // Conflict
  conflictActions: { marginTop: 12 },
  conflictButtons: { flexDirection: 'row', gap: 8 },
  conflictBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
  },
  rejectBtn: { backgroundColor: Colors.surfaceContainerHigh },
  rejectBtnActive: { backgroundColor: Colors.errorContainer },
  acceptBtn: { backgroundColor: Colors.primary },
  acceptBtnActive: { backgroundColor: Colors.primary },
  conflictBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semiBold },

  // Empty
  emptyText: { color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 30, fontFamily: Fonts.regular },

  // Action Bar
  actionBar: {
    flexDirection: 'row', gap: 12, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: Colors.outlineVariant + '1A',
  },
  cancelBtn: {
    paddingVertical: 14, paddingHorizontal: 24, borderRadius: 16, alignItems: 'center',
  },
  cancelBtnText: { color: Colors.onSurfaceVariant, fontSize: 16, fontFamily: Fonts.semiBold },
  confirmBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center',
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20,
    elevation: 8,
  },
  confirmBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmBtnText: { color: Colors.onPrimary, fontSize: 16, fontFamily: Fonts.bold },
  confirmCount: {
    backgroundColor: Colors.onPrimary + '33', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
  },
  confirmCountText: { color: Colors.onPrimary, fontSize: 12, fontFamily: Fonts.monoBold },
  disabledBtn: { opacity: 0.5 },
});
