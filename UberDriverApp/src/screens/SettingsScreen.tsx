import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { Colors } from '../theme/colors';
import { getCurrentUser, signOut, isSupabaseConfigured } from '../services/authService';
import { syncAll, isSyncing } from '../services/syncService';
import { getDatabaseSize, getRoutePointsTotalCount } from '../services/database';
import { User } from '@supabase/supabase-js';

export default function SettingsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [dbSize, setDbSize] = useState<number>(0);
  const [routePoints, setRoutePoints] = useState<number>(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (isSupabaseConfigured()) {
        const u = await getCurrentUser();
        setUser(u);
      }
    } catch {}
    try {
      const size = await getDatabaseSize();
      setDbSize(size);
      const rp = await getRoutePointsTotalCount();
      setRoutePoints(rp);
    } catch {}
  };

  const handleSync = async () => {
    if (!isSupabaseConfigured()) {
      Alert.alert(
        'Setup Required',
        'To enable cloud sync, add your Supabase project URL and anon key in src/services/supabaseClient.ts.\n\nGet free credentials at supabase.com.'
      );
      return;
    }
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to sync your data to the cloud.');
      return;
    }
    if (isSyncing()) return;

    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncAll();
      const parts: string[] = [];
      if (result.pushed.transactions + result.pushed.trips > 0) {
        parts.push(`Pushed: ${result.pushed.transactions} txns, ${result.pushed.trips} trips`);
      }
      if (result.pulled.transactions + result.pulled.trips > 0) {
        parts.push(`Pulled: ${result.pulled.transactions} txns, ${result.pulled.trips} trips`);
      }
      if (result.errors.length > 0) {
        parts.push(`${result.errors.length} error(s)`);
      }
      setSyncResult(parts.length > 0 ? parts.join('\n') : 'Everything up to date');
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Your local data will be kept. Sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          setUser(null);
        },
      },
    ]);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account Section */}
      <Text style={styles.sectionTitle}>ACCOUNT</Text>
      <View style={styles.card}>
        {user ? (
          <>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user.email}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>User ID</Text>
              <Text style={[styles.rowValue, styles.mono]}>{user.id.slice(0, 12)}...</Text>
            </View>
            <TouchableOpacity style={styles.dangerButton} onPress={handleSignOut}>
              <Text style={styles.dangerButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Status</Text>
            <Text style={[styles.rowValue, { color: Colors.onSurfaceVariant + '88' }]}>
              {isSupabaseConfigured() ? 'Not signed in' : 'Offline mode (no cloud)'}
            </Text>
          </View>
        )}
      </View>

      {/* Cloud Sync Section */}
      <Text style={styles.sectionTitle}>CLOUD SYNC</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>
          Sync your transactions and mileage trips to Supabase cloud. Your data stays on-device and works offline — sync backs it up.
        </Text>

        <TouchableOpacity
          style={[styles.syncButton, syncing && styles.buttonDisabled]}
          onPress={handleSync}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.syncButtonText}>Sync Now</Text>
          )}
        </TouchableOpacity>

        {syncResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{syncResult}</Text>
          </View>
        )}
      </View>

      {/* Storage Section */}
      <Text style={styles.sectionTitle}>LOCAL STORAGE</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Database size</Text>
          <Text style={styles.rowValue}>{formatBytes(dbSize)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Route points</Text>
          <Text style={styles.rowValue}>{routePoints.toLocaleString()}</Text>
        </View>
      </View>

      {/* Setup Guide */}
      {!isSupabaseConfigured() && (
        <>
          <Text style={styles.sectionTitle}>SETUP GUIDE</Text>
          <View style={styles.card}>
            <Text style={styles.desc}>To enable cloud sync (free):</Text>
            <Text style={styles.step}>1. Go to supabase.com and create a free project</Text>
            <Text style={styles.step}>2. Go to SQL Editor and run supabase/schema.sql</Text>
            <Text style={styles.step}>3. Copy your Project URL and anon key from Settings → API</Text>
            <Text style={styles.step}>4. Paste them in src/services/supabaseClient.ts</Text>
            <Text style={styles.step}>5. Rebuild the app</Text>
          </View>
        </>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.onSurfaceVariant + '88',
    letterSpacing: 1.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.outlineVariant + '22',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant + '15',
  },
  rowLabel: {
    fontSize: 14,
    color: Colors.onSurfaceVariant,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 14,
    color: Colors.onSurface,
    fontWeight: '600',
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  desc: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    lineHeight: 20,
    marginBottom: 14,
  },
  step: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    lineHeight: 22,
    paddingLeft: 4,
  },
  syncButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  dangerButton: {
    marginTop: 12,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error + '44',
  },
  dangerButtonText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
  resultBox: {
    marginTop: 12,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    padding: 12,
  },
  resultText: {
    fontSize: 12,
    color: Colors.onSurface,
    lineHeight: 18,
  },
});

