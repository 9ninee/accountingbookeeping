import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Transaction, TransactionType, TransactionCategory } from '../models/types';
import { insertTransaction } from '../services/database';
import { generateId } from '../utils/helpers';

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
      amount: -Math.abs(parseFloat(amount)), // expenses are negative
      currency: 'USD',
      type,
      category,
      importSource: 'manual',
      sourceReference: null,
      merchantName: null,
      notes: notes.trim() || null,
      isDuplicate: false,
      duplicateOfId: null,
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
    <ScrollView style={styles.container}>
      {/* Type toggle */}
      <Text style={styles.label}>Type</Text>
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
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Shell Gas Station"
        placeholderTextColor="#555"
      />

      {/* Amount */}
      <Text style={styles.label}>Amount ($)</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        placeholderTextColor="#555"
        keyboardType="decimal-pad"
      />

      {/* Category */}
      <Text style={styles.label}>Category</Text>
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
      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Any additional notes..."
        placeholderTextColor="#555"
        multiline
        textAlignVertical="top"
      />

      {/* Save */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Transaction</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  label: { color: '#ccc', fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, color: '#fff',
    fontSize: 16, borderWidth: 1, borderColor: '#333',
  },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#333',
  },
  toggleActive: { backgroundColor: '#1B5E20', borderColor: '#4CAF50' },
  toggleActivePersonal: { backgroundColor: '#E65100', borderColor: '#FF9800' },
  toggleText: { color: '#888', fontWeight: '600', fontSize: 16 },
  toggleTextActive: { color: '#fff' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#333',
  },
  categoryChipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  categoryChipText: { color: '#888', fontSize: 13 },
  categoryChipTextActive: { color: '#fff' },
  saveBtn: {
    backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 24,
  },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
