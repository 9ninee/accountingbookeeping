import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getCurrentSession } from './authService';
import {
  getTransactions,
  getMileageTrips,
  insertTransactionBatch,
  insertMileageTrip,
  updateMileageTrip,
  getRoutePointsForTrip,
} from './database';
import { Transaction, MileageTrip, RoutePoint } from '../models/types';

// ── Sync Metadata ──

const SYNC_KEY_TRANSACTIONS = 'last_sync_transactions';
const SYNC_KEY_TRIPS = 'last_sync_trips';

let syncInProgress = false;

interface SyncResult {
  pushed: { transactions: number; trips: number };
  pulled: { transactions: number; trips: number };
  errors: string[];
}

// ── Helpers ──

async function getLastSyncTime(key: string): Promise<string | null> {
  const { data } = await supabase
    .from('sync_metadata')
    .select('last_synced_at')
    .eq('key', key)
    .single();
  return data?.last_synced_at ?? null;
}

async function setLastSyncTime(key: string, time: string): Promise<void> {
  await supabase.from('sync_metadata').upsert(
    { key, last_synced_at: time, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

function transactionToRow(t: Transaction, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    date: t.date,
    description: t.description,
    amount: t.amount,
    currency: t.currency,
    type: t.type,
    category: t.category,
    import_source: t.importSource,
    source_reference: t.sourceReference,
    merchant_name: t.merchantName,
    notes: t.notes,
    is_duplicate: t.isDuplicate,
    duplicate_of_id: t.duplicateOfId,
    dedup_hash: t.dedupHash,
    validation_status: t.validationStatus,
    matched_source_ids: t.matchedSourceIds,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

function rowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    type: row.type,
    category: row.category,
    importSource: row.import_source,
    sourceReference: row.source_reference,
    merchantName: row.merchant_name,
    notes: row.notes,
    isDuplicate: row.is_duplicate,
    duplicateOfId: row.duplicate_of_id,
    dedupHash: row.dedup_hash,
    validationStatus: row.validation_status,
    matchedSourceIds: row.matched_source_ids,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function tripToRow(t: MileageTrip, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    start_time: t.startTime,
    end_time: t.endTime,
    start_latitude: t.startLatitude,
    start_longitude: t.startLongitude,
    end_latitude: t.endLatitude,
    end_longitude: t.endLongitude,
    distance_miles: t.distanceMiles,
    is_active: t.isActive,
    purpose: t.purpose,
    notes: t.notes,
    storage_tier: t.storageTier,
    created_at: t.createdAt,
  };
}

function rowToTrip(row: any): MileageTrip {
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    startLatitude: row.start_latitude,
    startLongitude: row.start_longitude,
    endLatitude: row.end_latitude,
    endLongitude: row.end_longitude,
    distanceMiles: row.distance_miles,
    isActive: row.is_active,
    purpose: row.purpose,
    notes: row.notes,
    routePoints: [],
    storageTier: row.storage_tier,
    createdAt: row.created_at,
  };
}

// ── Push: Local → Cloud ──

async function pushTransactions(userId: string, since: string | null): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const allLocal = await getTransactions();
  const toPush = since
    ? allLocal.filter((t) => t.updatedAt > since)
    : allLocal;

  if (toPush.length === 0) return { count: 0, errors };

  // Upsert in batches of 100
  const BATCH = 100;
  let pushed = 0;
  for (let i = 0; i < toPush.length; i += BATCH) {
    const batch = toPush.slice(i, i + BATCH).map((t) => transactionToRow(t, userId));
    const { error } = await supabase.from('transactions').upsert(batch, { onConflict: 'id' });
    if (error) {
      errors.push(`Push transactions batch ${i}: ${error.message}`);
    } else {
      pushed += batch.length;
    }
  }

  return { count: pushed, errors };
}

async function pushTrips(userId: string, since: string | null): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const allLocal = await getMileageTrips();
  const toPush = since
    ? allLocal.filter((t) => t.createdAt > since)
    : allLocal;

  if (toPush.length === 0) return { count: 0, errors };

  const BATCH = 50;
  let pushed = 0;
  for (let i = 0; i < toPush.length; i += BATCH) {
    const batch = toPush.slice(i, i + BATCH);
    const rows = batch.map((t) => tripToRow(t, userId));
    const { error } = await supabase.from('mileage_trips').upsert(rows, { onConflict: 'id' });
    if (error) {
      errors.push(`Push trips batch ${i}: ${error.message}`);
      continue;
    }
    pushed += batch.length;

    // Push route points for each trip
    for (const trip of batch) {
      const points = await getRoutePointsForTrip(trip.id);
      if (points.length > 0) {
        const pointRows = points.map((p, idx) => ({
          trip_id: trip.id,
          user_id: userId,
          seq: idx,
          latitude: p.latitude,
          longitude: p.longitude,
          timestamp: p.timestamp,
          speed: p.speed,
        }));

        // Delete existing then insert (idempotent)
        await supabase.from('route_points').delete().eq('trip_id', trip.id);
        const rpBatch = 200;
        for (let j = 0; j < pointRows.length; j += rpBatch) {
          const { error: rpErr } = await supabase.from('route_points').insert(pointRows.slice(j, j + rpBatch));
          if (rpErr) errors.push(`Push route_points trip ${trip.id}: ${rpErr.message}`);
        }
      }
    }
  }

  return { count: pushed, errors };
}

