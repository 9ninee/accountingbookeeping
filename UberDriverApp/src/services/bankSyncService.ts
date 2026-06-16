import { Transaction, BankSyncConfig, ImportSource } from '../models/types';
import { generateId } from '../utils/helpers';
import { deduplicateAndPrepare } from './deduplication';
import { insertTransactionBatch, getDatabase } from './database';
import { PLAID_ENV } from '@env';

const PLAID_HOST = PLAID_ENV === 'production'
  ? 'https://production.plaid.com'
  : PLAID_ENV === 'development'
    ? 'https://development.plaid.com'
    : 'https://sandbox.plaid.com';

const PLAID_API_BASE = `${PLAID_HOST}/api/plaid`;
const TRUELAYER_API_BASE = 'https://your-backend.com/api/truelayer';

// ── Bank connection management ──

/**
 * Initiate the bank linking flow.
 * Returns a URL to open in a WebView so the user can authorize access.
 */
export async function initiateBankLink(provider: 'plaid' | 'truelayer'): Promise<{
  linkUrl: string;
  sessionId: string;
} | null> {
  const apiBase = provider === 'plaid' ? PLAID_API_BASE : TRUELAYER_API_BASE;

  try {
    const response = await fetch(`${apiBase}/create-link-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'mobile' }),
    });

    if (!response.ok) return null;
    const data = await response.json();

    return {
      linkUrl: data.link_url || data.linkUrl,
      sessionId: data.session_id || data.sessionId,
    };
  } catch {
    return null;
  }
}

/**
 * Exchange the public token (received after user authorizes in WebView)
 * for a persistent access token.
 */
export async function exchangeBankToken(
  provider: 'plaid' | 'truelayer',
  publicToken: string
): Promise<BankSyncConfig | null> {
  const apiBase = provider === 'plaid' ? PLAID_API_BASE : TRUELAYER_API_BASE;

  try {
    const response = await fetch(`${apiBase}/exchange-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token: publicToken }),
    });

    if (!response.ok) return null;
    const data = await response.json();

    const config: BankSyncConfig = {
      provider,
      accessToken: data.access_token,
      institutionId: data.institution_id || null,
      institutionName: data.institution_name || null,
      lastSyncAt: null,
      accountIds: data.account_ids || [],
    };

    // Save to DB
    const database = await getDatabase();
    await database.runAsync(
      `INSERT OR REPLACE INTO bank_sync_config (id, provider, access_token, institution_id, institution_name, last_sync_at, account_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      generateId(), config.provider, config.accessToken, config.institutionId,
      config.institutionName, config.lastSyncAt, JSON.stringify(config.accountIds)
    );

    return config;
  } catch {
    return null;
  }
}

/**
 * Fetch transactions from a connected bank account.
 */
export async function fetchBankTransactions(
  config: BankSyncConfig,
  startDate: string,
  endDate: string
): Promise<BankTransaction[]> {
  const apiBase = config.provider === 'plaid' ? PLAID_API_BASE : TRUELAYER_API_BASE;

  try {
    const response = await fetch(`${apiBase}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: config.accessToken,
        start_date: startDate,
        end_date: endDate,
        account_ids: config.accountIds,
      }),
    });

    if (!response.ok) return [];
    const data = await response.json();

    return (data.transactions || []).map((t: any) => ({
      transactionId: t.transaction_id || t.id,
      accountId: t.account_id,
      date: t.date || t.booking_date,
      description: t.name || t.description || t.merchant_name || '',
      amount: t.amount,
      currency: t.iso_currency_code || t.currency || 'USD',
      merchantName: t.merchant_name || null,
      category: t.category?.[0] || null,
      pending: t.pending || false,
    }));
  } catch {
    return [];
  }
}

export interface BankTransaction {
  transactionId: string;
  accountId: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  merchantName: string | null;
  category: string | null;
  pending: boolean;
}

/**
 * Convert bank transactions to our internal format.
 */
export function bankToTransactions(
  bankTxns: BankTransaction[],
  defaultType: 'business' | 'personal' = 'business'
): Transaction[] {
  const now = new Date().toISOString();

  return bankTxns
    .filter((bt) => !bt.pending) // skip pending transactions
    .map((bt) => ({
      id: generateId(),
      date: bt.date,
      description: bt.description,
      amount: -bt.amount, // Plaid reports expenses as positive, we use negative
      currency: bt.currency,
      type: defaultType,
      category: null,
      importSource: 'bank_sync' as ImportSource,
      sourceReference: bt.transactionId,
      merchantName: bt.merchantName,
      notes: null,
      isDuplicate: false,
      duplicateOfId: null,
      dedupHash: null,
      validationStatus: 'unverified' as const,
      matchedSourceIds: null,
      createdAt: now,
      updatedAt: now,
    }));
}

/**
 * Full sync pipeline: fetch from bank → convert → deduplicate → insert.
 */
export async function syncBankTransactions(
  config: BankSyncConfig,
  startDate: string,
  endDate: string,
  defaultType: 'business' | 'personal' = 'business'
): Promise<{
  success: boolean;
  inserted: number;
  duplicates: number;
  errors: string[];
  reviewResult?: import('../models/types').ImportReviewResult;
}> {
  const bankTxns = await fetchBankTransactions(config, startDate, endDate);

  if (bankTxns.length === 0) {
    return { success: true, inserted: 0, duplicates: 0, errors: [] };
  }

  const transactions = bankToTransactions(bankTxns, defaultType);
  const { clean, duplicates } = await deduplicateAndPrepare(transactions);
  const result = await insertTransactionBatch(clean);

  // Update last sync time
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE bank_sync_config SET last_sync_at = datetime('now') WHERE provider = ?`,
    config.provider
  );

  return {
    success: true,
    inserted: result.inserted,
    duplicates: duplicates.length,
    errors: [],
  };
}

/**
 * Get saved bank sync configurations.
 */
export async function getSavedBankConfigs(): Promise<BankSyncConfig[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync('SELECT * FROM bank_sync_config');
  return rows.map((row: any) => ({
    provider: row.provider,
    accessToken: row.access_token,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    lastSyncAt: row.last_sync_at,
    accountIds: JSON.parse(row.account_ids || '[]'),
  }));
}
