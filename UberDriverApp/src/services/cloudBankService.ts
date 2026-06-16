/**
 * Client for the `bank-sync` Supabase Edge Function.
 *
 * This is the FREE bank sync path: Enable Banking credentials live only on
 * the server (Supabase secrets), the function writes transactions straight
 * into the cloud `transactions` table, and syncAll() pulls them into the
 * local SQLite database — so the app stays fully offline-first.
 *
 * The legacy direct-from-device GoCardless path (openBankingService.ts)
 * still works for accounts created before GoCardless closed signups.
 */

import * as SecureStore from 'expo-secure-store';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getCurrentSession } from './authService';
import { syncAll } from './syncService';

// ── Types ──

export interface CloudBankInfo {
  name: string;
  country: string;
  logo: string | null;
}

export interface CloudConnection {
  id: string;
  institutionName: string;
  accountCount: number;
  status: 'pending' | 'active' | string;
  daysRemaining: number;
  isExpired: boolean;
  lastSyncedAt: string | null;
}

export interface CloudSyncSummary {
  bankName: string;
  accountsProcessed: number;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

export interface CloudSyncResult {
  summaries: CloudSyncSummary[];
  totalInserted: number;
  totalSkipped: number;
  pulledToDevice: number;
}

// ── Invocation ──

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('bank-sync', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Cloud bank sync requires Supabase to be configured AND a signed-in user. */
export async function isCloudBankAvailable(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const session = await getCurrentSession();
    return Boolean(session?.user);
  } catch {
    return false;
  }
}

// ── Linking flow ──

export async function listCloudBanks(country = 'GB'): Promise<CloudBankInfo[]> {
  const data = await invoke<{ banks: CloudBankInfo[] }>({ action: 'list_banks', country });
  return data.banks;
}

export async function startCloudLink(
  bankName: string,
  country = 'GB'
): Promise<{ url: string; state: string }> {
  return invoke({ action: 'start_link', bankName, country });
}

export async function checkCloudLink(
  state: string
): Promise<{ status: string; accountCount: number; bankName?: string }> {
  return invoke({ action: 'check_link', state });
}

export async function getCloudConnections(): Promise<CloudConnection[]> {
  const data = await invoke<{ connections: CloudConnection[] }>({ action: 'status' });
  return data.connections;
}

export async function removeCloudConnection(connectionId: string): Promise<void> {
  await invoke({ action: 'remove', connectionId });
}

// ── Sync ──

export async function syncCloudBanks(
  defaultType: 'business' | 'personal' = 'business'
): Promise<CloudSyncResult> {
  const result = await invoke<Omit<CloudSyncResult, 'pulledToDevice'>>({
    action: 'sync',
    defaultType,
  });

  // Bring the freshly-synced cloud rows down into local SQLite
  let pulledToDevice = 0;
  try {
    const pull = await syncAll();
    pulledToDevice = pull.pulled.transactions;
  } catch {
    // Offline pull failure is non-fatal — rows stay in the cloud until next sync
  }

  return { ...result, pulledToDevice };
}

// ── Throttled auto-sync (fire-and-forget on app launch) ──

const AUTO_SYNC_KEY = 'last_auto_bank_sync';
const AUTO_SYNC_INTERVAL_HOURS = 24;

/**
 * Runs a bank sync at most once per 24h. Banks rate-limit Open Banking
 * access (some to 4 calls/day per account), so this respects those limits
 * while keeping data fresh without the user thinking about it.
 */
export async function autoSyncIfDue(): Promise<void> {
  if (!(await isCloudBankAvailable())) return;

  try {
    const last = await SecureStore.getItemAsync(AUTO_SYNC_KEY);
    if (last) {
      const elapsedHours = (Date.now() - new Date(last).getTime()) / 3600000;
      if (elapsedHours < AUTO_SYNC_INTERVAL_HOURS) return;
    }
  } catch {
    // SecureStore unavailable — fall through and attempt the sync anyway
  }

  try {
    const connections = await getCloudConnections();
    if (!connections.some((c) => c.status === 'active' && !c.isExpired)) return;

    await syncCloudBanks();
    await SecureStore.setItemAsync(AUTO_SYNC_KEY, new Date().toISOString());
  } catch {
    // Silent: auto-sync must never disturb app startup
  }
}
