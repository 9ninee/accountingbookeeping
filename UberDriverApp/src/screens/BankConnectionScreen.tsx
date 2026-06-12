import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
  ActivityIndicator, TextInput, Linking, FlatList,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Fonts } from '../theme/typography';
import {
  isOpenBankingConfigured,
  getInstitutions,
  searchInstitutions,
  createRequisition,
  completeBankLink,
  getLinkedBanks,
  removeLinkedBank,
} from '../services/openBankingService';
import {
  syncAllBanks,
  getConsentStatus,
} from '../services/openBankingSyncPipeline';
import {
  isCloudBankAvailable,
  listCloudBanks,
  startCloudLink,
  checkCloudLink,
  getCloudConnections,
  removeCloudConnection,
  syncCloudBanks,
} from '../services/cloudBankService';

type Step = 'overview' | 'select_bank' | 'linking';

/**
 * Provider modes:
 *  - cloud:  Enable Banking via the bank-sync Supabase Edge Function (free,
 *            secrets stay server-side). Used whenever the user is signed in.
 *  - direct: legacy GoCardless straight from the device (only for accounts
 *            created before GoCardless closed new signups in July 2025).
 */
type Mode = 'cloud' | 'direct' | 'none';

interface DisplayBank {
  id: string;
  name: string;
  sub: string; // BIC (direct) or country (cloud)
  country?: string;
}

interface DisplayConnection {
  id: string;
  institutionName: string;
  accountCount: number;
  daysRemaining: number;
  isExpired: boolean;
  isPending: boolean;
}

