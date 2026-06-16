/**
 * Pure mapping helpers for the bank-sync Edge Function.
 *
 * No Deno/runtime imports here — this file is shared logic that is also
 * unit-tested by the app's Jest suite (__tests__/bankSyncMapper.test.ts)
 * to guarantee the dedup hash stays byte-identical with
 * src/services/deduplication.ts. If you change the hash there, change it here.
 */

// ── Enable Banking transaction shape (subset we consume) ──

export interface EBAmount {
  currency: string;
  amount: string;
}

export interface EBParty {
  name?: string | null;
}

export interface EBTransaction {
  entry_reference?: string | null;
  merchant_category_code?: string | null;
  transaction_amount: EBAmount;
  creditor?: EBParty | null;
  debtor?: EBParty | null;
  credit_debit_indicator?: 'CRDT' | 'DBIT' | null;
  status?: string | null; // BOOK | PDNG | INFO
  booking_date?: string | null;
  transaction_date?: string | null;
  value_date?: string | null;
  remittance_information?: string[] | null;
  note?: string | null;
}

// ── Output row (snake_case, matches the Supabase transactions table) ──

export interface TransactionRow {
  id: string;
  user_id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: 'business' | 'personal';
  category: null;
  import_source: 'bank_sync';
  source_reference: string | null;
  merchant_name: string | null;
  notes: string | null;
  is_duplicate: boolean;
  duplicate_of_id: null;
  dedup_hash: string;
  validation_status: 'unverified';
  matched_source_ids: null;
  created_at: string;
  updated_at: string;
}

// ── Dedup hash (mirror of src/services/deduplication.ts) ──

export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateDedupHash(date: string, amount: number, description: string): string {
  const normalDate = date.split('T')[0];
  const normalAmount = Math.abs(amount).toFixed(2);
  const normalDesc = normalizeDescription(description);
  return `${normalDate}|${normalAmount}|${normalDesc}`;
}

// ── Enable Banking → transactions row ──

export function isBooked(tx: EBTransaction): boolean {
  // Some banks omit status entirely; treat missing as booked.
  return !tx.status || tx.status === 'BOOK';
}

export function ebTransactionDate(tx: EBTransaction): string | null {
  return tx.booking_date || tx.transaction_date || tx.value_date || null;
}

export function ebTransactionDescription(tx: EBTransaction): string {
  const remittance = (tx.remittance_information || []).filter(Boolean).join(' ').trim();
  return (
    remittance ||
    tx.creditor?.name ||
    tx.debtor?.name ||
    tx.note ||
    'Bank transaction'
  );
}

export function ebSignedAmount(tx: EBTransaction): number {
  const raw = parseFloat(tx.transaction_amount.amount);
  if (Number.isNaN(raw)) return 0;
  // App convention: negative = expense, positive = income.
  if (tx.credit_debit_indicator === 'DBIT') return -Math.abs(raw);
  if (tx.credit_debit_indicator === 'CRDT') return Math.abs(raw);
  return raw; // no indicator — trust the bank's sign
}

export function ebMerchantName(tx: EBTransaction): string | null {
  // For money out, the counterparty is the creditor; for money in, the debtor.
  if (tx.credit_debit_indicator === 'DBIT') return tx.creditor?.name || tx.debtor?.name || null;
  if (tx.credit_debit_indicator === 'CRDT') return tx.debtor?.name || tx.creditor?.name || null;
  return tx.creditor?.name || tx.debtor?.name || null;
}

export interface MapOptions {
  id: string;
  userId: string;
  defaultType: 'business' | 'personal';
  nowIso: string;
}

/**
 * Convert one Enable Banking transaction into a Supabase transactions row.
 * Returns null for rows that cannot be dated (nothing to anchor dedup on).
 */
export function ebToTransactionRow(tx: EBTransaction, opts: MapOptions): TransactionRow | null {
  const date = ebTransactionDate(tx);
  if (!date) return null;

  const description = ebTransactionDescription(tx);
  const amount = ebSignedAmount(tx);

  return {
    id: opts.id,
    user_id: opts.userId,
    date,
    description,
    amount,
    currency: tx.transaction_amount.currency || 'GBP',
    type: opts.defaultType,
    category: null,
    import_source: 'bank_sync',
    source_reference: tx.entry_reference || null,
    merchant_name: ebMerchantName(tx),
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
