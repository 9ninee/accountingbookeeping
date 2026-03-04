import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Transaction, CSVColumnMapping, ImportSource } from '../models/types';
import { generateId } from '../utils/helpers';
import { deduplicateAndPrepare } from './deduplication';
import { insertTransactionBatch } from './database';

/**
 * Let the user pick a CSV file from their device.
 */
export async function pickCSVFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

/**
 * Read and parse a CSV file into raw row objects.
 */
export async function readCSVFile(uri: string): Promise<string[][]> {
  const content = await FileSystem.readAsStringAsync(uri);
  return parseCSV(content);
}

/**
 * Parse CSV string into 2D array of strings.
 * Handles quoted fields, newlines within quotes, and various delimiters.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim());
        if (currentRow.some((field) => field.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // skip \n in \r\n
      } else {
        currentField += char;
      }
    }
  }

  // Handle last field/row
  currentRow.push(currentField.trim());
  if (currentRow.some((field) => field.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Auto-detect column mapping by examining the header row.
 */
export function detectColumnMapping(headers: string[]): CSVColumnMapping | null {
  const normalized = headers.map((h) => h.toLowerCase().trim());

  const dateIdx = normalized.findIndex((h) =>
    ['date', 'transaction date', 'trans date', 'posted date', 'booking date'].includes(h)
  );
  const descIdx = normalized.findIndex((h) =>
    ['description', 'memo', 'narrative', 'details', 'transaction description', 'merchant', 'name'].includes(h)
  );
  const amountIdx = normalized.findIndex((h) =>
    ['amount', 'value', 'transaction amount', 'debit/credit', 'sum'].includes(h)
  );

  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) return null;

  const currencyIdx = normalized.findIndex((h) => ['currency', 'ccy'].includes(h));
  const refIdx = normalized.findIndex((h) =>
    ['reference', 'ref', 'transaction id', 'id', 'transaction reference'].includes(h)
  );

  return {
    date: headers[dateIdx],
    description: headers[descIdx],
    amount: headers[amountIdx],
    currency: currencyIdx >= 0 ? headers[currencyIdx] : undefined,
    reference: refIdx >= 0 ? headers[refIdx] : undefined,
  };
}

/**
 * Convert parsed CSV rows into Transaction objects using a column mapping.
 */
export function mapCSVToTransactions(
  rows: string[][],
  headers: string[],
  mapping: CSVColumnMapping,
  defaultType: 'business' | 'personal' = 'business'
): Transaction[] {
  const headerIndex = (name: string) => headers.indexOf(name);
  const now = new Date().toISOString();

  return rows.map((row) => {
    const dateStr = row[headerIndex(mapping.date)] || '';
    const description = row[headerIndex(mapping.description)] || '';
    const amountStr = row[headerIndex(mapping.amount)] || '0';
    const currency = mapping.currency ? row[headerIndex(mapping.currency)] || 'USD' : 'USD';
    const reference = mapping.reference ? row[headerIndex(mapping.reference)] || null : null;

    // Parse amount: handle various formats
    const amount = parseAmount(amountStr);

    return {
      id: generateId(),
      date: parseDate(dateStr),
      description,
      amount,
      currency,
      type: defaultType,
      category: null,
      importSource: 'csv_import' as ImportSource,
      sourceReference: reference,
      merchantName: null,
      notes: null,
      isDuplicate: false,
      duplicateOfId: null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

/**
 * Full import pipeline: pick file → parse → detect columns → map → deduplicate → insert.
 */
export async function importCSVFile(
  customMapping?: CSVColumnMapping,
  defaultType: 'business' | 'personal' = 'business'
): Promise<{
  success: boolean;
  inserted: number;
  duplicates: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // 1. Pick file
  const uri = await pickCSVFile();
  if (!uri) return { success: false, inserted: 0, duplicates: 0, errors: ['No file selected'] };

  // 2. Parse CSV
  const rawRows = await readCSVFile(uri);
  if (rawRows.length < 2) {
    return { success: false, inserted: 0, duplicates: 0, errors: ['CSV file is empty or has no data rows'] };
  }

  const headers = rawRows[0];
  const dataRows = rawRows.slice(1);

  // 3. Detect or use provided column mapping
  const mapping = customMapping || detectColumnMapping(headers);
  if (!mapping) {
    return {
      success: false,
      inserted: 0,
      duplicates: 0,
      errors: ['Could not auto-detect CSV columns. Please provide a column mapping.'],
    };
  }

  // 4. Map to transactions
  const transactions = mapCSVToTransactions(dataRows, headers, mapping, defaultType);

  // 5. Deduplicate
  const { clean, duplicates } = await deduplicateAndPrepare(transactions);

  // 6. Insert
  const result = await insertTransactionBatch(clean);

  return {
    success: true,
    inserted: result.inserted,
    duplicates: duplicates.length,
    errors,
  };
}

// ── Helpers ──

function parseAmount(str: string): number {
  // Remove currency symbols and thousands separators
  const cleaned = str.replace(/[£$€,\s]/g, '');
  // Handle parentheses as negative: (100.00) → -100.00
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -Math.abs(parseFloat(cleaned.slice(1, -1)));
  }
  return parseFloat(cleaned) || 0;
}

function parseDate(str: string): string {
  // Try common date formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})/, // ISO: 2024-01-15
    /^(\d{2})\/(\d{2})\/(\d{4})/, // US: 01/15/2024
    /^(\d{2})-(\d{2})-(\d{4})/, // UK: 15-01-2024
  ];

  for (const fmt of formats) {
    const match = str.match(fmt);
    if (match) {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    }
  }

  // Fallback: let JS try to parse it
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    return fallback.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0]; // last resort: today
}
