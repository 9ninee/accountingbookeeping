/**
 * Tests for the bank-sync Edge Function's pure mapping logic.
 *
 * The critical guarantee: the server-side dedup hash must be byte-identical
 * to the app's (src/services/deduplication.ts), so transactions synced in
 * the cloud are recognized as duplicates of CSV/wallet imports and vice versa.
 */

import {
  generateDedupHash as serverHash,
  normalizeDescription as serverNormalize,
  ebToTransactionRow,
  ebSignedAmount,
  ebTransactionDescription,
  ebTransactionDate,
  ebMerchantName,
  isBooked,
  EBTransaction,
} from '../supabase/functions/bank-sync/mapper';
import {
  generateDedupHash as appHash,
  normalizeDescription as appNormalize,
} from '../src/services/deduplication';

describe('dedup hash parity (server ↔ app)', () => {
  const cases: Array<[string, number, string]> = [
    ['2026-01-15', -42.5, 'Shell Gas Station #1234'],
    ['2026-01-15T14:30:00Z', 42.5, 'Shell Gas Station #1234'],
    ['2026-06-01', -9.99, 'UBER *TRIP HELP.UBER.COM'],
    ['2026-06-01', 1234.567, 'Salary — ACME Ltd.'],
    ['2026-02-28', -0.01, '   Multiple    Spaces   '],
    ['2026-12-31', 100, 'café & croissant £3'],
  ];

  it.each(cases)('hash("%s", %d, "%s") matches the app', (date, amount, desc) => {
    expect(serverHash(date, amount, desc)).toBe(appHash(date, amount, desc));
  });

  it('normalizes descriptions identically', () => {
    const samples = ['UBER *TRIP', 'Shell #42 LTD.', '  spaces   everywhere  ', 'ÀÇÇENTS!'];
    for (const s of samples) {
      expect(serverNormalize(s)).toBe(appNormalize(s));
    }
  });

  it('strips time component and uses absolute 2dp amount', () => {
    expect(serverHash('2026-03-10T09:00:00Z', -25.5, 'Fuel')).toBe('2026-03-10|25.50|fuel');
  });
});

describe('ebSignedAmount', () => {
  it('makes debits negative (app convention: expense < 0)', () => {
    expect(
      ebSignedAmount({
        transaction_amount: { currency: 'GBP', amount: '12.34' },
        credit_debit_indicator: 'DBIT',
      })
    ).toBe(-12.34);
  });

  it('makes credits positive even if the bank reports them negative', () => {
    expect(
      ebSignedAmount({
        transaction_amount: { currency: 'GBP', amount: '-50.00' },
        credit_debit_indicator: 'CRDT',
      })
    ).toBe(50);
  });

  it('trusts the bank sign when no indicator is present', () => {
    expect(
      ebSignedAmount({ transaction_amount: { currency: 'GBP', amount: '-7.25' } })
    ).toBe(-7.25);
  });

  it('returns 0 for unparseable amounts', () => {
    expect(
      ebSignedAmount({ transaction_amount: { currency: 'GBP', amount: 'n/a' } })
    ).toBe(0);
  });
});

describe('ebTransactionDescription', () => {
  it('prefers remittance information', () => {
    expect(
      ebTransactionDescription({
        transaction_amount: { currency: 'GBP', amount: '1' },
        remittance_information: ['TESCO STORES', '3297'],
        creditor: { name: 'Tesco PLC' },
      })
    ).toBe('TESCO STORES 3297');
  });

  it('falls back through creditor → debtor → note → default', () => {
    const base = { transaction_amount: { currency: 'GBP', amount: '1' } };
    expect(ebTransactionDescription({ ...base, creditor: { name: 'Shell' } })).toBe('Shell');
    expect(ebTransactionDescription({ ...base, debtor: { name: 'Uber BV' } })).toBe('Uber BV');
    expect(ebTransactionDescription({ ...base, note: 'transfer' })).toBe('transfer');
    expect(ebTransactionDescription(base)).toBe('Bank transaction');
  });

  it('skips empty remittance entries', () => {
    expect(
      ebTransactionDescription({
        transaction_amount: { currency: 'GBP', amount: '1' },
        remittance_information: ['', null as unknown as string],
        creditor: { name: 'Shell' },
      })
    ).toBe('Shell');
  });
});

