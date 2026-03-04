import { parseWalletExport, walletToTransactions } from '../src/services/walletImporter';

describe('parseWalletExport', () => {
  it('parses array of wallet transactions', () => {
    const json = JSON.stringify([
      {
        transactionId: 'txn-001',
        merchantName: 'Shell Gas',
        amount: 45.50,
        currency: 'USD',
        date: '2024-03-15T10:30:00Z',
      },
      {
        transactionId: 'txn-002',
        merchantName: 'Starbucks',
        amount: 5.75,
        currency: 'USD',
        date: '2024-03-15T14:00:00Z',
      },
    ]);

    const result = parseWalletExport(json);
    expect(result).toHaveLength(2);
    expect(result[0].merchantName).toBe('Shell Gas');
    expect(result[0].amount).toBe(45.50);
    expect(result[1].merchantName).toBe('Starbucks');
  });

  it('parses object with transactions key', () => {
    const json = JSON.stringify({
      transactions: [
        { id: 'txn-001', merchant: 'Shell', value: '30.00', currencyCode: 'USD', timestamp: '2024-03-15' },
      ],
    });

    const result = parseWalletExport(json);
    expect(result).toHaveLength(1);
    expect(result[0].merchantName).toBe('Shell');
    expect(result[0].amount).toBe(30);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseWalletExport('not json')).toEqual([]);
  });

  it('handles single transaction object', () => {
    const json = JSON.stringify({
      transactionId: 'single-001',
      merchantName: 'Test',
      amount: 10,
      date: '2024-01-01',
    });

    const result = parseWalletExport(json);
    expect(result).toHaveLength(1);
  });
});

describe('walletToTransactions', () => {
  it('converts wallet transactions to internal format', () => {
    const walletTxns = [
      {
        transactionId: 'w-001',
        merchantName: 'Shell Gas',
        amount: 45.50,
        currency: 'USD',
        date: '2024-03-15T10:30:00Z',
        cardLastFour: '1234',
      },
    ];

    const transactions = walletToTransactions(walletTxns, 'business');
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(-45.50); // expenses are negative
    expect(transactions[0].description).toBe('Shell Gas (****1234)');
    expect(transactions[0].importSource).toBe('apple_wallet');
    expect(transactions[0].sourceReference).toBe('w-001');
    expect(transactions[0].type).toBe('business');
  });
});
