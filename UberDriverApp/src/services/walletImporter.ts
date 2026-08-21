import { Transaction, ImportSource } from '../models/types';
import { generateId } from '../utils/helpers';
import { deduplicateAndPrepare } from './deduplication';
import { insertTransactionBatch } from './database';

/**
 * Apple Wallet / Google Wallet integration service.
 *
 * Apple Wallet (PassKit) does not expose transaction data directly via a public API.
 * This module provides:
 *   1. Processing of exported Apple Wallet transaction data (via Shortcuts / share sheet)
 *   2. Parsing of Apple Pay transaction notification payloads
 *   3. Manual entry from wallet receipt screenshots (future: OCR)
 *
 * For Google Wallet on Android, similar constraints apply — the integration
 * works through Google Pay transaction export or notification listeners.
 */

export interface WalletTransaction {
  transactionId: string;
  merchantName: string;
  amount: number;
  currency: string;
  date: string;
  cardLastFour?: string;
  category?: string;
}

/**
 * Parse Apple Pay / Google Pay exported transaction data.
 * The data format varies by export method; this handles the common JSON structure
 * from iOS Shortcuts automations.
 */
export function parseWalletExport(jsonData: string): WalletTransaction[] {
  try {
    const parsed = JSON.parse(jsonData);
    const transactions: WalletTransaction[] = [];

    // Handle array of transactions
    const items = Array.isArray(parsed) ? parsed : parsed.transactions || [parsed];

    for (const item of items) {
      const txn: WalletTransaction = {
        transactionId: item.transactionId || item.id || item.reference || '',
        merchantName: item.merchantName || item.merchant || item.name || 'Unknown',
        amount: parseFloat(item.amount || item.value || '0'),
        currency: item.currency || item.currencyCode || 'GBP',
        date: item.date || item.transactionDate || item.timestamp || new Date().toISOString(),
        cardLastFour: item.cardLastFour || item.card || undefined,
        category: item.category || undefined,
      };
      transactions.push(txn);
    }

    return transactions;
  } catch {
    return [];
  }
}

/**
 * Convert wallet transactions to our internal Transaction format.
 */
export function walletToTransactions(
  walletTxns: WalletTransaction[],
  defaultType: 'business' | 'personal' = 'business'
): Transaction[] {
  const now = new Date().toISOString();

  return walletTxns.map((wt) => ({
    id: generateId(),
    date: new Date(wt.date).toISOString().split('T')[0],
    description: `${wt.merchantName}${wt.cardLastFour ? ` (****${wt.cardLastFour})` : ''}`,
    amount: -Math.abs(wt.amount), // wallet transactions are typically expenses
    currency: wt.currency,
    type: defaultType,
    category: null,
    importSource: 'apple_wallet' as ImportSource,
    sourceReference: wt.transactionId || null,
    merchantName: wt.merchantName,
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
 * Full import pipeline for wallet data.
 */
export async function importFromWallet(
  jsonData: string,
  defaultType: 'business' | 'personal' = 'business'
): Promise<{
  success: boolean;
  inserted: number;
  duplicates: number;
  errors: string[];
  reviewResult?: import('../models/types').ImportReviewResult;
}> {
  const walletTxns = parseWalletExport(jsonData);
  if (walletTxns.length === 0) {
    return {
      success: false,
      inserted: 0,
      duplicates: 0,
      errors: ['No valid transactions found in wallet data'],
    };
  }

  const transactions = walletToTransactions(walletTxns, defaultType);
  const { clean, duplicates } = await deduplicateAndPrepare(transactions);
  const result = await insertTransactionBatch(clean);

  return {
    success: true,
    inserted: result.inserted,
    duplicates: duplicates.length,
    errors: [],
  };
}
