import { parseCSV, detectColumnMapping, mapCSVToTransactions } from '../src/services/csvImporter';

describe('parseCSV', () => {
  it('parses simple CSV data', () => {
    const csv = 'Date,Description,Amount\n2024-01-15,Gas Station,-45.50\n2024-01-16,Uber Payment,125.00';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(3); // header + 2 data rows
    expect(rows[0]).toEqual(['Date', 'Description', 'Amount']);
    expect(rows[1]).toEqual(['2024-01-15', 'Gas Station', '-45.50']);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'Date,Description,Amount\n2024-01-15,"Shell Gas, Station #123",-45.50';
    const rows = parseCSV(csv);
    expect(rows[1][1]).toBe('Shell Gas, Station #123');
  });

  it('handles escaped quotes', () => {
    const csv = 'Date,Description,Amount\n2024-01-15,"He said ""hello""",-10.00';
    const rows = parseCSV(csv);
    expect(rows[1][1]).toBe('He said "hello"');
  });

  it('handles CRLF line endings', () => {
    const csv = 'Date,Description,Amount\r\n2024-01-15,Test,-10.00\r\n2024-01-16,Test2,-20.00';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(3);
  });

  it('skips empty rows', () => {
    const csv = 'Date,Description,Amount\n\n2024-01-15,Test,-10.00\n';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
  });
});

describe('detectColumnMapping', () => {
  it('detects standard column names', () => {
    const headers = ['Date', 'Description', 'Amount', 'Currency'];
    const mapping = detectColumnMapping(headers);
    expect(mapping).not.toBeNull();
    expect(mapping!.date).toBe('Date');
    expect(mapping!.description).toBe('Description');
    expect(mapping!.amount).toBe('Amount');
  });

  it('detects bank-specific column names', () => {
    const headers = ['Transaction Date', 'Narrative', 'Value', 'Reference'];
    const mapping = detectColumnMapping(headers);
    expect(mapping).not.toBeNull();
    expect(mapping!.date).toBe('Transaction Date');
    expect(mapping!.description).toBe('Narrative');
    expect(mapping!.amount).toBe('Value');
  });

  it('returns null when required columns are missing', () => {
    const headers = ['Foo', 'Bar', 'Baz'];
    const mapping = detectColumnMapping(headers);
    expect(mapping).toBeNull();
  });
});

describe('mapCSVToTransactions', () => {
  it('maps CSV rows to Transaction objects', () => {
    const headers = ['Date', 'Description', 'Amount'];
    const rows = [
      ['2024-01-15', 'Shell Gas', '-45.50'],
      ['2024-01-16', 'Uber Payment', '125.00'],
    ];
    const mapping = { date: 'Date', description: 'Description', amount: 'Amount' };

    const transactions = mapCSVToTransactions(rows, headers, mapping, 'business');
    expect(transactions).toHaveLength(2);
    expect(transactions[0].description).toBe('Shell Gas');
    expect(transactions[0].amount).toBe(-45.50);
    expect(transactions[0].importSource).toBe('csv_import');
    expect(transactions[0].type).toBe('business');
    expect(transactions[1].amount).toBe(125.00);
  });

  it('handles currency symbols in amounts', () => {
    const headers = ['Date', 'Description', 'Amount'];
    const rows = [['2024-01-15', 'Test', '$1,234.56']];
    const mapping = { date: 'Date', description: 'Description', amount: 'Amount' };

    const transactions = mapCSVToTransactions(rows, headers, mapping);
    expect(transactions[0].amount).toBe(1234.56);
  });

  it('handles parentheses as negative amounts', () => {
    const headers = ['Date', 'Description', 'Amount'];
    const rows = [['2024-01-15', 'Test', '(50.00)']];
    const mapping = { date: 'Date', description: 'Description', amount: 'Amount' };

    const transactions = mapCSVToTransactions(rows, headers, mapping);
    expect(transactions[0].amount).toBe(-50.00);
  });
});