describe('ebTransactionDate', () => {
  it('prefers booking_date, then transaction_date, then value_date', () => {
    const base = { transaction_amount: { currency: 'GBP', amount: '1' } };
    expect(
      ebTransactionDate({ ...base, booking_date: '2026-01-01', value_date: '2026-01-03' })
    ).toBe('2026-01-01');
    expect(
      ebTransactionDate({ ...base, transaction_date: '2026-01-02', value_date: '2026-01-03' })
    ).toBe('2026-01-02');
    expect(ebTransactionDate({ ...base, value_date: '2026-01-03' })).toBe('2026-01-03');
    expect(ebTransactionDate(base)).toBeNull();
  });
});

describe('ebMerchantName', () => {
  it('uses the counterparty: creditor for money out, debtor for money in', () => {
    const tx: EBTransaction = {
      transaction_amount: { currency: 'GBP', amount: '10' },
      creditor: { name: 'Shell' },
      debtor: { name: 'Nigel' },
    };
    expect(ebMerchantName({ ...tx, credit_debit_indicator: 'DBIT' })).toBe('Shell');
    expect(ebMerchantName({ ...tx, credit_debit_indicator: 'CRDT' })).toBe('Nigel');
  });
});

describe('isBooked', () => {
  it('accepts BOOK and missing status, rejects pending', () => {
    const base = { transaction_amount: { currency: 'GBP', amount: '1' } };
    expect(isBooked({ ...base, status: 'BOOK' })).toBe(true);
    expect(isBooked(base)).toBe(true);
    expect(isBooked({ ...base, status: 'PDNG' })).toBe(false);
  });
});

describe('ebToTransactionRow', () => {
  const opts = {
    id: 'test-id-1',
    userId: 'user-1',
    defaultType: 'business' as const,
    nowIso: '2026-06-12T00:00:00.000Z',
  };

  it('produces a complete snake_case row matching the cloud schema', () => {
    const row = ebToTransactionRow(
      {
        entry_reference: 'REF-001',
        transaction_amount: { currency: 'GBP', amount: '23.40' },
        credit_debit_indicator: 'DBIT',
        status: 'BOOK',
        booking_date: '2026-06-10',
        remittance_information: ['SHELL PETROL'],
        creditor: { name: 'Shell UK' },
      },
      opts
    );

    expect(row).toEqual({
      id: 'test-id-1',
      user_id: 'user-1',
      date: '2026-06-10',
      description: 'SHELL PETROL',
      amount: -23.4,
      currency: 'GBP',
      type: 'business',
      category: null,
      import_source: 'bank_sync',
      source_reference: 'REF-001',
      merchant_name: 'Shell UK',
      notes: null,
      is_duplicate: false,
      duplicate_of_id: null,
      dedup_hash: '2026-06-10|23.40|shell petrol',
      validation_status: 'unverified',
      matched_source_ids: null,
      created_at: opts.nowIso,
      updated_at: opts.nowIso,
    });
  });

  it('returns null when no date can be determined', () => {
    expect(
      ebToTransactionRow({ transaction_amount: { currency: 'GBP', amount: '1' } }, opts)
    ).toBeNull();
  });

  it('hash of the produced row matches what the app would compute on import', () => {
    const row = ebToTransactionRow(
      {
        transaction_amount: { currency: 'GBP', amount: '15.00' },
        credit_debit_indicator: 'DBIT',
        booking_date: '2026-06-11',
        remittance_information: ['COSTA COFFEE #88'],
      },
      opts
    )!;
    expect(row.dedup_hash).toBe(appHash(row.date, row.amount, row.description));
  });
});
