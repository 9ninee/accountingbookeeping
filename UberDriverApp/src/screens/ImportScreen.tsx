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
import { Colors } from '../theme/colors';
import { Fonts } from '../theme/typography';

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
          Alert.alert('Import Complete', `${res.inserted} transactions imported, ${res.duplicates} duplicates skipped.`);
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
          Alert.alert('Import Complete', `${res.inserted} transactions imported, ${res.duplicates} duplicates skipped.`);
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
          Alert.alert('Connect Your Bank', 'Bank linking requires opening a secure browser window. This feature requires a backend server with Plaid/TrueLayer API keys configured.');
        } else {
          Alert.alert('Bank Sync Setup', 'To use bank sync, configure your backend server with Plaid or TrueLayer API credentials.');
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
            Alert.alert('Sync Complete', `${res.inserted} new transactions, ${res.duplicates} duplicates skipped.`);
          }
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header */}
      <View style={styles.headerBadge}>
        <Text style={styles.headerBadgeText}>DATA INGESTION</Text>
      </View>
      <Text style={styles.header}>Import Transactions</Text>
      <Text style={styles.subtitle}>
        Sync your driving revenue and expenses from external sources.
      </Text>

      {/* Business/Personal Toggle */}
      <View style={styles.toggleWrap}>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, defaultType === 'business' && styles.toggleActive]}
            onPress={() => setDefaultType('business')}
          >
            <Text style={[styles.toggleText, defaultType === 'business' && styles.toggleTextActive]}>
              BUSINESS
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, defaultType === 'personal' && styles.toggleActiveP]}
            onPress={() => setDefaultType('personal')}
          >
            <Text style={[styles.toggleText, defaultType === 'personal' && styles.toggleTextActive]}>
              PERSONAL
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Import Methods */}
      <View style={styles.methodsCard}>
        {/* CSV */}
        <TouchableOpacity
          style={[styles.methodRow, activeMethod === 'csv' && styles.methodRowActive]}
          onPress={() => setActiveMethod(activeMethod === 'csv' ? null : 'csv')}
          activeOpacity={0.7}
        >
          <View style={styles.methodLeft}>
            <View style={[styles.methodIconWrap, { borderColor: Colors.primary + '1A' }]}>
              <Text style={[styles.methodIconText, { color: Colors.primary }]}>CSV</Text>
            </View>
            <View>
              <Text style={styles.methodTitle}>CSV File</Text>
              <Text style={styles.methodDesc}>MANUAL UPLOAD</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.methodBtn, { borderColor: Colors.primary + '33' }]}
            onPress={handleCSVImport}
            disabled={loading}
          >
            {loading && activeMethod === 'csv' ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <Text style={[styles.methodBtnText, { color: Colors.primary }]}>Import</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Wallet */}
        <View style={styles.methodDivider} />
        <TouchableOpacity
          style={[styles.methodRow, activeMethod === 'wallet' && styles.methodRowActive]}
          onPress={() => setActiveMethod(activeMethod === 'wallet' ? null : 'wallet')}
          activeOpacity={0.7}
        >
          <View style={styles.methodLeft}>
            <View style={[styles.methodIconWrap, { borderColor: Colors.secondary + '1A' }]}>
              <Text style={[styles.methodIconText, { color: Colors.secondary }]}>W</Text>
            </View>
            <View>
              <Text style={styles.methodTitle}>Apple Wallet</Text>
              <Text style={styles.methodDesc}>AUTO-DETECTION</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.methodBtn, { borderColor: Colors.secondary + '33' }]}
            onPress={() => setActiveMethod('wallet')}
          >
            <Text style={[styles.methodBtnText, { color: Colors.secondary }]}>Sync</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {activeMethod === 'wallet' && (
          <View style={styles.walletInput}>
            <TextInput
              style={styles.jsonInput}
              value={walletJson}
              onChangeText={setWalletJson}
              placeholder='Paste wallet JSON data here...'
              placeholderTextColor={Colors.onSurfaceVariant + '4D'}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={styles.importBtn}
              onPress={handleWalletImport}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.importBtnText}>Import Wallet Data</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Bank Sync */}
        <View style={styles.methodDivider} />
        <TouchableOpacity
          style={[styles.methodRow, activeMethod === 'bank' && styles.methodRowActive]}
          onPress={() => setActiveMethod(activeMethod === 'bank' ? null : 'bank')}
          activeOpacity={0.7}
        >
          <View style={styles.methodLeft}>
            <View style={[styles.methodIconWrap, { borderColor: Colors.tertiary + '1A' }]}>
              <Text style={[styles.methodIconText, { color: Colors.tertiary }]}>B</Text>
            </View>
            <View>
              <Text style={styles.methodTitle}>Bank Sync</Text>
              <Text style={styles.methodDesc}>REAL-TIME PLAID</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.methodBtn, { borderColor: Colors.tertiary + '33' }]}
            onPress={handleBankSync}
            disabled={loading}
          >
            {loading && activeMethod === 'bank' ? (
              <ActivityIndicator color={Colors.tertiary} size="small" />
            ) : (
              <Text style={[styles.methodBtnText, { color: Colors.tertiary }]}>Connect</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </View>

      {/* Import Summary */}
      {result && (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <View>
              <Text style={styles.resultTitle}>Import Summary</Text>
              <Text style={styles.resultSubtitle}>Last activity: just now</Text>
            </View>
            <View style={styles.resultIconWrap}>
              <Text style={styles.resultIcon}>OK</Text>
            </View>
          </View>
          <View style={styles.resultGrid}>
            <View style={[styles.resultStat, { borderLeftColor: Colors.primary }]}>
              <Text style={styles.resultStatLabel}>PROCESSED</Text>
              <View style={styles.resultStatRow}>
                <Text style={[styles.resultStatValue, { color: Colors.primary }]}>{result.inserted}</Text>
                <Text style={styles.resultStatUnit}>txns</Text>
              </View>
            </View>
            <View style={[styles.resultStat, { borderLeftColor: Colors.error }]}>
              <Text style={styles.resultStatLabel}>DUPLICATES</Text>
              <View style={styles.resultStatRow}>
                <Text style={[styles.resultStatValue, { color: Colors.error }]}>{result.duplicates}</Text>
                <Text style={styles.resultStatUnit}>skipped</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },

  // Header
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryContainer + '33',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
    marginTop: 16, marginBottom: 12,
  },
  headerBadgeText: {
    fontSize: 10, fontFamily: Fonts.bold, color: Colors.primary,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  header: { fontSize: 28, fontFamily: Fonts.bold, color: Colors.onSurface, marginBottom: 8 },
  subtitle: { color: Colors.onSurfaceVariant, fontSize: 14, fontFamily: Fonts.regular, marginBottom: 24, lineHeight: 20 },

  // Toggle
  toggleWrap: { alignItems: 'center', marginBottom: 24 },
  toggleRow: {
    flexDirection: 'row', padding: 6,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 24,
    width: '80%',
  },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleActiveP: {
    backgroundColor: Colors.tertiary,
  },
  toggleText: {
    color: Colors.onSurfaceVariant, fontFamily: Fonts.bold, fontSize: 12, letterSpacing: 1,
  },
  toggleTextActive: { color: '#fff' },

  // Methods Card
  methodsCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.outlineVariant + '1A',
    marginBottom: 24,
  },
  methodRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20,
  },
  methodRowActive: { backgroundColor: Colors.surfaceContainer },
  methodLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  methodIconWrap: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: Colors.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  methodIconText: { fontSize: 14, fontFamily: Fonts.bold },
  methodTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.onSurface },
  methodDesc: {
    fontSize: 10, fontFamily: Fonts.semiBold, color: Colors.onSurfaceVariant,
    letterSpacing: 1.5, marginTop: 2,
  },
  methodBtn: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 16,
    backgroundColor: Colors.surfaceBright + '1A',
    borderWidth: 1,
  },
  methodBtnText: { fontSize: 12, fontFamily: Fonts.bold },
  methodDivider: {
    height: 1, backgroundColor: Colors.outlineVariant + '1A', marginHorizontal: 20,
  },

  // Wallet Input
  walletInput: { paddingHorizontal: 20, paddingBottom: 20 },
  jsonInput: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 16, padding: 14,
    color: Colors.onSurface, fontSize: 14, height: 100, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.outlineVariant + '1A',
  },
  importBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  importBtnText: { color: Colors.onPrimary, fontSize: 16, fontFamily: Fonts.semiBold },

  // Result Card
  resultCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: Colors.outlineVariant + '1A',
    overflow: 'hidden',
  },
  resultHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 24,
  },
  resultTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.onSurface, marginBottom: 4 },
  resultSubtitle: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.onSurfaceVariant },
  resultIconWrap: {
    backgroundColor: Colors.primary + '1A', padding: 8, borderRadius: 12,
  },
  resultIcon: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.primary },
  resultGrid: { flexDirection: 'row', gap: 12 },
  resultStat: {
    flex: 1, backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20, padding: 16, borderLeftWidth: 4,
  },
  resultStatLabel: {
    fontSize: 10, fontFamily: Fonts.bold, color: Colors.onSurfaceVariant,
    letterSpacing: 1, marginBottom: 8,
  },
  resultStatRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  resultStatValue: { fontSize: 28, fontFamily: Fonts.monoBold },
  resultStatUnit: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.onSurfaceVariant },
});
