import * as SQLite from 'expo-sqlite';
import { Transaction, MileageTrip, RoutePoint, PaginationParams, PaginatedResult, StorageTier } from '../models/types';

const DB_NAME = 'uber_driver_tracker.db';
const CURRENT_DB_VERSION = 4;

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await initializeDatabase(db);
  }
  return db;
}

async function initializeDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  // Version 1: Base schema
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      type TEXT NOT NULL CHECK (type IN ('business', 'personal')),
      category TEXT,
      import_source TEXT NOT NULL CHECK (import_source IN ('manual', 'csv_import', 'apple_wallet', 'bank_sync')),
      source_reference TEXT,
      merchant_name TEXT,
      notes TEXT,
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      duplicate_of_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (duplicate_of_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS mileage_trips (
      id TEXT PRIMARY KEY,
      start_time TEXT NOT NULL,
      end_time TEXT,
      start_latitude REAL NOT NULL,
      start_longitude REAL NOT NULL,
      end_latitude REAL,
      end_longitude REAL,
      distance_miles REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      purpose TEXT NOT NULL DEFAULT 'uber_trip',
      notes TEXT,
      route_points TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_sync_config (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      access_token TEXT,
      institution_id TEXT,
      institution_name TEXT,
      last_sync_at TEXT,
      account_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_source_ref ON transactions(source_reference);
    CREATE INDEX IF NOT EXISTS idx_transactions_duplicate ON transactions(is_duplicate);
    CREATE INDEX IF NOT EXISTS idx_mileage_start ON mileage_trips(start_time);
    CREATE INDEX IF NOT EXISTS idx_mileage_active ON mileage_trips(is_active);
  `);

  // Run migrations
  await runMigrations(database);
}

async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  const versionRow: any = await database.getFirstAsync('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 2) {
    await migrateToV2(database);
  }

  if (currentVersion < 3) {
    await migrateToV3(database);
  }

  if (currentVersion < 4) {
    await migrateToV4(database);
  }

  if (currentVersion < CURRENT_DB_VERSION) {
    await database.execAsync(`PRAGMA user_version = ${CURRENT_DB_VERSION}`);
  }
}

async function migrateToV2(database: SQLite.SQLiteDatabase): Promise<void> {
  // Add new columns to transactions if they don't exist
  const txnColumns = await getTableColumns(database, 'transactions');

  if (!txnColumns.includes('dedup_hash')) {
    await database.execAsync('ALTER TABLE transactions ADD COLUMN dedup_hash TEXT');
  }
  if (!txnColumns.includes('validation_status')) {
    await database.execAsync("ALTER TABLE transactions ADD COLUMN validation_status TEXT DEFAULT 'unverified'");
  }
  if (!txnColumns.includes('matched_source_ids')) {
    await database.execAsync('ALTER TABLE transactions ADD COLUMN matched_source_ids TEXT');
  }

  // Add storage_tier to mileage_trips
  const tripColumns = await getTableColumns(database, 'mileage_trips');
  if (!tripColumns.includes('storage_tier')) {
    await database.execAsync("ALTER TABLE mileage_trips ADD COLUMN storage_tier TEXT DEFAULT 'hot'");
  }

  // Create route_points table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS route_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timestamp TEXT NOT NULL,
      speed REAL,
      FOREIGN KEY (trip_id) REFERENCES mileage_trips(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_route_points_trip_seq ON route_points(trip_id, seq);
  `);

  // Create new indexes for dedup performance
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_transactions_dedup_hash ON transactions(dedup_hash);
    CREATE INDEX IF NOT EXISTS idx_transactions_date_amount ON transactions(date, amount);
  `);

  // Migrate existing route_points JSON blobs to the new table
  await migrateRoutePointsToTable(database);
}

async function migrateToV3(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS linked_banks (
      id TEXT PRIMARY KEY,
      requisition_id TEXT NOT NULL,
      institution_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      account_ids TEXT NOT NULL DEFAULT '[]',
      linked_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_linked_banks_institution ON linked_banks(institution_id);
  `);
}

