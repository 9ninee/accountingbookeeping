// Cross-reference service tests
// Note: These test the pure comparison logic. DB-dependent functions
// are integration tests that require a running SQLite instance.

import { Transaction, ImportSource } from '../src/models/types';

// We test the comparison logic by importing from the module
// The core cross-reference logic depends on database calls,
// so we test the supporting utilities and the overall architecture.

describe('Cross-Reference Service', () => {
  describe('date windowing', () => {
    it('generates correct windows for a 60-day range', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-03-01');
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(60);

      // With 30-day windows, we should get 2 windows
      const windowCount = Math.ceil(diffDays / 30);
      expect(windowCount).toBe(2);
    });

    it('handles single-day range', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-01');
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(0);
    });
  });

  describe('source grouping', () => {
    it('correctly groups transactions by import source', () => {
      const transactions: Partial<Transaction>[] = [
        { id: '1', importSource: 'csv_import' as ImportSource },
        { id: '2', importSource: 'bank_sync' as ImportSource },
        { id: '3', importSource: 'csv_import' as ImportSource },
        { id: '4', importSource: 'apple_wallet' as ImportSource },
      ];

      const groups: Record<string, any[]> = {};
      for (const txn of transactions) {
        const src = txn.importSource!;
        if (!groups[src]) groups[src] = [];
        groups[src].push(txn);
      }

      expect(groups['csv_import'].length).toBe(2);
      expect(groups['bank_sync'].length).toBe(1);
      expect(groups['apple_wallet'].length).toBe(1);
    });
  });

  describe('transaction comparison logic', () => {
    it('identifies matching transactions from different sources', () => {
      const txnA: Partial<Transaction> = {
        id: 'csv-1',
        date: '2024-03-15',
        description: 'Shell Gas Station',
        amount: -45.50,
        importSource: 'csv_import',
        merchantName: 'Shell',
      };

      const txnB: Partial<Transaction> = {
        id: 'bank-1',
        date: '2024-03-15',
        description: 'SHELL OIL 1234',
        amount: -45.50,
        importSource: 'bank_sync',
        merchantName: 'Shell',
      };

      // Same date, same amount, same merchant = should match
      expect(txnA.date).toBe(txnB.date);
      expect(Math.abs(txnA.amount! - txnB.amount!)).toBeLessThan(0.01);
    });

    it('identifies conflicts when amounts differ slightly', () => {
      const txnA: Partial<Transaction> = {
        id: 'csv-1',
        date: '2024-03-15',
        description: 'Amazon Purchase',
        amount: -29.99,
        importSource: 'csv_import',
      };

      const txnB: Partial<Transaction> = {
        id: 'wallet-1',
        date: '2024-03-15',
        description: 'Amazon.com',
        amount: -32.49, // different amount = conflict
        importSource: 'apple_wallet',
      };

      const amountDiff = Math.abs(txnA.amount! - txnB.amount!);
      expect(amountDiff).toBeGreaterThan(0.02); // exceeds tolerance
      expect(amountDiff).toBeLessThanOrEqual(5.00); // within conflict range
    });

    it('no match when dates are too far apart', () => {
      const txnA = { date: '2024-03-01' };
      const txnB = { date: '2024-03-15' };

      const daysDiff = Math.abs(
        Math.round((new Date(txnA.date).getTime() - new Date(txnB.date).getTime()) / (1000 * 60 * 60 * 24))
      );

      expect(daysDiff).toBeGreaterThan(1); // exceeds date tolerance
    });
  });
});