export default function BankConnectionScreen() {
  const [mode, setMode] = useState<Mode>('none');
  const [step, setStep] = useState<Step>('overview');
  const [connections, setConnections] = useState<DisplayConnection[]>([]);
  const [allBanks, setAllBanks] = useState<DisplayBank[]>([]);
  const [banks, setBanks] = useState<DisplayBank[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingInstName, setPendingInstName] = useState<string>('');

  const resolveMode = useCallback(async (): Promise<Mode> => {
    if (await isCloudBankAvailable()) return 'cloud';
    if (isOpenBankingConfigured()) return 'direct';
    return 'none';
  }, []);

  const loadOverview = useCallback(async (activeMode: Mode) => {
    try {
      if (activeMode === 'cloud') {
        const conns = await getCloudConnections();
        setConnections(
          conns.map((c) => ({
            id: c.id,
            institutionName: c.institutionName,
            accountCount: c.accountCount,
            daysRemaining: c.daysRemaining,
            isExpired: c.isExpired,
            isPending: c.status === 'pending',
          }))
        );
      } else if (activeMode === 'direct') {
        const banksLocal = await getLinkedBanks();
        const status = banksLocal.length > 0 ? await getConsentStatus() : [];
        setConnections(
          banksLocal.map((b, idx) => ({
            id: b.id,
            institutionName: b.institutionName,
            accountCount: b.accountIds.length,
            daysRemaining: status[idx]?.daysRemaining ?? 0,
            isExpired: status[idx]?.isExpired ?? false,
            isPending: false,
          }))
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const m = await resolveMode();
      setMode(m);
      await loadOverview(m);
    })();
  }, [resolveMode, loadOverview]);

  const handleSelectBank = async () => {
    if (mode === 'none') {
      Alert.alert(
        'Setup Required',
        'Bank sync is free but needs a one-time setup:\n\n' +
          '1. Sign in to the app (Settings tab) so your private Supabase backend can sync for you.\n' +
          '2. Deploy the bank-sync function with your free Enable Banking key.\n\n' +
          'Full guide: docs/FREE_BANK_SYNC.md in the repo.'
      );
      return;
    }
    setLoading(true);
    try {
      let list: DisplayBank[];
      if (mode === 'cloud') {
        const cloudBanks = await listCloudBanks('GB');
        list = cloudBanks.map((b) => ({
          id: `${b.country}:${b.name}`,
          name: b.name,
          sub: b.country,
          country: b.country,
        }));
      } else {
        const insts = await getInstitutions('GB');
        list = insts.map((i) => ({ id: i.id, name: i.name, sub: i.bic || i.id }));
      }
      setAllBanks(list);
      setBanks(list);
      setStep('select_bank');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setBanks(allBanks);
      return;
    }
    if (mode === 'cloud') {
      const q = query.toLowerCase();
      setBanks(allBanks.filter((b) => b.name.toLowerCase().includes(q)));
    } else {
      const results = await searchInstitutions(query, 'GB');
      setBanks(results.map((i) => ({ id: i.id, name: i.name, sub: i.bic || i.id })));
    }
  };

  const handleLinkBank = async (bank: DisplayBank) => {
    setLoading(true);
    try {
      let authUrl: string;
      if (mode === 'cloud') {
        const { url, state } = await startCloudLink(bank.name, bank.country ?? 'GB');
        setPendingToken(state);
        authUrl = url;
      } else {
        const req = await createRequisition(bank.id);
        setPendingToken(req.id);
        authUrl = req.link;
      }
      setPendingInstName(bank.name);
      setStep('linking');
      await Linking.openURL(authUrl);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const handleCheckLink = async () => {
    if (!pendingToken) return;
    setLoading(true);
    try {
      let linked = false;
      let accountCount = 0;

      if (mode === 'cloud') {
        const res = await checkCloudLink(pendingToken);
        linked = res.status === 'active';
        accountCount = res.accountCount;
      } else {
        const bank = await completeBankLink(pendingToken, pendingInstName);
        linked = Boolean(bank);
        accountCount = bank?.accountIds.length ?? 0;
      }

      if (linked) {
        Alert.alert('Connected', `${pendingInstName} linked with ${accountCount} account(s).`);
        setPendingToken(null);
        setPendingInstName('');
        setStep('overview');
        await loadOverview(mode);
      } else {
        Alert.alert('Pending', 'Bank authorization not yet complete. Please finish the process in your browser and try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const parts: string[] = [];

      if (mode === 'cloud') {
        const result = await syncCloudBanks();
        for (const s of result.summaries) {
          if (s.errors.length > 0) {
            parts.push(`${s.bankName}: ${s.errors[0]}`);
          } else {
            parts.push(`${s.bankName}: ${s.inserted} new, ${s.skipped} skipped`);
          }
        }
        if (result.pulledToDevice > 0) {
          parts.push(`Pulled ${result.pulledToDevice} txns to this device`);
        }
        if (parts.length === 0) parts.push('No active bank connections to sync');
      } else {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        const result = await syncAllBanks(thirtyDaysAgo, today);
        for (const bank of result.banks) {
          if (bank.errors.length > 0) {
            parts.push(`${bank.bankName}: ${bank.errors[0]}`);
          } else {
            parts.push(`${bank.bankName}: ${bank.inserted} new, ${bank.duplicates} skipped`);
          }
        }
        if (result.balances.length > 0) {
          const bal = result.balances[0];
          parts.push(`Balance: ${bal.currency} ${bal.amount.toFixed(2)}`);
        }
      }
      setSyncResult(parts.join('\n'));
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`);
    }
    setSyncing(false);
  };

  const handleRemoveBank = (conn: DisplayConnection) => {
    Alert.alert(
      'Remove Bank',
      `Disconnect ${conn.institutionName}? Your imported transactions will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (mode === 'cloud') {
                await removeCloudConnection(conn.id);
              } else {
                await removeLinkedBank(conn.id);
              }
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
            await loadOverview(mode);
          },
        },
      ]
    );
  };

  const subtitle =
    mode === 'cloud'
      ? 'Connect your bank to automatically import transactions. Synced securely by your private Supabase backend via Enable Banking (free for your own accounts).'
      : mode === 'direct'
        ? 'Connect your bank account to automatically import transactions. Powered by GoCardless (legacy).'
        : 'Connect your bank to automatically import transactions — free, with a one-time setup. Sign in first, then see docs/FREE_BANK_SYNC.md.';

  // ── Overview ──
  if (step === 'overview') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>OPEN BANKING</Text>
        </View>
        <Text style={styles.header}>Bank Connections</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {/* Linked Banks */}
        {connections.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>CONNECTED BANKS</Text>
            {connections.map((conn) => (
              <View key={conn.id} style={styles.bankCard}>
                <View style={styles.bankCardHeader}>
                  <View style={styles.bankIconWrap}>
                    <Text style={styles.bankIconText}>{conn.institutionName[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bankName}>{conn.institutionName}</Text>
                    <Text style={styles.bankAccounts}>
                      {conn.isPending ? 'Authorization pending' : `${conn.accountCount} account(s)`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveBank(conn)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.consentRow}>
                  <View style={[
                    styles.consentBadge,
                    conn.isExpired ? styles.consentExpired
                      : conn.isPending || conn.daysRemaining < 14 ? styles.consentWarning
                      : styles.consentOk,
                  ]}>
                    <Text style={styles.consentBadgeText}>
                      {conn.isExpired ? 'EXPIRED'
                        : conn.isPending ? 'PENDING'
                        : `${conn.daysRemaining}d remaining`}
                    </Text>
                  </View>
                  {conn.isExpired && (
                    <TouchableOpacity
                      style={styles.renewBtn}
                      onPress={() => handleLinkBank({
                        id: conn.id,
                        name: conn.institutionName,
                        sub: '',
                        country: 'GB',
                      })}
                    >
                      <Text style={styles.renewBtnText}>Re-link</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {/* Sync Button */}
            <TouchableOpacity
              style={[styles.syncBtn, syncing && styles.btnDisabled]}
              onPress={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.syncBtnText}>Sync All Banks</Text>
              )}
            </TouchableOpacity>

            {syncResult && (
              <View style={styles.resultBox}>
                <Text style={styles.resultText}>{syncResult}</Text>
              </View>
            )}
          </>
        )}

        {/* Add Bank */}
        <Text style={styles.sectionTitle}>
          {connections.length > 0 ? 'ADD ANOTHER BANK' : 'GET STARTED'}
        </Text>
        <TouchableOpacity
          style={[styles.addBankBtn, loading && styles.btnDisabled]}
          onPress={handleSelectBank}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <>
              <Text style={styles.addBankIcon}>+</Text>
              <Text style={styles.addBankText}>Connect a Bank Account</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoStep}>1. Select your bank from 2,500+ UK/EU banks</Text>
          <Text style={styles.infoStep}>2. Log in securely via your bank's website</Text>
          <Text style={styles.infoStep}>3. Grant read-only access to transactions</Text>
          <Text style={styles.infoStep}>4. Transactions sync daily — automatically</Text>
          <Text style={styles.infoNote}>
            Read-only access. Consent expires after 90 days (PSD2) — re-link to renew.
            Your bank credentials are never seen by this app.
          </Text>
        </View>
      </ScrollView>
    );
  }

  // ── Bank Selection ──
  if (step === 'select_bank') {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => setStep('overview')} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.header}>Select Your Bank</Text>

        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder="Search banks..."
          placeholderTextColor={Colors.onSurfaceVariant + '66'}
        />

        <FlatList
          data={banks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.instRow}
              onPress={() => handleLinkBank(item)}
              disabled={loading}
            >
              <View style={styles.instIconWrap}>
                <Text style={styles.instIconText}>{item.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.instName}>{item.name}</Text>
                <Text style={styles.instBic}>{item.sub}</Text>
              </View>
              <Text style={styles.instArrow}>→</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No banks found</Text>
          }
        />
      </View>
    );
  }

  // ── Linking In Progress ──
  return (
    <View style={[styles.container, styles.centerContent]}>
      <View style={styles.linkingCard}>
        <View style={styles.linkingIconWrap}>
          <Text style={styles.linkingIcon}>🔗</Text>
        </View>
        <Text style={styles.linkingTitle}>Connecting to {pendingInstName}</Text>
        <Text style={styles.linkingDesc}>
          Complete the authorization in your browser. When done, tap the button below.
        </Text>

        <TouchableOpacity
          style={[styles.checkBtn, loading && styles.btnDisabled]}
          onPress={handleCheckLink}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.checkBtnText}>I've Finished Authorization</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelLink}
          onPress={() => { setStep('overview'); setPendingToken(null); }}
        >
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  centerContent: { justifyContent: 'center', alignItems: 'center' },

  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.secondaryContainer + '33',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
    marginTop: 16, marginBottom: 12,
  },
  headerBadgeText: {
    fontSize: 10, fontFamily: Fonts.bold, color: Colors.secondary,
    letterSpacing: 2,
  },
  header: { fontSize: 28, fontFamily: Fonts.bold, color: Colors.onSurface, marginBottom: 8 },
  subtitle: {
    color: Colors.onSurfaceVariant, fontSize: 14, fontFamily: Fonts.regular,
    marginBottom: 24, lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 11, fontFamily: Fonts.bold, color: Colors.onSurfaceVariant + '88',
    letterSpacing: 1.5, marginTop: 24, marginBottom: 12,
  },

  // Bank Card
  bankCard: {
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.outlineVariant + '22',
  },
  bankCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bankIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.secondary + '1A',
    justifyContent: 'center', alignItems: 'center',
  },
  bankIconText: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.secondary },
  bankName: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.onSurface },
  bankAccounts: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.onSurfaceVariant, marginTop: 2 },
  removeText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.error },

  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  consentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  consentOk: { backgroundColor: Colors.primary + '1A' },
  consentWarning: { backgroundColor: Colors.tertiary + '1A' },
  consentExpired: { backgroundColor: Colors.error + '1A' },
  consentBadgeText: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.onSurface, letterSpacing: 0.5 },
  renewBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12,
    backgroundColor: Colors.secondary + '22', borderWidth: 1, borderColor: Colors.secondary + '44',
  },
  renewBtnText: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.secondary },

  // Sync
  syncBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  syncBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.bold },
  btnDisabled: { opacity: 0.6 },
  resultBox: {
    backgroundColor: Colors.surfaceContainer, borderRadius: 12,
    padding: 14, marginTop: 12,
  },
  resultText: { fontSize: 12, fontFamily: Fonts.mono, color: Colors.onSurface, lineHeight: 20 },

  // Add Bank
  addBankBtn: {
    borderWidth: 2, borderColor: Colors.primary + '44', borderStyle: 'dashed',
    borderRadius: 16, paddingVertical: 24, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 10,
  },
  addBankIcon: { fontSize: 24, fontFamily: Fonts.bold, color: Colors.primary },
  addBankText: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.primary },

  // Info Card
  infoCard: {
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 16,
    padding: 20, marginTop: 24,
    borderWidth: 1, borderColor: Colors.outlineVariant + '22',
  },
  infoTitle: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.onSurface, marginBottom: 12 },
  infoStep: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.onSurfaceVariant, lineHeight: 24 },
  infoNote: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.onSurfaceVariant + '88', marginTop: 12 },

  // Bank Selection
  backBtn: { paddingVertical: 12 },
  backText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.secondary },
  searchInput: {
    backgroundColor: Colors.surfaceContainer, borderRadius: 12,
    padding: 14, fontSize: 16, fontFamily: Fonts.regular,
    color: Colors.onSurface, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.outlineVariant + '33',
  },
  instRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant + '15',
  },
  instIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: Colors.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center',
  },
  instIconText: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.onSurface },
  instName: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.onSurface },
  instBic: { fontSize: 11, fontFamily: Fonts.mono, color: Colors.onSurfaceVariant, marginTop: 2 },
  instArrow: { fontSize: 16, color: Colors.onSurfaceVariant },
  emptyText: { textAlign: 'center', color: Colors.onSurfaceVariant, fontFamily: Fonts.regular, marginTop: 40 },

  // Linking
  linkingCard: {
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 20,
    padding: 32, alignItems: 'center', width: '90%',
    borderWidth: 1, borderColor: Colors.outlineVariant + '22',
  },
  linkingIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.secondary + '1A',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  linkingIcon: { fontSize: 28 },
  linkingTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.onSurface, textAlign: 'center', marginBottom: 8 },
  linkingDesc: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  checkBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', width: '100%',
  },
  checkBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.bold },
  cancelLink: { marginTop: 16 },
  cancelLinkText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.onSurfaceVariant },
});