async function migrateToV4(database: SQLite.SQLiteDatabase): Promise<void> {
  // This is a UK app and amounts have always been GBP, but early versions
  // defaulted the currency column to 'USD' for manual, CSV and wallet imports
  // (bank sync always wrote 'GBP'). Relabel those rows so they render as GBP.
  await database.execAsync(
    "UPDATE transactions SET currency = 'GBP' WHERE currency = 'USD' OR currency IS NULL"
  );
}

async function migrateRoutePointsToTable(database: SQLite.SQLiteDatabase): Promise<void> {
  // Check if there are trips with non-empty route_points JSON that haven't been migrated
  const trips: any[] = await database.getAllAsync(
    "SELECT id, route_points FROM mileage_trips WHERE route_points != '[]' AND route_points IS NOT NULL LIMIT 50"
  );

  if (trips.length === 0) return;

  await database.withTransactionAsync(async () => {
    for (const trip of trips) {
      try {
        const points: RoutePoint[] = JSON.parse(trip.route_points || '[]');
        if (points.length === 0) continue;

        // Check if already migrated
        const existing: any = await database.getFirstAsync(
          'SELECT COUNT(*) as cnt FROM route_points WHERE trip_id = ?', trip.id
        );
        if (existing?.cnt > 0) continue;

        // Batch insert route points
        for (let i = 0; i < points.length; i += 50) {
          const batch = points.slice(i, i + 50);
          const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
          const values: any[] = [];
          batch.forEach((p, idx) => {
            values.push(trip.id, i + idx, p.latitude, p.longitude, p.timestamp, p.speed);
          });
          await database.runAsync(
            `INSERT INTO route_points (trip_id, seq, latitude, longitude, timestamp, speed) VALUES ${placeholders}`,
            ...values
          );
        }

        // Clear the old JSON blob to save space
        await database.runAsync(
          "UPDATE mileage_trips SET route_points = '[]' WHERE id = ?", trip.id
        );
      } catch {
        // Skip trips with invalid JSON
      }
    }
  });
}

async function getTableColumns(database: SQLite.SQLiteDatabase, tableName: string): Promise<string[]> {
  const rows: any[] = await database.getAllAsync(`PRAGMA table_info(${tableName})`);
  return rows.map((r) => r.name);
}

// ── Transaction CRUD ──

export async function insertTransaction(txn: Transaction): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO transactions (id, date, description, amount, currency, type, category,
      import_source, source_reference, merchant_name, notes, is_duplicate, duplicate_of_id,
      dedup_hash, validation_status, matched_source_ids, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    txn.id, txn.date, txn.description, txn.amount, txn.currency,
    txn.type, txn.category, txn.importSource, txn.sourceReference,
    txn.merchantName, txn.notes, txn.isDuplicate ? 1 : 0,
    txn.duplicateOfId, txn.dedupHash,
    txn.validationStatus || 'unverified',
    txn.matchedSourceIds ? JSON.stringify(txn.matchedSourceIds) : null,
    txn.createdAt, txn.updatedAt
  );
}