// ── Pull: Cloud → Local ──

async function pullTransactions(userId: string, since: string | null): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });

  if (since) {
    query = query.gt('updated_at', since);
  }

  const { data, error } = await query.limit(1000);
  if (error) {
    return { count: 0, errors: [error.message] };
  }
  if (!data || data.length === 0) return { count: 0, errors };

  const transactions = data.map(rowToTransaction);
  try {
    await insertTransactionBatch(transactions);
  } catch (e: any) {
    errors.push(`Pull insert: ${e.message}`);
  }

  return { count: data.length, errors };
}

async function pullTrips(userId: string, since: string | null): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let query = supabase
    .from('mileage_trips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (since) {
    query = query.gt('created_at', since);
  }

  const { data, error } = await query.limit(500);
  if (error) {
    return { count: 0, errors: [error.message] };
  }
  if (!data || data.length === 0) return { count: 0, errors };

  let pulled = 0;
  for (const row of data) {
    const trip = rowToTrip(row);
    try {
      await insertMileageTrip(trip);
      pulled++;
    } catch {
      // Already exists locally — update instead
      try {
        await updateMileageTrip(trip.id, {
          endTime: trip.endTime,
          endLatitude: trip.endLatitude,
          endLongitude: trip.endLongitude,
          distanceMiles: trip.distanceMiles,
          isActive: trip.isActive,
          notes: trip.notes,
        });
        pulled++;
      } catch (e: any) {
        errors.push(`Pull trip ${trip.id}: ${e.message}`);
      }
    }
  }

  return { count: pulled, errors };
}

// ── Full Bidirectional Sync ──

export async function syncAll(): Promise<SyncResult> {
  const result: SyncResult = {
    pushed: { transactions: 0, trips: 0 },
    pulled: { transactions: 0, trips: 0 },
    errors: [],
  };

  if (!isSupabaseConfigured()) {
    result.errors.push('Supabase not configured. Add your project URL and anon key in supabaseClient.ts');
    return result;
  }

  if (syncInProgress) {
    result.errors.push('Sync already in progress');
    return result;
  }

  syncInProgress = true;

  try {
    const session = await getCurrentSession();
    if (!session?.user) {
      result.errors.push('Not authenticated. Please sign in first.');
      return result;
    }

    const userId = session.user.id;
    const now = new Date().toISOString();

    // Get last sync times
    const [lastTxnSync, lastTripSync] = await Promise.all([
      getLastSyncTime(SYNC_KEY_TRANSACTIONS),
      getLastSyncTime(SYNC_KEY_TRIPS),
    ]);

    // Push local changes, then pull remote changes
    const [pushTxn, pushTrip] = await Promise.all([
      pushTransactions(userId, lastTxnSync),
      pushTrips(userId, lastTripSync),
    ]);

    result.pushed.transactions = pushTxn.count;
    result.pushed.trips = pushTrip.count;
    result.errors.push(...pushTxn.errors, ...pushTrip.errors);

    const [pullTxn, pullTrip] = await Promise.all([
      pullTransactions(userId, lastTxnSync),
      pullTrips(userId, lastTripSync),
    ]);

    result.pulled.transactions = pullTxn.count;
    result.pulled.trips = pullTrip.count;
    result.errors.push(...pullTxn.errors, ...pullTrip.errors);

    // Update sync timestamps
    if (result.errors.length === 0) {
      await Promise.all([
        setLastSyncTime(SYNC_KEY_TRANSACTIONS, now),
        setLastSyncTime(SYNC_KEY_TRIPS, now),
      ]);
    }
  } catch (e: any) {
    result.errors.push(`Sync failed: ${e.message}`);
  } finally {
    syncInProgress = false;
  }

  return result;
}

export function isSyncing(): boolean {
  return syncInProgress;
}
