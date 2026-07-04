/**
 * bank-sync — Supabase Edge Function (Deno)
 *
 * Free, server-side Open Banking sync hub powered by Enable Banking
 * (free "restricted production" mode for your own accounts).
 *
 * The Enable Banking RS256 private key lives ONLY here (Supabase secrets),
 * never in the mobile app bundle. Synced transactions are written straight
 * into the `transactions` table; the app's existing cloud→local sync pulls
 * them into SQLite, and the Streamlit dashboard reads them directly.
 *
 * Secrets (set via `supabase secrets set`):
 *   EB_APPLICATION_ID    — Enable Banking application ID (JWT kid) [EU/EEA banks]
 *   EB_PRIVATE_KEY       — PKCS8 PEM private key (raw or base64-encoded)
 *   MONZO_CLIENT_ID      — Monzo OAuth client (developers.monzo.com) [UK, own account]
 *   MONZO_CLIENT_SECRET  — Monzo OAuth client secret (confidential client)
 *   CRON_SECRET          — shared secret for the scheduled cron_sync action
 *
 * Deploy with: supabase functions deploy bank-sync --no-verify-jwt
 * (JWT verification is done in-code; the GET /callback arrives from a
 *  browser redirect and cannot carry an Authorization header.)
 *
 * Actions (POST JSON {action, ...}, Authorization: Bearer <user JWT>):
 *   list_banks   {country?}                  → {banks: [{name, country, logo}]}
 *   start_link   {bankName, country?}        → {url, state}
 *   check_link   {state}                     → {status, accountCount}
 *   status       {}                          → {connections: [...]}
 *   sync         {connectionId?, dateFrom?, defaultType?} → {summaries, totalInserted}
 *   remove       {connectionId}              → {removed: true}
 *   cron_sync    {} + x-cron-secret header   → {summaries} (all users, service role)
 *
 * GET {function}/callback?code&state — Enable Banking redirect target.
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { SignJWT, importPKCS8 } from 'npm:jose@5';
import {
  EBTransaction,
  TransactionRow,
  ebToTransactionRow,
  isBooked,
} from './mapper.ts';
import {
  MonzoTransaction,
  isSettledMonzo,
  monzoToTransactionRow,
} from './monzo.ts';

const EB_BASE = 'https://api.enablebanking.com';
const CONSENT_DAYS = 90; // PSD2 default consent window
const SYNC_OVERLAP_DAYS = 3; // re-fetch overlap to catch late-booking transactions

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EB_APPLICATION_ID = Deno.env.get('EB_APPLICATION_ID') ?? '';
const EB_PRIVATE_KEY = Deno.env.get('EB_PRIVATE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const MONZO_CLIENT_ID = Deno.env.get('MONZO_CLIENT_ID') ?? '';
const MONZO_CLIENT_SECRET = Deno.env.get('MONZO_CLIENT_SECRET') ?? '';

function ebConfigured(): boolean {
  return Boolean(EB_APPLICATION_ID && EB_PRIVATE_KEY);
}
function monzoConfigured(): boolean {
  return Boolean(MONZO_CLIENT_ID && MONZO_CLIENT_SECRET);
}

// ── Enable Banking auth ──

let cachedEbJwt: { token: string; expiresAt: number } | null = null;

function privateKeyPem(): string {
  if (EB_PRIVATE_KEY.includes('-----BEGIN')) return EB_PRIVATE_KEY;
  // Allow base64-encoded PEM for easier secret handling
  return atob(EB_PRIVATE_KEY.replace(/\s/g, ''));
}

async function ebJwt(): Promise<string> {
  if (cachedEbJwt && Date.now() < cachedEbJwt.expiresAt) return cachedEbJwt.token;

  const key = await importPKCS8(privateKeyPem(), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: EB_APPLICATION_ID })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  cachedEbJwt = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return token;
}

async function ebRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await ebJwt();
  const res = await fetch(`${EB_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Enable Banking ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ── Monzo (personal OAuth) ──
// Tokens live in the bank_tokens table (RLS on, NO policies: service-role only).
// Monzo SCA limits transaction history to 90 days after each approval.

const MONZO_API = 'https://api.monzo.com';
const MONZO_AUTH = 'https://auth.monzo.com';
const MONZO_HISTORY_DAYS = 89;

interface MonzoTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function monzoTokenCall(params: Record<string, string>): Promise<MonzoTokens> {
  const res = await fetch(`${MONZO_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Monzo token request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<MonzoTokens>;
}

async function saveMonzoTokens(linkedBankId: string, userId: string, t: MonzoTokens): Promise<void> {
  const { error } = await serviceClient().from('bank_tokens').upsert({
    linked_bank_id: linkedBankId,
    user_id: userId,
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not store Monzo tokens: ${error.message}`);
}

/** Returns a live access token, refreshing (and rotating) if needed. */
async function monzoAccessToken(conn: { id: string; user_id: string }): Promise<string> {
  const { data, error } = await serviceClient()
    .from('bank_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('linked_bank_id', conn.id)
    .maybeSingle();
  if (error || !data) throw new Error('Monzo tokens missing — re-link this bank');

  if (new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.access_token;
  if (!data.refresh_token) throw new Error('Monzo session expired — re-link this bank');

  const refreshed = await monzoTokenCall({
    grant_type: 'refresh_token',
    client_id: MONZO_CLIENT_ID,
    client_secret: MONZO_CLIENT_SECRET,
    refresh_token: data.refresh_token,
  });
  await saveMonzoTokens(conn.id, conn.user_id, refreshed);
  return refreshed.access_token;
}

async function monzoGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${MONZO_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Monzo ${path.split('?')[0]} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** Open (non-closed) account ids for the authorized Monzo user. */
async function monzoAccountIds(token: string): Promise<string[]> {
  const data = await monzoGet<{ accounts: Array<{ id: string; closed?: boolean }> }>(
    token,
    '/accounts'
  );
  return (data.accounts ?? []).filter((a) => !a.closed).map((a) => a.id);
}

// ── Supabase clients ──

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

function userClient(authHeader: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
}

// ── Helpers ──

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function html(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#111125;color:#e2e0fc;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}
.card{background:#1a1a2e;border-radius:16px;padding:40px 32px;max-width:340px}
h1{font-size:20px;margin:0 0 8px}p{color:#becab9;font-size:14px;line-height:1.5}</style>
</head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function dateOnly(iso: string): string {
  return iso.split('T')[0];
}

function extractAccountUids(accounts: unknown[]): string[] {
  return (accounts ?? [])
    .map((a) =>
      typeof a === 'string' ? a : ((a as { uid?: string; account_uid?: string })?.uid ?? (a as { account_uid?: string })?.account_uid)
    )
    .filter((v): v is string => Boolean(v));
}

interface LinkedBankRow {
  id: string;
  user_id: string;
  requisition_id: string; // EB auth `state` token
  institution_id: string;
  institution_name: string;
  account_ids: string[];
  linked_at: string;
  expires_at: string;
  provider: string;
  session_id: string | null;
  status: string;
  last_synced_at: string | null;
}

// ── Sync core ──

interface SyncSummary {
  bankName: string;
  accountsProcessed: number;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

async function fetchEbTransactions(
  accountUid: string,
  dateFrom: string
): Promise<EBTransaction[]> {
  const all: EBTransaction[] = [];
  let continuationKey: string | undefined;

  do {
    const params = new URLSearchParams({ date_from: dateFrom });
    if (continuationKey) params.set('continuation_key', continuationKey);
    const data = await ebRequest<{ transactions: EBTransaction[]; continuation_key?: string }>(
      `/accounts/${accountUid}/transactions?${params}`
    );
    all.push(...(data.transactions ?? []));
    continuationKey = data.continuation_key || undefined;
  } while (continuationKey && all.length < 5000);

  return all;
}

async function syncConnection(
  db: SupabaseClient,
  conn: LinkedBankRow,
  dateFromOverride?: string,
  defaultType: 'business' | 'personal' = 'business'
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    bankName: conn.institution_name,
    accountsProcessed: 0,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  if (new Date(conn.expires_at) < new Date()) {
    summary.errors.push('Consent expired — re-link this bank');
    return summary;
  }

  const dateFrom =
    dateFromOverride ??
    (conn.last_synced_at
      ? dateOnly(new Date(new Date(conn.last_synced_at).getTime() - SYNC_OVERLAP_DAYS * 86400000).toISOString())
      : dateOnly(daysFromNowIso(-CONSENT_DAYS)));

  // Collect incoming rows from every account in the consent
  const nowIso = new Date().toISOString();
  const incoming: TransactionRow[] = [];

  for (const accountUid of conn.account_ids) {
    try {
      const txns = await fetchEbTransactions(accountUid, dateFrom);
      summary.accountsProcessed++;
      const booked = txns.filter(isBooked);
      summary.fetched += booked.length;

      for (const tx of booked) {
        const row = ebToTransactionRow(tx, {
          id: crypto.randomUUID(),
          userId: conn.user_id,
          defaultType,
          nowIso,
        });
        if (row) incoming.push(row);
      }
    } catch (e) {
      summary.errors.push(`Account ${accountUid.slice(0, 8)}…: ${(e as Error).message}`);
    }
  }

  return dedupAndInsert(db, conn, incoming, summary, dateFrom, nowIso);
}

/** Shared by every provider: dedup incoming rows against the cloud, insert, stamp last_synced_at. */
async function dedupAndInsert(
  db: SupabaseClient,
  conn: LinkedBankRow,
  incoming: TransactionRow[],
  summary: SyncSummary,
  dateFrom: string,
  nowIso: string
): Promise<SyncSummary> {
  if (incoming.length === 0) return summary;

  // Dedup against what's already in the cloud (same window + overlap buffer)
  const dedupFrom = dateOnly(
    new Date(new Date(dateFrom).getTime() - SYNC_OVERLAP_DAYS * 86400000).toISOString()
  );
  const { data: existing, error: exErr } = await db
    .from('transactions')
    .select('source_reference, dedup_hash')
    .eq('user_id', conn.user_id)
    .gte('date', dedupFrom)
    .limit(10000);

  if (exErr) {
    summary.errors.push(`Dedup query failed: ${exErr.message}`);
    return summary;
  }

  const seenRefs = new Set((existing ?? []).map((r) => r.source_reference).filter(Boolean));
  const seenHashes = new Set((existing ?? []).map((r) => r.dedup_hash).filter(Boolean));

  const fresh: TransactionRow[] = [];
  for (const row of incoming) {
    const dupByRef = row.source_reference && seenRefs.has(row.source_reference);
    const dupByHash = seenHashes.has(row.dedup_hash);
    if (dupByRef || dupByHash) {
      summary.skipped++;
      continue;
    }
    // also dedup within this batch
    if (row.source_reference) seenRefs.add(row.source_reference);
    seenHashes.add(row.dedup_hash);
    fresh.push(row);
  }

  for (let i = 0; i < fresh.length; i += 100) {
    const batch = fresh.slice(i, i + 100);
    const { error } = await db.from('transactions').insert(batch);
    if (error) {
      summary.errors.push(`Insert batch ${i}: ${error.message}`);
    } else {
      summary.inserted += batch.length;
    }
  }

  await db
    .from('linked_banks')
    .update({ last_synced_at: nowIso })
    .eq('id', conn.id);

  return summary;
}

// ── Monzo sync core ──

async function fetchMonzoTransactions(
  token: string,
  accountId: string,
  dateFrom: string
): Promise<MonzoTransaction[]> {
  const all: MonzoTransaction[] = [];
  let since = `${dateFrom}T00:00:00Z`;

  while (all.length < 5000) {
    const params = new URLSearchParams({ account_id: accountId, limit: '100', since });
    params.append('expand[]', 'merchant');
    const data = await monzoGet<{ transactions: MonzoTransaction[] }>(
      token,
      `/transactions?${params}`
    );
    const batch = data.transactions ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
    since = batch[batch.length - 1].id; // Monzo paginates by object id
  }

  return all;
}

async function syncMonzoConnection(
  db: SupabaseClient,
  conn: LinkedBankRow,
  dateFromOverride?: string,
  defaultType: 'business' | 'personal' = 'business'
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    bankName: conn.institution_name,
    accountsProcessed: 0,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  let token: string;
  try {
    token = await monzoAccessToken(conn);
  } catch (e) {
    summary.errors.push((e as Error).message);
    return summary;
  }

  let dateFrom =
    dateFromOverride ??
    (conn.last_synced_at
      ? dateOnly(new Date(new Date(conn.last_synced_at).getTime() - SYNC_OVERLAP_DAYS * 86400000).toISOString())
      : dateOnly(daysFromNowIso(-MONZO_HISTORY_DAYS)));

  // Monzo SCA: history older than ~90 days is inaccessible after approval
  const minFrom = dateOnly(daysFromNowIso(-MONZO_HISTORY_DAYS));
  if (dateFrom < minFrom) dateFrom = minFrom;

  const nowIso = new Date().toISOString();
  const incoming: TransactionRow[] = [];

  for (const accountId of conn.account_ids) {
    try {
      const txns = await fetchMonzoTransactions(token, accountId, dateFrom);
      summary.accountsProcessed++;
      const settled = txns.filter(isSettledMonzo);
      summary.fetched += settled.length;

      for (const tx of settled) {
        const row = monzoToTransactionRow(tx, {
          id: crypto.randomUUID(),
          userId: conn.user_id,
          defaultType,
          nowIso,
        });
        if (row) incoming.push(row);
      }
    } catch (e) {
      summary.errors.push(`Account ${accountId.slice(0, 8)}…: ${(e as Error).message}`);
    }
  }

  return dedupAndInsert(db, conn, incoming, summary, dateFrom, nowIso);
}

// ── Action handlers ──

async function handleListBanks(country: string) {
  const banks: Array<{ name: string; country: string; logo: string | null }> = [];

  // Monzo is a direct connector (no aggregator) — always first for GB
  if (monzoConfigured() && country.toUpperCase() === 'GB') {
    banks.push({ name: 'Monzo', country: 'GB', logo: null });
  }

  if (ebConfigured()) {
    try {
      const data = await ebRequest<{ aspsps: Array<{ name: string; country: string; logo?: string }> }>(
        `/aspsps?country=${encodeURIComponent(country)}`
      );
      banks.push(
        ...(data.aspsps ?? []).map((a) => ({ name: a.name, country: a.country, logo: a.logo ?? null }))
      );
    } catch (e) {
      // Enable Banking unavailable (e.g. app inactive) — still offer direct connectors
      if (banks.length === 0) throw e;
    }
  }

  return json({ banks });
}

async function handleMonzoStartLink(db: SupabaseClient, userId: string) {
  const state = crypto.randomUUID();
  const redirectUrl = `${SUPABASE_URL}/functions/v1/bank-sync/callback`;

  const { error } = await db.from('linked_banks').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    requisition_id: state,
    institution_id: 'GB:Monzo',
    institution_name: 'Monzo',
    account_ids: [],
    linked_at: new Date().toISOString(),
    expires_at: daysFromNowIso(CONSENT_DAYS),
    provider: 'monzo',
    session_id: null,
    status: 'pending',
  });
  if (error) throw new Error(`Could not store pending link: ${error.message}`);

  const url =
    `${MONZO_AUTH}/?client_id=${encodeURIComponent(MONZO_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
    `&response_type=code&state=${state}`;
  return json({ url, state });
}

async function handleStartLink(db: SupabaseClient, userId: string, bankName: string, country: string) {
  if (bankName === 'Monzo' && monzoConfigured()) {
    return await handleMonzoStartLink(db, userId);
  }
  if (!ebConfigured()) {
    throw new Error(`No provider available for ${bankName}. Configure Enable Banking secrets for aggregator banks.`);
  }
  const state = crypto.randomUUID();
  const validUntil = daysFromNowIso(CONSENT_DAYS);
  const redirectUrl = `${SUPABASE_URL}/functions/v1/bank-sync/callback`;

  const auth = await ebRequest<{ url: string }>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: bankName, country },
      state,
      redirect_url: redirectUrl,
      psu_type: 'personal',
    }),
  });

  const { error } = await db.from('linked_banks').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    requisition_id: state,
    institution_id: `${country}:${bankName}`,
    institution_name: bankName,
    account_ids: [],
    linked_at: new Date().toISOString(),
    expires_at: validUntil,
    provider: 'enable_banking',
    session_id: null,
    status: 'pending',
  });
  if (error) throw new Error(`Could not store pending link: ${error.message}`);

  return json({ url: auth.url, state });
}

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const ebError = url.searchParams.get('error');

  if (ebError) {
    return html(`<h1>Authorization failed</h1><p>${ebError}. You can close this page and try again in the app.</p>`, 400);
  }
  if (!code || !state) {
    return html('<h1>Missing parameters</h1><p>This page should be opened by your bank\'s redirect.</p>', 400);
  }

  const db = serviceClient();
  const { data: pending } = await db
    .from('linked_banks')
    .select('*')
    .eq('requisition_id', state)
    .eq('provider', 'enable_banking')
    .maybeSingle();

  if (!pending) {
    return html('<h1>Unknown link request</h1><p>Start the connection again from the app.</p>', 404);
  }

  if (pending.provider === 'monzo') {
    return await handleMonzoCallback(db, pending as LinkedBankRow, code);
  }

  try {
    const session = await ebRequest<{
      session_id: string;
      accounts: unknown[];
      access?: { valid_until?: string };
    }>('/sessions', { method: 'POST', body: JSON.stringify({ code }) });

    const accountIds = extractAccountUids(session.accounts);
    await db
      .from('linked_banks')
      .update({
        session_id: session.session_id,
        account_ids: accountIds,
        status: 'active',
        expires_at: session.access?.valid_until ?? pending.expires_at,
      })
      .eq('id', pending.id);

    return html(
      `<h1>✓ ${pending.institution_name} connected</h1>
       <p>${accountIds.length} account(s) linked. Return to the app and tap
       "I've Finished Authorization".</p>`
    );
  } catch (e) {
    return html(`<h1>Connection failed</h1><p>${(e as Error).message}</p>`, 500);
  }
}

async function handleMonzoCallback(db: SupabaseClient, pending: LinkedBankRow, code: string): Promise<Response> {
  try {
    const tokens = await monzoTokenCall({
      grant_type: 'authorization_code',
      client_id: MONZO_CLIENT_ID,
      client_secret: MONZO_CLIENT_SECRET,
      redirect_uri: `${SUPABASE_URL}/functions/v1/bank-sync/callback`,
      code,
    });
    await saveMonzoTokens(pending.id, pending.user_id, tokens);

    // Data endpoints stay 403 until the user approves access inside the Monzo
    // app (SCA). If that hasn't happened yet, stay pending — check_link retries.
    try {
      const accountIds = await monzoAccountIds(tokens.access_token);
      await db
        .from('linked_banks')
        .update({ account_ids: accountIds, status: 'active' })
        .eq('id', pending.id);
      return html(
        `<h1>✓ Monzo connected</h1>
         <p>${accountIds.length} account(s) linked. Return to the tracker app and tap
         "I've Finished Authorization".</p>`
      );
    } catch {
      return html(
        `<h1>Almost there</h1>
         <p><strong>Open your Monzo app and approve access</strong> (you'll see a prompt),
         then return to the tracker and tap "I've Finished Authorization".</p>`
      );
    }
  } catch (e) {
    return html(`<h1>Connection failed</h1><p>${(e as Error).message}</p>`, 500);
  }
}

async function handleCheckLink(db: SupabaseClient, userId: string, state: string) {
  const { data } = await db
    .from('linked_banks')
    .select('*')
    .eq('requisition_id', state)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return json({ status: 'not_found', accountCount: 0 });

  // Monzo links stay pending until the in-app approval happens — retry here
  if (data.provider === 'monzo' && data.status === 'pending') {
    try {
      const token = await monzoAccessToken(data as LinkedBankRow);
      const accountIds = await monzoAccountIds(token);
      await db
        .from('linked_banks')
        .update({ account_ids: accountIds, status: 'active' })
        .eq('id', data.id);
      return json({ status: 'active', accountCount: accountIds.length, bankName: data.institution_name });
    } catch {
      return json({ status: 'pending', accountCount: 0, bankName: data.institution_name });
    }
  }

  return json({
    status: data.status,
    accountCount: (data.account_ids ?? []).length,
    bankName: data.institution_name,
  });
}

async function handleStatus(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('linked_banks')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'enable_banking')
    .order('linked_at', { ascending: false });
  if (error) throw new Error(error.message);

  const now = Date.now();
  return json({
    connections: (data ?? []).map((row) => {
      const daysRemaining = Math.max(
        0,
        Math.ceil((new Date(row.expires_at).getTime() - now) / 86400000)
      );
      return {
        id: row.id,
        institutionName: row.institution_name,
        accountCount: (row.account_ids ?? []).length,
        status: row.status,
        daysRemaining,
        isExpired: daysRemaining <= 0,
        lastSyncedAt: row.last_synced_at,
      };
    }),
  });
}

async function handleSync(
  db: SupabaseClient,
  userId: string,
  connectionId?: string,
  dateFrom?: string,
  defaultType: 'business' | 'personal' = 'business'
) {
  let query = db
    .from('linked_banks')
    .select('*')
    .eq('user_id', userId)
    .in('provider', ['enable_banking', 'monzo'])
    .eq('status', 'active');
  if (connectionId) query = query.eq('id', connectionId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const summaries: SyncSummary[] = [];
  for (const row of (data ?? []) as LinkedBankRow[]) {
    summaries.push(
      row.provider === 'monzo'
        ? await syncMonzoConnection(db, row, dateFrom, defaultType)
        : await syncConnection(db, row, dateFrom, defaultType)
    );
  }

  return json({
    summaries,
    totalInserted: summaries.reduce((s, x) => s + x.inserted, 0),
    totalSkipped: summaries.reduce((s, x) => s + x.skipped, 0),
  });
}

async function handleRemove(db: SupabaseClient, userId: string, connectionId: string) {
  const { data } = await db
    .from('linked_banks')
    .select('session_id, provider')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.provider === 'enable_banking' && data?.session_id) {
    try {
      await ebRequest(`/sessions/${data.session_id}`, { method: 'DELETE' });
    } catch {
      // Session may already be expired at Enable Banking — local removal still proceeds
    }
  }
  // Monzo: bank_tokens row is removed by ON DELETE CASCADE with linked_banks

  const { error } = await db
    .from('linked_banks')
    .delete()
    .eq('id', connectionId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return json({ removed: true });
}

async function handleCronSync() {
  const db = serviceClient();
  const { data, error } = await db
    .from('linked_banks')
    .select('*')
    .in('provider', ['enable_banking', 'monzo'])
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  const summaries: Array<SyncSummary & { userId: string }> = [];
  for (const row of (data ?? []) as LinkedBankRow[]) {
    const s =
      row.provider === 'monzo'
        ? await syncMonzoConnection(db, row)
        : await syncConnection(db, row);
    summaries.push({ ...s, userId: row.user_id });
  }
  return json({ summaries, syncedConnections: summaries.length });
}

// ── Router ──

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  try {
    // Browser redirect target from the bank authorization flow
    if (req.method === 'GET' && url.pathname.endsWith('/callback')) {
      return await handleCallback(url);
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    if (!ebConfigured() && !monzoConfigured()) {
      return json(
        {
          error:
            'No bank provider configured. Set MONZO_CLIENT_ID + MONZO_CLIENT_SECRET (Monzo, UK) ' +
            'and/or EB_APPLICATION_ID + EB_PRIVATE_KEY (Enable Banking, EU/EEA) secrets.',
        },
        503
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // Scheduled sync (pg_cron) authenticates with a shared secret
    if (action === 'cron_sync') {
      if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
        return json({ error: 'Unauthorized' }, 401);
      }
      return await handleCronSync();
    }

    // Everything else requires a signed-in app user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const db = userClient(authHeader);
    const { data: userData, error: userErr } = await db.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'Invalid or expired session' }, 401);
    const userId = userData.user.id;

    switch (action) {
      case 'list_banks':
        return await handleListBanks(body.country ?? 'GB');
      case 'start_link':
        if (!body.bankName) return json({ error: 'bankName required' }, 400);
        return await handleStartLink(db, userId, body.bankName, body.country ?? 'GB');
      case 'check_link':
        if (!body.state) return json({ error: 'state required' }, 400);
        return await handleCheckLink(db, userId, body.state);
      case 'status':
        return await handleStatus(db, userId);
      case 'sync':
        return await handleSync(db, userId, body.connectionId, body.dateFrom, body.defaultType ?? 'business');
      case 'remove':
        if (!body.connectionId) return json({ error: 'connectionId required' }, 400);
        return await handleRemove(db, userId, body.connectionId);
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
