import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { importCSVFile } from '../services/csvImporter';
import { importFromWallet } from '../services/walletImporter';
import { initiateBankLink, getSavedBankConfigs, syncBankTransactions } from '../services/bankSyncService';
import { ImportStackParamList } from '../navigation/AppNavigator';

type ImportNav = NativeStackNavigationProp<ImportStackParamList, 'ImportHome'>;
type ImportMethod = 'csv' | 'wallet' | 'bank' | null;

export default function ImportScreen() {
  const navigation = useNavigation<ImportNav>();
  const [activeMethod, setActiveMethod] = useState<ImportMethod>(null);
  const [loading, setLoading] = useState(false);
  const [walletJson, setWalletJson] = useState('');
  const [defaultType, setDefaultType] = useState<'business' | 'personal'>('business');
  const [result, setResult] = useState<{ inserted: number; duplicates: number } | null>(null);

  const handleCSVImport = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await importCSVFile(undefined, defaultType);
      if (res.success) {
        if (res.reviewResult) {
          navigation.navigate('ImportReview', { reviewResult: res.reviewResult });
        } else {
          setResult({ inserted: res.inserted, duplicates: res.duplicates });
          Alert.alert(
            'Import Complete',
            `${res.inserted} transactions imported, ${res.duplicates} duplicates skipped.`
          );
        }
      } else {
        Alert.alert('Import Failed', res.errors.join('\n'));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  };

  const handleWalletImport = async () => {
    if (!walletJson.trim()) {
      Alert.alert('Missing Data', 'Paste your wallet transaction data (JSON).');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await importFromWallet(walletJson, defaultType);
      if (res.success) {
        if (res.reviewResult) {
          navigation.navigate('ImportReview', { reviewResult: res.reviewResult });
          setWalletJson('');
        } else {
          setResult({ inserted: res.inserted, duplicates: res.duplicates });
          Alert.alert(
            'Import Complete',
            `${res.inserted} transactions imported, ${res.duplicates} duplicates skipped.`
          );
          setWalletJson('');
        }
      } else {
        Alert.alert('Import Failed', res.errors.join('\n'));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  };

  const handleBankSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const configs = await getSavedBankConfigs();
      if (configs.length === 0) {
        const link = await initiateBankLink('plaid');
        if (link) {
          Alert.alert(
            'Connect Your Bank',
            'Bank linking requires opening a secure browser window. This feature requires a backend server with Plaid/TrueLayer API keys configured.',
          );
        } else {
          Alert.alert(
            'Bank Sync Setup',
            'To use bank sync, configure your backend server with Plaid or TrueLayer API credentials. See the README for setup instructions.'
          );
        }
      } else {
        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const res = await syncBankTransactions(configs[0], thirtyDaysAgo, today, defaultType);
        if (res.success) {
          if (res.reviewResult) {
            navigation.navigate('ImportReview', { reviewResult: res.reviewResult });
          } else {
            setResult({ inserted: res.inserted, duplicates: res.duplicates });
            Alert.alert(
              'Sync Complete',
              `${res.inserted} new transactions, ${res.duplicates} duplicates skipped.`
            );
          }
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Import Transactions</Text>
      <Text style={styles.subtitle}>
        Import from multiple sources. Duplicates are automatically detected and flagged for review.
      </Text>

      {/* Default type toggle */}
      <Text style={styles.sectionLabel}>Default transaction type:</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, defaultType === 'business' && styles.toggleActive]}
          onPress={() => setDefaultType('business')}
        >
          <Text style={[styles.toggleText, defaultType === 'business' && styles.toggleTextActive]}>Business</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, defaultType === 'personal' && styles.toggleActiveP]}
          onPress={() => setDefaultType('personal')}
        >
          <Text style={[styles.toggleText, defaultType === 'personal' && styles.toggleTextActive]}>Personal</Text>
        </TouchableOpacity>
      </View>

      {/* Import method cards */}
      <ImportMethodCard
        title="CSV File Import"
        description="Import transactions from a bank statement CSV file. Auto-detects columns."
        icon="[CSV]"
        active={activeMethod === 'csv'}
        onPress={() => setActiveMethod(activeMethod === 'csv' ? null : 'csv')}
      />
      {activeMethod === 'csv' && (
        <View style={styles.methodContent}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCSVImport} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Select CSV File</Text>}
          </TouchableOpacity>
        </View>
      )}

      <ImportMethodCard
        title="Apple Wallet / Google Pay"
        description="Paste exported transaction data from your wallet app (JSON format via Shortcuts)."
        icon="[WAL]"
        active={activeMethod === 'wallet'}
        onPress={() => setActiveMethod(activeMethod === 'wallet' ? null : 'wallet')}
      />
      {activeMethod === 'wallet' && (
        <View style={styles.methodContent}>
          <TextInput
            style={styles.jsonInput}
            value={walletJson}
            onChangeText={setWalletJson}
            placeholder='Paste wallet JSON data here...'
            placeholderTextColor="#555"
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity style={styles.actionBtn} onPress={handleWalletImport} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Import Wallet Data</Text>}
          </TouchableOpacity>
        </View>
      )}

      <ImportMethodCard
        title="Bank Account Sync"
        description="Connect your bank account via Plaid or TrueLayer for automatic transaction sync."
        icon="[BNK]"
        active={activeMethod === 'bank'}
        onPress={() => setActiveMethod(activeMethod === 'bank' ? null : 'bank')}
      />
      {activeMethod === 'bank' && (
        <View style={styles.methodContent}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleBankSync} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Sync Bank Transactions</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Result display */}
      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Last Import Result</Text>
          <Text style={styles.resultText}>{result.inserted} transactions imported</Text>
          <Text style={styles.resultText}>{result.duplicates} duplicates detected & skipped</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ImportMethodCard({
  title, description, icon, active, onPress,
}: {
  title: string; description: string; icon: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.methodCard, active && styles.methodCardActive]}
      onPress={onPress}
    >
      <Text style={styles.methodIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.methodTitle}>{title}</Text>
        <Text style={styles.methodDesc}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  header: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 20, lineHeight: 20 },
  sectionLabel: { color: '#ccc', fontSize: 14, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  toggleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#333',
  },
  toggleActive: { backgroundColor: '#1B5E20', borderColor: '#4CAF50' },
  toggleActiveP: { backgroundColor: '#E65100', borderColor: '#FF9800' },
  toggleText: { color: '#888', fontWeight: '600' },
  toggleTextActive: { color: '#fff' },
  methodCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e',
    borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#333', gap: 14,
  },
  methodCardActive: { borderColor: '#4CAF50' },
  methodIcon: { color: '#4CAF50', fontSize: 16, fontWeight: '700', width: 40, textAlign: 'center' },
  methodTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  methodDesc: { color: '#888', fontSize: 13, marginTop: 4, lineHeight: 18 },
  methodContent: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, marginBottom: 12 },
  actionBtn: {
    backgroundColor: '#4CAF50', borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  jsonInput: {
    backgroundColor: '#0f0f23', borderRadius: 10, padding: 14, color: '#fff',
    fontSize: 14, borderWidth: 1, borderColor: '#333', height: 120, marginBottom: 12,
    fontFamily: 'monospace',
  },
  resultCard: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, marginTop: 20,
    borderWidth: 1, borderColor: '#4CAF50',
  },
  resultTitle: { color: '#4CAF50', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  resultText: { color: '#ccc', fontSize: 14, marginBottom: 4 },
});
