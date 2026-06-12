-- ============================================================
-- OPTIONAL: Automatic daily bank sync (free on Supabase)
--
-- Schedules the bank-sync Edge Function to run every morning so
-- transactions arrive even when the app hasn't been opened.
--
-- Before running:
--   1. Replace YOUR_PROJECT_REF with your Supabase project ref
--      (the subdomain of your project URL).
--   2. Replace YOUR_CRON_SECRET with the same value you set via:
--      supabase secrets set CRON_SECRET=...
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor).
-- ============================================================

-- Enable the scheduling + HTTP extensions (both free on all tiers)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove a previous schedule if re-running this script
SELECT cron.unschedule('daily-bank-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-bank-sync');

-- Sync all linked banks every day at 06:00 UTC.
-- Banks rate-limit Open Banking access (some to 4 calls/day per account),
-- so once daily is the sweet spot.
SELECT cron.schedule(
  'daily-bank-sync',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/bank-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object('action', 'cron_sync'),
    timeout_milliseconds := 120000
  );
  $$
);

-- Verify the job is registered:
-- SELECT jobname, schedule, active FROM cron.job;
