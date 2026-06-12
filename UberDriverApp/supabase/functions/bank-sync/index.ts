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
 *   EB_APPLICATION_ID  — Enable Banking application ID (JWT kid)
 *   EB_PRIVATE_KEY     — PKCS8 PEM private key (raw or base64-encoded)
 *   CRON_SECRET        — shared secret for the scheduled cron_sync action
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

const EB_BASE = 'https://api.enablebanking.com';
const CONSENT_DAYS = 90; // PSD2 default consent window
const SYNC_OVERLAP_DAYS = 3; // re-fetch overlap to catch late-booking transactions

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EB_APPLICATION_ID = Deno.env.get('EB_APPLICATION_ID') ?? '';
const EB_PRIVATE_KEY = Deno.env.get('EB_PRIVATE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

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

// ── Action handlers ──

async function handleListBanks(country: string) {
  const data = await ebRequest<{ aspsps: Array<{ name: string; country: string; logo?: string }> }>(
    `/aspsps?country=${encodeURIComponent(country)}`
  );
  return json({
    banks: (data.aspsps ?? []).map((a) => ({ name: a.name, country: a.country, logo: a.logo ?? null })),
  });
}

async function handleStartLink(db: SupabaseClient, userId: string, bankName: string, country: string) {
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

async function handleCheckLink(db: SupabaseClient, userId: string, state: string) {
  const { data } = await db
    .from('linked_banks')
    .select('status, account_ids, institution_name')
    .eq('requisition_id', state)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return json({ status: 'not_found', accountCount: 0 });
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
    .eq('provider', 'enable_banking')
    .eq('status', 'active');
  if (connectionId) query = query.eq('id', connectionId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const summaries: SyncSummary[] = [];
  for (const row of (data ?? []) as LinkedBankRow[]) {
    summaries.push(await syncConnection(db, row, dateFrom, defaultType));
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
    .select('session_id')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.session_id) {
    try {
      await ebRequest(`/sessions/${data.session_id}`, { method: 'DELETE' });
    } catch {
      // Session may already be expired at Enable Banking — local removal still proceeds
    }
  }

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
    .eq('provider', 'enable_banking')
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  const summaries: Array<SyncSummary & { userId: string }> = [];
  for (const row of (data ?? []) as LinkedBankRow[]) {
    const s = await syncConnection(db, row);
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

    if (!EB_APPLICATION_ID || !EB_PRIVATE_KEY) {
      return json(
        { error: 'Enable Banking not configured. Set EB_APPLICATION_ID and EB_PRIVATE_KEY secrets.' },
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
