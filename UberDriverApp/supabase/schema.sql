-- ============================================================
-- Uber Driver Tracker — Supabase Cloud Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable Row Level Security on all tables
-- Each user can only access their own data

-- ── Sync Metadata ──
CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;

-- ── Transactions ──
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  type TEXT CHECK (type IN ('business', 'personal')),
  category TEXT,
  import_source TEXT CHECK (import_source IN ('manual', 'csv_import', 'apple_wallet', 'bank_sync')),
  source_reference TEXT,
  merchant_name TEXT,
  notes TEXT,
  is_duplicate BOOLEAN DEFAULT FALSE,
  duplicate_of_id UUID,
  dedup_hash TEXT,
  validation_status TEXT DEFAULT 'unverified',
  matched_source_ids JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_dedup ON transactions(user_id, dedup_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_updated ON transactions(user_id, updated_at);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own transactions"
  ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE USING (auth.uid() = user_id);

-- ── Mileage Trips ──
CREATE TABLE IF NOT EXISTS mileage_trips (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  start_latitude DOUBLE PRECISION NOT NULL,
  start_longitude DOUBLE PRECISION NOT NULL,
  end_latitude DOUBLE PRECISION,
  end_longitude DOUBLE PRECISION,
  distance_miles DOUBLE PRECISION DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  purpose TEXT DEFAULT 'uber_trip',
  notes TEXT,
  storage_tier TEXT DEFAULT 'hot',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_user ON mileage_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_start ON mileage_trips(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_trips_created ON mileage_trips(user_id, created_at);

ALTER TABLE mileage_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own trips"
  ON mileage_trips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trips"
  ON mileage_trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trips"
  ON mileage_trips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trips"
  ON mileage_trips FOR DELETE USING (auth.uid() = user_id);

-- ── Route Points ──
CREATE TABLE IF NOT EXISTS route_points (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES mileage_trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  speed DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_route_trip ON route_points(trip_id, seq);
CREATE INDEX IF NOT EXISTS idx_route_user ON route_points(user_id);

ALTER TABLE route_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own route points"
  ON route_points FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own route points"
  ON route_points FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own route points"
  ON route_points FOR DELETE USING (auth.uid() = user_id);

-- ── Linked Banks (Open Banking consents) ──
CREATE TABLE IF NOT EXISTS linked_banks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requisition_id TEXT NOT NULL,
  institution_id TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  account_ids JSONB NOT NULL DEFAULT '[]',
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_linked_banks_user ON linked_banks(user_id);

ALTER TABLE linked_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own linked banks"
  ON linked_banks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own linked banks"
  ON linked_banks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own linked banks"
  ON linked_banks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own linked banks"
  ON linked_banks FOR DELETE USING (auth.uid() = user_id);

-- ── Auto-update updated_at trigger ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
