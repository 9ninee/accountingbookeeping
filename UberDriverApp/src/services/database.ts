import * as SQLite from 'expo-sqlite';
import { Transaction, MileageTrip } from '../models/types';

const DB_NAME = 'uber_driver_tracker.db';

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

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
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
}

// ── Transaction CRUD ──

export async function insertTransaction(txn: Transaction): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO transactions (id, date, description, amount, currency, type, category,
      import_source, source_reference, merchant_name, notes, is_duplicate, duplicate_of_id,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    txn.id, txn.date, txn.description, txn.amount, txn.currency,
    txn.type, txn.category, txn.importSource, txn.sourceReference,
    txn.merchantName, txn.notes, txn.isDuplicate ? 1 : 0,
    txn.duplicateOfId, txn.createdAt, txn.updatedAt
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
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        txn.id, txn.date, txn.description, txn.amount, txn.currency,
        txn.type, txn.category, txn.importSource, txn.sourceReference,
        txn.merchantName, txn.notes, txn.isDuplicate ? 1 : 0,
        txn.duplicateOfId, txn.createdAt, txn.updatedAt
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
}): Promise<Transaction[]> {
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

  const rows = await database.getAllAsync(query, params);
  return rows.map(mapRowToTransaction);
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
      end_latitude, end_longitude, distance_miles, is_active, purpose, notes, route_points, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    trip.id, trip.startTime, trip.endTime, trip.startLatitude, trip.startLongitude,
    trip.endLatitude, trip.endLongitude, trip.distanceMiles, trip.isActive ? 1 : 0,
    trip.purpose, trip.notes, JSON.stringify(trip.routePoints), trip.createdAt
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
  if (updates.routePoints !== undefined) { fields.push('route_points = ?'); values.push(JSON.stringify(updates.routePoints)); }

  if (fields.length === 0) return;
  values.push(id);

  await database.runAsync(
    `UPDATE mileage_trips SET ${fields.join(', ')} WHERE id = ?`,
    ...values
  );
}

export async function getMileageTrips(filters?: {
  startDate?: string;
  endDate?: string;
  purpose?: string;
  activeOnly?: boolean;
}): Promise<MileageTrip[]> {
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

  const rows = await database.getAllAsync(query, params);
  return rows.map(mapRowToMileageTrip);
}

export async function getActiveTrip(): Promise<MileageTrip | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    'SELECT * FROM mileage_trips WHERE is_active = 1 ORDER BY start_time DESC LIMIT 1'
  );
  return row ? mapRowToMileageTrip(row) : null;
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
    routePoints: JSON.parse(row.route_points || '[]'),
    createdAt: row.created_at,
  };
}
