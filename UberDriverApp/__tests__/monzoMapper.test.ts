/**
 * Tests for the bank-sync Edge Function's Monzo mapping logic.
 *
 * Same guarantee as bankSyncMapper.test.ts: the dedup hash of every row the
 * server writes must be byte-identical to what the app would compute, so
 * Monzo-synced transactions dedupe cleanly against CSV/wallet imports.
 */

import {
  MonzoTransaction,
  isSettledMonzo,
  monzoAmount,
  monzoDescription,
  monzoDate,
  monzoMerchantName,
  monzoToTransactionRow,
} from '../supabase/functions/bank-sync/monzo';
import { generateDedupHash as appHash } from '../src/services/deduplication';

const base: MonzoTransaction = {
  id: 'tx_0000Abc',
  created: '2026-07-01T09:30:00.000Z',
  amount: -1250,
  currency: 'GBP',
  settled: '2026-07-02T01:00:00.000Z',
};

describe('isSettledMonzo', () => {
  it('accepts settled transactions and rejects pending/declined/zero', () => {
    expect(isSettledMonzo(base)).toBe(true);
    expect(isSettledMonzo({ ...base, settled: '' })).toBe(false);
    expect(isSettledMonzo({ ...base, settled: null })).toBe(false);
    expect(isSettledMonzo({ ...base, decline_reason: 'INSUFFICIENT_FUNDS' })).toBe(false);
    expect(isSettledMonzo({ ...base, amount: 0 })).toBe(false); // active-card check
  });
});

describe('monzoAmount', () => {
  it('converts minor units to pounds, keeping the sign (debit negative)', () => {
    expect(monzoAmount({ ...base, amount: -1250 })).toBe(-12.5);
    expect(monzoAmount({ ...base, amount: 300 })).toBe(3);
    expect(monzoAmount({ ...base, amount: -1 })).toBe(-0.01);
  });
});

describe('monzoDescription / monzoMerchantName', () => {
  it('prefers expanded merchant name', () => {
    const tx = { ...base, merchant: { name: 'Shell Petrol' }, description: 'SHELL GB' };
    expect(monzoMerchantName(tx)).toBe('Shell Petrol');
    expect(monzoDescription(tx)).toBe('Shell Petrol');
  });

  it('ignores unexpanded merchant id strings', () => {
    const tx = { ...base, merchant: 'merch_0000X' as unknown as string, description: 'SHELL GB' };
    expect(monzoMerchantName(tx)).toBeNull();
    expect(monzoDescription(tx)).toBe('SHELL GB');
  });

  it('falls back through counterparty → description → notes → default', () => {
    expect(monzoDescription({ ...base, counterparty: { name: 'Nigel L' } })).toBe('Nigel L');
    expect(monzoDescription({ ...base, description: 'FASTER PAYMENT' })).toBe('FASTER PAYMENT');
    expect(monzoDescription({ ...base, description: '  ', notes: 'petrol money' })).toBe('petrol money');
    expect(monzoDescription({ ...base, description: '' })).toBe('Monzo transaction');
  });
});

describe('monzoDate', () => {
  it('prefers the settlement date, falls back to created', () => {
    expect(monzoDate(base)).toBe('2026-07-02');
    expect(monzoDate({ ...base, settled: '' })).toBe('2026-07-01');
    expect(monzoDate({ ...base, settled: '', created: '' })).toBeNull();
  });
});

describe('monzoToTransactionRow', () => {
  const opts = {
    id: 'row-1',
    userId: 'user-1',
    defaultType: 'business' as const,
    nowIso: '2026-07-04T00:00:00.000Z',
  };

  it('produces a complete snake_case row matching the cloud schema', () => {
    const row = monzoToTransactionRow(
      { ...base, merchant: { name: 'Shell Petrol' } },
      opts
    );

    expect(row).toEqual({
      id: 'row-1',
      user_id: 'user-1',
      date: '2026-07-02',
      description: 'Shell Petrol',
      amount: -12.5,
      currency: 'GBP',
      type: 'business',
      category: null,
      import_source: 'bank_sync',
      source_reference: 'tx_0000Abc',
      merchant_name: 'Shell Petrol',
      notes: null,
      is_duplicate: false,
      duplicate_of_id: null,
      dedup_hash: '2026-07-02|12.50|shell petrol',
      validation_status: 'unverified',
      matched_source_ids: null,
      created_at: opts.nowIso,
      updated_at: opts.nowIso,
    });
  });

  it('hash matches what the app would compute on import (dedup parity)', () => {
    const cases: MonzoTransaction[] = [
      { ...base, merchant: { name: 'UBER *TRIP HELP.UBER.COM' }, amount: -899 },
      { ...base, description: 'Salary — ACME Ltd.', amount: 123456 },
      { ...base, notes: '   Multiple    Spaces   ', description: '', amount: -1 },
    ];
    for (const tx of cases) {
      const row = monzoToTransactionRow(tx, opts)!;
      expect(row.dedup_hash).toBe(appHash(row.date, row.amount, row.description));
    }
  });

  it('returns null when no date can be determined', () => {
    expect(monzoToTransactionRow({ ...base, settled: '', created: '' }, opts)).toBeNull();
  });
});
