/**
 * Pure mapping helpers for the Monzo provider of the bank-sync Edge Function.
 *
 * Monzo (developers.monzo.com) gives free OAuth access to your OWN account —
 * the free UK path now that Enable Banking's restricted mode is EU/EEA-only
 * and GoCardless is closed to new signups.
 *
 * No Deno/runtime imports here — unit-tested by __tests__/monzoMapper.test.ts
 * to guarantee the dedup hash stays byte-identical with the app's
 * src/services/deduplication.ts and with mapper.ts (Enable Banking).
 */

import { TransactionRow, generateDedupHash } from './mapper.ts';

// ── Monzo transaction shape (subset we consume) ──
// https://docs.monzo.com/#transactions

export interface MonzoMerchant {
  name?: string | null;
}

export interface MonzoTransaction {
  id: string;
  created: string; // RFC3339
  description?: string | null;
  /** Minor units (pence). Negative = money out — already the app's convention. */
  amount: number;
  currency?: string | null;
  notes?: string | null;
  /** Empty string until the transaction settles. */
  settled?: string | null;
  decline_reason?: string | null;
  /** Object when fetched with expand[]=merchant, otherwise an id string. */
  merchant?: MonzoMerchant | string | null;
  counterparty?: { name?: string | null } | null;
}

// ── Field helpers ──

/** Booked-equivalent filter: settled, not declined, not a £0 card check. */
export function isSettledMonzo(tx: MonzoTransaction): boolean {
  return !tx.decline_reason && Boolean(tx.settled) && tx.amount !== 0;
}

/** Monzo amounts are integer minor units with the sign already correct. */
export function monzoAmount(tx: MonzoTransaction): number {
  return Math.round(tx.amount) / 100;
}

export function monzoMerchantName(tx: MonzoTransaction): string | null {
  if (tx.merchant && typeof tx.merchant === 'object' && tx.merchant.name) {
    return tx.merchant.name;
  }
  return tx.counterparty?.name || null;
}

export function monzoDescription(tx: MonzoTransaction): string {
  return (
    monzoMerchantName(tx) ||
    (tx.description ?? '').trim() ||
    (tx.notes ?? '').trim() ||
    'Monzo transaction'
  );
}

/** Settlement date when available, else creation date (both RFC3339). */
export function monzoDate(tx: MonzoTransaction): string | null {
  const iso = tx.settled || tx.created;
  if (!iso) return null;
  return iso.split('T')[0];
}

// ── Row mapping ──

export interface MonzoMapOptions {
  id: string;
  userId: string;
  defaultType: 'business' | 'personal';
  nowIso: string;
}

export function monzoToTransactionRow(
  tx: MonzoTransaction,
  opts: MonzoMapOptions
): TransactionRow | null {
  const date = monzoDate(tx);
  if (!date) return null;

  const amount = monzoAmount(tx);
  const description = monzoDescription(tx);

  return {
    id: opts.id,
    user_id: opts.userId,
    date,
    description,
    amount,
    currency: tx.currency || 'GBP',
    type: opts.defaultType,
    category: null,
    import_source: 'bank_sync',
    source_reference: tx.id ?? null,
    merchant_name: monzoMerchantName(tx),
    notes: null,
    is_duplicate: false,
    duplicate_of_id: null,
    dedup_hash: generateDedupHash(date, amount, description),
    validation_status: 'unverified',
    matched_source_ids: null,
    created_at: opts.nowIso,
    updated_at: opts.nowIso,
  };
}
