import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Transaction, TransactionType, TransactionCategory } from '../models/types';
import { insertTransaction } from '../services/database';
import { generateId } from '../utils/helpers';
import { Colors } from '../theme/colors';

const CATEGORIES: { label: string; value: TransactionCategory }[] = [
  { label: 'Fuel', value: 'fuel' },
  { label: 'Vehicle Maintenance', value: 'vehicle_maintenance' },
  { label: 'Insurance', value: 'insurance' },
  { label: 'Phone Bill', value: 'phone_bill' },
  { label: 'Food & Drink', value: 'food_drink' },
  { label: 'Tolls & Parking', value: 'tolls_parking' },
  { label: 'Car Wash', value: 'car_wash' },
  { label: 'Uber Fees', value: 'uber_fees' },
  { label: 'Supplies', value: 'supplies' },
  { label: 'Other Business', value: 'other_business' },
  { label: 'Groceries', value: 'groceries' },
  { label: 'Entertainment', value: 'entertainment' },
  { label: 'Rent / Mortgage', value: 'rent_mortgage' },
  { label: 'Utilities', value: 'utilities' },
  { label: 'Healthcare', value: 'healthcare' },
  { label: 'Subscriptions', value: 'subscriptions' },
  { label: 'Other Personal', value: 'other_personal' },
];

export default function AddTransactionScreen() {
  const navigation = useNavigation();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('business');
  const [category, setCategory] = useState<TransactionCategory | null>(null);
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    if (!description.trim()) {
      Alert.alert('Missing Info', 'Please enter a description.');
      return;
    }
    if (!amount.trim() || isNaN(parseFloat(amount))) {
      Alert.alert('Missing Info', 'Please enter a valid amount.');
      return;
    }

    const now = new Date().toISOString();
    const txn: Transaction = {
      id: generateId(),
      date: now.split('T')[0],
      description: description.trim(),
      amount: -Math.abs(parseFloat(amount)),
      currency: 'USD',
      type,
      category,
      importSource: 'manual',
      sourceReference: null,
      merchantName: null,
      notes: notes.trim() || null,
      isDuplicate: false,
      duplicateOfId: null,
      dedupHash: null,
      validationStatus: 'verified',
      matchedSourceIds: null,
      createdAt: now,
      updatedAt: now,
    };

    await insertTransaction(txn);
    navigation.goBack();
  };

  const filteredCategories = CATEGORIES.filter((c) =>
    type === 'business'
      ? !['groceries', 'entertainment', 'rent_mortgage', 'utilities', 'healthcare', 'subscriptions', 'other_personal'].includes(c.value)
      : !['fuel', 'vehicle_maintenance', 'uber_fees', 'tolls_parking', 'car_wash', 'supplies', 'other_business'].includes(c.value)
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Type Toggle */}
      <Text style={styles.label}>TYPE</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, type === 'business' && styles.toggleActive]}
          onPress={() => { setType('business'); setCategory(null); }}
        >
          <Text style={[styles.toggleText, type === 'business' && styles.toggleTextActive]}>Business</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, type === 'personal' && styles.toggleActivePersonal]}
          onPress={() => { setType('personal'); setCategory(null); }}
        >
          <Text style={[styles.toggleText, type === 'personal' && styles.toggleTextActive]}>Personal</Text>
        </TouchableOpacity>
      </View>

      {/* Description */}
      <Text style={styles.label}>DESCRIPTION</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Shell Gas Station"
        placeholderTextColor={Colors.onSurfaceVariant + '4D'}
      />

      {/* Amount */}
      <Text style={styles.label}>AMOUNT ($)</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        placeholderTextColor={Colors.onSurfaceVariant + '4D'}
        keyboardType="decimal-pad"
      />

      {/* Category */}
      <Text style={styles.label}>CATEGORY</Text>
      <View style={styles.categoryGrid}>
        {filteredCategories.map((cat) => (
          <TouchableOpacity
            key={cat.value}
            style={[styles.categoryChip, category === cat.value && styles.categoryChipActive]}
            onPress={() => setCategory(category === cat.value ? null : cat.value)}
          >
            <Text style={[styles.categoryChipText, category === cat.value && styles.categoryChipTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Notes */}
      <Text style={styles.label}>NOTES (OPTIONAL)</Text>
      <TextInput
        style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Any additional notes..."
        placeholderTextColor={Colors.onSurfaceVariant + '4D'}
        multiline
      />

      {/* Save */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
        <Text style={styles.saveBtnText}>Save Transaction</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  label: {
    color: Colors.onSurfaceVariant, fontSize: 11, fontWeight: '700',
    marginTop: 20, marginBottom: 10, letterSpacing: 1.5,
  },
  input: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 16, padding: 16,
    color: Colors.onSurface, fontSize: 16,
    borderWidth: 1, borderColor: Colors.outlineVariant + '1A',
  },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center',
    backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.outlineVariant + '1A',
  },
  toggleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  toggleActivePersonal: {
    backgroundColor: Colors.tertiary,
    borderColor: Colors.tertiary,
  },
  toggleText: { color: Colors.onSurfaceVariant, fontWeight: '700', fontSize: 16 },
  toggleTextActive: { color: '#fff' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  categoryChipActive: { backgroundColor: Colors.primaryContainer },
  categoryChipText: { color: Colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' },
  categoryChipTextActive: { color: Colors.onPrimaryContainer, fontWeight: '700' },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', marginTop: 28,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  saveBtnText: { color: Colors.onPrimary, fontSize: 18, fontWeight: '700' },
});