export async function insertTransactionBatch(transactions: Transaction[]): Promise<{
  inserted: number;
  duplicates: number;
}> {
  const database = await getDatabase();
  let inserted = 0;
  let duplicates = 0;

  await database.withTransactionAsync(async () => {
    for (const txn of transactions) {
      if (txn.isDuplicate) {
        duplicates++;
        continue;
      }
      await database.runAsync(
        `INSERT OR IGNORE INTO transactions (id, date, description, amount, currency, type, category,
          import_source, source_reference, merchant_name, notes, is_duplicate, duplicate_of_id,
          dedup_hash, validation_status, matched_source_ids, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        txn.id, txn.date, txn.description, txn.amount, txn.currency,
        txn.type, txn.category, txn.importSource, txn.sourceReference,
        txn.merchantName, txn.notes, txn.isDuplicate ? 1 : 0,
        txn.duplicateOfId, txn.dedupHash,
        txn.validationStatus || 'unverified',
        txn.matchedSourceIds ? JSON.stringify(txn.matchedSourceIds) : null,
        txn.createdAt, txn.updatedAt
      );
      inserted++;
    }
  });

  return { inserted, duplicates };
}

export async function getTransactions(filters?: {
  type?: 'business' | 'personal';
  startDate?: string;
  endDate?: string;
  category?: string;
  importSource?: string;
  excludeDuplicates?: boolean;
}, pagination?: PaginationParams): Promise<Transaction[]> {
  const database = await getDatabase();
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params: any[] = [];

  if (filters?.type) {
    query += ' AND type = ?';
    params.push(filters.type);
  }
  if (filters?.startDate) {
    query += ' AND date >= ?';
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    query += ' AND date <= ?';
    params.push(filters.endDate);
  }
  if (filters?.category) {
    query += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters?.importSource) {
    query += ' AND import_source = ?';
    params.push(filters.importSource);
  }
  if (filters?.excludeDuplicates !== false) {
    query += ' AND is_duplicate = 0';
  }

  query += ' ORDER BY date DESC';

  if (pagination) {
    query += ' LIMIT ? OFFSET ?';
    params.push(pagination.limit, pagination.offset);
  }

  const rows = await database.getAllAsync(query, params);
  return rows.map(mapRowToTransaction);
}

export async function getTransactionsPaginated(
  filters?: {
    type?: 'business' | 'personal';
    startDate?: string;
    endDate?: string;
    category?: string;
    importSource?: string;
    excludeDuplicates?: boolean;
  },
  pagination: PaginationParams = { limit: 50, offset: 0 }
): Promise<PaginatedResult<Transaction>> {
  const database = await getDatabase();
  let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE 1=1';
  let dataQuery = 'SELECT * FROM transactions WHERE 1=1';
  const params: any[] = [];

  if (filters?.type) {
    const clause = ' AND type = ?';
    countQuery += clause;
    dataQuery += clause;
    params.push(filters.type);
  }
  if (filters?.startDate) {
    const clause = ' AND date >= ?';
    countQuery += clause;
    dataQuery += clause;
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    const clause = ' AND date <= ?';
    countQuery += clause;
    dataQuery += clause;
    params.push(filters.endDate);
  }
  if (filters?.category) {
    const clause = ' AND category = ?';
    countQuery += clause;
    dataQuery += clause;
    params.push(filters.category);
  }
  if (filters?.importSource) {
    const clause = ' AND import_source = ?';
    countQuery += clause;
    dataQuery += clause;
    params.push(filters.importSource);
  }
  if (filters?.excludeDuplicates !== false) {
    const clause = ' AND is_duplicate = 0';
    countQuery += clause;
    dataQuery += clause;
  }

  const countRow: any = await database.getFirstAsync(countQuery, params);
  const total = countRow?.total ?? 0;

  dataQuery += ' ORDER BY date DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, pagination.limit, pagination.offset];

  const rows = await database.getAllAsync(dataQuery, dataParams);
  const data = rows.map(mapRowToTransaction);

  return {
    data,
    total,
    hasMore: pagination.offset + data.length < total,
    offset: pagination.offset,
    limit: pagination.limit,
  };
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  const database = await getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type); }
  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
  if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
  if (updates.isDuplicate !== undefined) { fields.push('is_duplicate = ?'); values.push(updates.isDuplicate ? 1 : 0); }
  if (updates.duplicateOfId !== undefined) { fields.push('duplicate_of_id = ?'); values.push(updates.duplicateOfId); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.amount !== undefined) { fields.push('amount = ?'); values.push(updates.amount); }
  if (updates.validationStatus !== undefined) { fields.push('validation_status = ?'); values.push(updates.validationStatus); }
  if (updates.matchedSourceIds !== undefined) {
    fields.push('matched_source_ids = ?');
    values.push(updates.matchedSourceIds ? JSON.stringify(updates.matchedSourceIds) : null);
  }
  if (updates.dedupHash !== undefined) { fields.push('dedup_hash = ?'); values.push(updates.dedupHash); }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await database.runAsync(
    `UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`,
    ...values
  );
}

export async function deleteTransaction(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

// Date-windowed dedup query for scalability
export async function getTransactionsForDedupInRange(
  minDate: string,
  maxDate: string
): Promise<Pick<Transaction, 'id' | 'date' | 'description' | 'amount' | 'sourceReference' | 'merchantName' | 'dedupHash'>[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    `SELECT id, date, description, amount, source_reference, merchant_name, dedup_hash
     FROM transactions
     WHERE is_duplicate = 0 AND date >= ? AND date <= ?`,
    minDate, maxDate
  );
  return rows.map((row: any) => ({
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    sourceReference: row.source_reference,
    merchantName: row.merchant_name,
    dedupHash: row.dedup_hash,
  }));
}

// Hash-based fast lookup
export async function findTransactionsByDedupHash(
  hashes: string[]
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const database = await getDatabase();
  const foundHashes = new Set<string>();

  // Process in batches of 100 to avoid SQLite variable limits
  for (let i = 0; i < hashes.length; i += 100) {
    const batch = hashes.slice(i, i + 100);
    const placeholders = batch.map(() => '?').join(',');
    const rows: any[] = await database.getAllAsync(
      `SELECT dedup_hash FROM transactions WHERE dedup_hash IN (${placeholders}) AND is_duplicate = 0`,
      ...batch
    );
    rows.forEach((r) => foundHashes.add(r.dedup_hash));
  }

  return foundHashes;
}

// Legacy compat — now delegates to date-windowed version
export async function getAllTransactionsForDedup(): Promise<Pick<Transaction, 'id' | 'date' | 'description' | 'amount' | 'sourceReference' | 'merchantName'>[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    'SELECT id, date, description, amount, source_reference, merchant_name FROM transactions WHERE is_duplicate = 0'
  );
  return rows.map((row: any) => ({
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    sourceReference: row.source_reference,
    merchantName: row.merchant_name,
  }));
}

// ── Mileage CRUD ──

export async function insertMileageTrip(trip: MileageTrip): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO mileage_trips (id, start_time, end_time, start_latitude, start_longitude,
      end_latitude, end_longitude, distance_miles, is_active, purpose, notes, route_points,
      storage_tier, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    trip.id, trip.startTime, trip.endTime, trip.startLatitude, trip.startLongitude,
    trip.endLatitude, trip.endLongitude, trip.distanceMiles, trip.isActive ? 1 : 0,
    trip.purpose, trip.notes, '[]', trip.storageTier || 'hot', trip.createdAt
  );
}

export async function updateMileageTrip(id: string, updates: Partial<MileageTrip>): Promise<void> {
  const database = await getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.endTime !== undefined) { fields.push('end_time = ?'); values.push(updates.endTime); }
  if (updates.endLatitude !== undefined) { fields.push('end_latitude = ?'); values.push(updates.endLatitude); }
  if (updates.endLongitude !== undefined) { fields.push('end_longitude = ?'); values.push(updates.endLongitude); }
  if (updates.distanceMiles !== undefined) { fields.push('distance_miles = ?'); values.push(updates.distanceMiles); }
  if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
  if (updates.purpose !== undefined) { fields.push('purpose = ?'); values.push(updates.purpose); }
  if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
  if (updates.storageTier !== undefined) { fields.push('storage_tier = ?'); values.push(updates.storageTier); }
  // Route points now go to the route_points table — legacy field kept as '[]'
  if (updates.routePoints !== undefined) {
    fields.push('route_points = ?');
    values.push('[]');
  }

  if (fields.length === 0) return;
  values.push(id);

  await database.runAsync(
    `UPDATE mileage_trips SET ${fields.join(', ')} WHERE id = ?`,
    ...values
  );
}

export async function getMileageTrips(
  filters?: {
    startDate?: string;
    endDate?: string;
    purpose?: string;
    activeOnly?: boolean;
  },
  pagination?: PaginationParams
): Promise<MileageTrip[]> {
  const database = await getDatabase();
  let query = 'SELECT * FROM mileage_trips WHERE 1=1';
  const params: any[] = [];

  if (filters?.startDate) {
    query += ' AND start_time >= ?';
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    query += ' AND start_time <= ?';
    params.push(filters.endDate);
  }
  if (filters?.purpose) {
    query += ' AND purpose = ?';
    params.push(filters.purpose);
  }
  if (filters?.activeOnly) {
    query += ' AND is_active = 1';
  }

  query += ' ORDER BY start_time DESC';

  if (pagination) {
    query += ' LIMIT ? OFFSET ?';
    params.push(pagination.limit, pagination.offset);
  }

  const rows = await database.getAllAsync(query, params);
  return rows.map(mapRowToMileageTrip);
}

export async function getMileageTripsPaginated(
  filters?: {
    startDate?: string;
    endDate?: string;
    purpose?: string;
    activeOnly?: boolean;
  },
  pagination: PaginationParams = { limit: 50, offset: 0 }
): Promise<PaginatedResult<MileageTrip>> {
  const database = await getDatabase();
  let countQuery = 'SELECT COUNT(*) as total FROM mileage_trips WHERE 1=1';
  let dataQuery = 'SELECT * FROM mileage_trips WHERE 1=1';
  const params: any[] = [];

  if (filters?.startDate) {
    const clause = ' AND start_time >= ?';
    countQuery += clause;
    dataQuery += clause;
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    const clause = ' AND start_time <= ?';
    countQuery += clause;
    dataQuery += clause;
    params.push(filters.endDate);
  }
  if (filters?.purpose) {
    const clause = ' AND purpose = ?';
    countQuery += clause;
    dataQuery += clause;
    params.push(filters.purpose);
  }
  if (filters?.activeOnly) {
    const clause = ' AND is_active = 1';
    countQuery += clause;
    dataQuery += clause;
  }

  const countRow: any = await database.getFirstAsync(countQuery, params);
  const total = countRow?.total ?? 0;

  dataQuery += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, pagination.limit, pagination.offset];

  const rows = await database.getAllAsync(dataQuery, dataParams);
  const data = rows.map(mapRowToMileageTrip);

  return {
    data,
    total,
    hasMore: pagination.offset + data.length < total,
    offset: pagination.offset,
    limit: pagination.limit,
  };
}

export async function getActiveTrip(): Promise<MileageTrip | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    'SELECT * FROM mileage_trips WHERE is_active = 1 ORDER BY start_time DESC LIMIT 1'
  );
  return row ? mapRowToMileageTrip(row) : null;
}

// ── Route Points (Normalized Table) ──

export async function insertRoutePointsBatch(
  tripId: string,
  points: RoutePoint[],
  startSeq: number = 0
): Promise<void> {
  if (points.length === 0) return;
  const database = await getDatabase();

  await database.withTransactionAsync(async () => {
    for (let i = 0; i < points.length; i += 50) {
      const batch = points.slice(i, i + 50);
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
      const values: any[] = [];
      batch.forEach((p, idx) => {
        values.push(tripId, startSeq + i + idx, p.latitude, p.longitude, p.timestamp, p.speed);
      });
      await database.runAsync(
        `INSERT INTO route_points (trip_id, seq, latitude, longitude, timestamp, speed) VALUES ${placeholders}`,
        ...values
      );
    }
  });
}

export async function getRoutePointsForTrip(tripId: string): Promise<RoutePoint[]> {
  const database = await getDatabase();
  const rows: any[] = await database.getAllAsync(
    'SELECT latitude, longitude, timestamp, speed FROM route_points WHERE trip_id = ? ORDER BY seq',
    tripId
  );
  return rows.map((r) => ({
    latitude: r.latitude,
    longitude: r.longitude,
    timestamp: r.timestamp,
    speed: r.speed,
  }));
}

export async function getRoutePointCount(tripId: string): Promise<number> {
  const database = await getDatabase();
  const row: any = await database.getFirstAsync(
    'SELECT COUNT(*) as cnt FROM route_points WHERE trip_id = ?', tripId
  );
  return row?.cnt ?? 0;
}

export async function deleteRoutePointsForTrip(tripId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM route_points WHERE trip_id = ?', tripId);
}

export async function replaceRoutePointsForTrip(tripId: string, points: RoutePoint[]): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM route_points WHERE trip_id = ?', tripId);
    if (points.length > 0) {
      await insertRoutePointsBatch(tripId, points, 0);
    }
  });
}

// ── Trips by storage tier (for archival) ──

export async function getTripsByStorageTier(
  tier: StorageTier,
  olderThan: string,
  limit: number = 20
): Promise<MileageTrip[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    `SELECT * FROM mileage_trips
     WHERE storage_tier = ? AND is_active = 0 AND start_time < ?
     ORDER BY start_time ASC LIMIT ?`,
    tier, olderThan, limit
  );
  return rows.map(mapRowToMileageTrip);
}

export async function updateTripStorageTier(id: string, tier: StorageTier): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE mileage_trips SET storage_tier = ? WHERE id = ?', tier, id
  );
}

// ── Summaries ──

export async function getTransactionSummary(startDate: string, endDate: string): Promise<{
  totalIncome: number;
  totalBusinessExpenses: number;
  totalPersonalExpenses: number;
  byCategory: Record<string, number>;
}> {
  const database = await getDatabase();

  const incomeRow: any = await database.getFirstAsync(
    'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE amount > 0 AND date >= ? AND date <= ? AND is_duplicate = 0',
    startDate, endDate
  );

  const bizExpRow: any = await database.getFirstAsync(
    'SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE amount < 0 AND type = ? AND date >= ? AND date <= ? AND is_duplicate = 0',
    'business', startDate, endDate
  );

  const persExpRow: any = await database.getFirstAsync(
    'SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE amount < 0 AND type = ? AND date >= ? AND date <= ? AND is_duplicate = 0',
    'personal', startDate, endDate
  );

  const catRows: any[] = await database.getAllAsync(
    'SELECT category, SUM(ABS(amount)) as total FROM transactions WHERE date >= ? AND date <= ? AND is_duplicate = 0 AND category IS NOT NULL GROUP BY category',
    startDate, endDate
  );

  const byCategory: Record<string, number> = {};
  for (const row of catRows) {
    byCategory[row.category] = row.total;
  }

  return {
    totalIncome: incomeRow?.total ?? 0,
    totalBusinessExpenses: bizExpRow?.total ?? 0,
    totalPersonalExpenses: persExpRow?.total ?? 0,
    byCategory,
  };
}

export async function getMileageSummary(startDate: string, endDate: string): Promise<{
  totalMiles: number;
  tripCount: number;
}> {
  const database = await getDatabase();
  const row: any = await database.getFirstAsync(
    'SELECT COALESCE(SUM(distance_miles), 0) as total_miles, COUNT(*) as trip_count FROM mileage_trips WHERE start_time >= ? AND start_time <= ? AND is_active = 0',
    startDate, endDate
  );
  return {
    totalMiles: row?.total_miles ?? 0,
    tripCount: row?.trip_count ?? 0,
  };
}

// ── Storage Info ──

export async function getDatabaseSize(): Promise<number> {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const dbDir = `${FileSystem.documentDirectory}SQLite/`;
    const fileInfo = await FileSystem.getInfoAsync(`${dbDir}${DB_NAME}`);
    return (fileInfo as any)?.size ?? 0;
  } catch {
    return 0;
  }
}

export async function getRoutePointsTotalCount(): Promise<number> {
  const database = await getDatabase();
  const row: any = await database.getFirstAsync('SELECT COUNT(*) as cnt FROM route_points');
  return row?.cnt ?? 0;
}

// ── Row mappers ──

function mapRowToTransaction(row: any): Transaction {
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
    isDuplicate: row.is_duplicate === 1,
    duplicateOfId: row.duplicate_of_id,
    dedupHash: row.dedup_hash || null,
    validationStatus: row.validation_status || 'unverified',
    matchedSourceIds: row.matched_source_ids ? JSON.parse(row.matched_source_ids) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToMileageTrip(row: any): MileageTrip {
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    startLatitude: row.start_latitude,
    startLongitude: row.start_longitude,
    endLatitude: row.end_latitude,
    endLongitude: row.end_longitude,
    distanceMiles: row.distance_miles,
    isActive: row.is_active === 1,
    purpose: row.purpose,
    notes: row.notes,
    routePoints: [], // Route points now loaded lazily via getRoutePointsForTrip()
    storageTier: row.storage_tier || 'hot',
    createdAt: row.created_at,
  };
}
