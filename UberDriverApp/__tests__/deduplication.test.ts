import {
  computeStringSimilarity,
  normalizeDescription,
  normalizeMerchant,
  findBestMatch,
  generateDedupHash,
  checkIntraBatchDuplicates,
} from '../src/services/deduplication';
import { Transaction } from '../src/models/types';

describe('normalizeDescription', () => {
  it('lowercases and strips special characters', () => {
    expect(normalizeDescription('SHELL GAS #1234')).toBe('shell gas 1234');
  });

  it('collapses whitespace', () => {
    expect(normalizeDescription('  hello   world  ')).toBe('hello world');
  });

  it('handles empty strings', () => {
    expect(normalizeDescription('')).toBe('');
  });
});

describe('normalizeMerchant', () => {
  it('strips LLC suffix', () => {
    expect(normalizeMerchant('Shell Oil LLC')).toBe('shell oil');
  });

  it('strips Inc suffix', () => {
    expect(normalizeMerchant('Amazon Inc')).toBe('amazon');
  });

  it('strips store numbers', () => {
    expect(normalizeMerchant('Shell #1234')).toBe('shell');
  });

  it('strips long number sequences (card numbers)', () => {
    expect(normalizeMerchant('Payment 4567890123456789')).toBe('payment');
  });

  it('handles mixed suffixes', () => {
    expect(normalizeMerchant('Uber Technologies Inc #5678'))
      .toBe('uber technologies');
  });
});

describe('computeStringSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(computeStringSimilarity('hello', 'hello')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    const score = computeStringSimilarity('abc', 'xyz');
    expect(score).toBe(0);
  });

  it('returns high similarity for similar strings', () => {
    const score = computeStringSimilarity('shell gas station', 'shell gas stn');
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns 1 for identical single-character strings', () => {
    expect(computeStringSimilarity('a', 'a')).toBe(1);
  });

  it('returns 0 for different single-character strings', () => {
    expect(computeStringSimilarity('a', 'b')).toBe(0);
  });
});

describe('generateDedupHash', () => {
  it('generates consistent hash for same inputs', () => {
    const hash1 = generateDedupHash('2024-03-15', -45.50, 'Shell Gas Station');
    const hash2 = generateDedupHash('2024-03-15', -45.50, 'Shell Gas Station');
    expect(hash1).toBe(hash2);
  });

  it('normalizes description in hash', () => {
    const hash1 = generateDedupHash('2024-03-15', -45.50, 'Shell Gas Station');
    const hash2 = generateDedupHash('2024-03-15', -45.50, 'shell gas station');
    expect(hash1).toBe(hash2);
  });

  it('uses absolute amount', () => {
    const hash1 = generateDedupHash('2024-03-15', -45.50, 'Shell');
    const hash2 = generateDedupHash('2024-03-15', 45.50, 'Shell');
    expect(hash1).toBe(hash2);
  });

  it('strips time from date', () => {
    const hash1 = generateDedupHash('2024-03-15', -45.50, 'Shell');
    const hash2 = generateDedupHash('2024-03-15T10:30:00Z', -45.50, 'Shell');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different amounts', () => {
    const hash1 = generateDedupHash('2024-03-15', -45.50, 'Shell');
    const hash2 = generateDedupHash('2024-03-15', -50.00, 'Shell');
    expect(hash1).not.toBe(hash2);
  });
});

describe('checkIntraBatchDuplicates', () => {
  it('detects identical transactions within a batch', () => {
    const incoming = [
      { date: '2024-03-15', amount: -45.50, description: 'Shell Gas' },
      { date: '2024-03-15', amount: -45.50, description: 'Shell Gas' },
      { date: '2024-03-15', amount: -10.00, description: 'Coffee' },
    ];

    const dups = checkIntraBatchDuplicates(incoming);
    expect(dups.size).toBe(1);
    expect(dups.get(1)).toBe(0); // index 1 is dup of index 0
  });

  it('detects duplicate source references', () => {
    const incoming = [
      { date: '2024-03-15', amount: -45.50, description: 'Shell', sourceReference: 'ref-001' },
      { date: '2024-03-16', amount: -45.50, description: 'Shell Gas', sourceReference: 'ref-001' },
    ];

    const dups = checkIntraBatchDuplicates(incoming);
    expect(dups.size).toBe(1);
  });

  it('returns empty map for unique transactions', () => {
    const incoming = [
      { date: '2024-03-15', amount: -45.50, description: 'Shell Gas' },
      { date: '2024-03-15', amount: -10.00, description: 'Coffee' },
    ];

    const dups = checkIntraBatchDuplicates(incoming);
    expect(dups.size).toBe(0);
  });
});

describe('findBestMatch', () => {
  const existingTransactions: Pick<Transaction, 'id' | 'date' | 'description' | 'amount' | 'sourceReference' | 'merchantName'>[] = [
    {
      id: 'txn-1',
      date: '2024-03-15',
      description: 'Shell Gas Station #5678',
      amount: -45.50,
      sourceReference: 'bank-ref-001',
      merchantName: 'Shell',
    },
    {
      id: 'txn-2',
      date: '2024-03-14',
      description: 'Uber Trip Payment',
      amount: 125.00,
      sourceReference: 'uber-pay-002',
      merchantName: 'Uber',
    },
    {
      id: 'txn-3',
      date: '2024-03-10',
      description: 'Amazon Purchase',
      amount: -29.99,
      sourceReference: null,
      merchantName: 'Amazon',
    },
  ];

  it('detects exact source reference match with 1.0 confidence', () => {
    const newTxn = {
      date: '2024-03-15',
      description: 'SHELL GAS',
      amount: -45.50,
      sourceReference: 'bank-ref-001',
    };

    const match = findBestMatch(newTxn, existingTransactions);
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe(1.0);
    expect(match!.existingTransaction.id).toBe('txn-1');
  });

  it('detects same date + same amount as potential duplicate', () => {
    const newTxn = {
      date: '2024-03-15',
      description: 'Shell gas purchase',
      amount: -45.50,
      sourceReference: null,
    };

    const match = findBestMatch(newTxn, existingTransactions);
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('returns null for non-matching transactions', () => {
    const newTxn = {
      date: '2024-03-20',
      description: 'Starbucks Coffee',
      amount: -5.75,
      sourceReference: null,
    };

    const match = findBestMatch(newTxn, existingTransactions);
    expect(match).toBeNull();
  });

  it('does not match different amounts even on same date', () => {
    const newTxn = {
      date: '2024-03-15',
      description: 'Shell Gas Station',
      amount: -100.00,
      sourceReference: null,
    };

    const match = findBestMatch(newTxn, existingTransactions);
    expect(match).toBeNull();
  });

  it('handles amount tolerance for small differences', () => {
    const newTxn = {
      date: '2024-03-15',
      description: 'Shell Gas Station',
      amount: -45.51, // $0.01 difference
      sourceReference: null,
    };

    const match = findBestMatch(newTxn, existingTransactions);
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeGreaterThanOrEqual(0.75);
  });
});
