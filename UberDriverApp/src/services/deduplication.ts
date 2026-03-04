import { Transaction, DuplicateCandidate } from '../models/types';
import { getAllTransactionsForDedup } from './database';

/**
 * Deduplication engine for transactions arriving from multiple sources
 * (Apple Wallet, bank sync, CSV import, manual entry).
 *
 * Uses a multi-signal scoring approach:
 *   1. Exact source reference match  → 1.0 confidence (definite duplicate)
 *   2. Same date + same amount + similar description → 0.9 confidence
 *   3. Date within 1 day + same amount + similar description → 0.75 confidence
 *   4. Same amount + similar description within 3 days → 0.6 confidence
 *
 * Anything >= DUPLICATE_THRESHOLD is flagged as a duplicate.
 */

const DUPLICATE_THRESHOLD = 0.75;
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.6;

export async function checkForDuplicates(
  incoming: Partial<Transaction>[]
): Promise<DuplicateCandidate[]> {
  const existing = await getAllTransactionsForDedup();
  const duplicates: DuplicateCandidate[] = [];

  for (const newTxn of incoming) {
    const match = findBestMatch(newTxn, existing);
    if (match) {
      duplicates.push(match);
    }
  }

  return duplicates;
}

export function findBestMatch(
  newTxn: Partial<Transaction>,
  existingTransactions: Pick<Transaction, 'id' | 'date' | 'description' | 'amount' | 'sourceReference' | 'merchantName'>[]
): DuplicateCandidate | null {
  let bestMatch: DuplicateCandidate | null = null;

  for (const existing of existingTransactions) {
    const result = calculateDuplicateScore(newTxn, existing);
    if (result.confidence >= DUPLICATE_THRESHOLD) {
      if (!bestMatch || result.confidence > bestMatch.confidence) {
        bestMatch = {
          existingTransaction: existing as Transaction,
          newTransaction: newTxn,
          confidence: result.confidence,
          reason: result.reason,
        };
      }
    }
  }

  return bestMatch;
}

function calculateDuplicateScore(
  newTxn: Partial<Transaction>,
  existing: Pick<Transaction, 'id' | 'date' | 'description' | 'amount' | 'sourceReference' | 'merchantName'>
): { confidence: number; reason: string } {
  // Signal 1: Exact source reference match (e.g. bank transaction ID)
  if (
    newTxn.sourceReference &&
    existing.sourceReference &&
    newTxn.sourceReference === existing.sourceReference
  ) {
    return { confidence: 1.0, reason: 'Exact source reference match' };
  }

  // Signal 2+: Amount, date, and description similarity
  const amountMatch = newTxn.amount !== undefined && existing.amount !== undefined
    ? Math.abs(newTxn.amount - existing.amount) < 0.01
    : false;

  if (!amountMatch) {
    return { confidence: 0, reason: '' };
  }

  const daysDiff = dateDifferenceInDays(newTxn.date, existing.date);
  const descSimilarity = computeStringSimilarity(
    normalizeDescription(newTxn.description || ''),
    normalizeDescription(existing.description || '')
  );
  const merchantMatch =
    newTxn.merchantName && existing.merchantName
      ? normalizeDescription(newTxn.merchantName) === normalizeDescription(existing.merchantName)
      : false;

  // Same date + same amount + similar description
  if (daysDiff === 0 && (descSimilarity >= DESCRIPTION_SIMILARITY_THRESHOLD || merchantMatch)) {
    return {
      confidence: 0.95,
      reason: `Same date, same amount ($${existing.amount}), similar description`,
    };
  }

  if (daysDiff === 0 && amountMatch) {
    return {
      confidence: 0.85,
      reason: `Same date and exact amount ($${existing.amount})`,
    };
  }

  // Within 1 day + same amount + similar description
  if (daysDiff <= 1 && (descSimilarity >= DESCRIPTION_SIMILARITY_THRESHOLD || merchantMatch)) {
    return {
      confidence: 0.8,
      reason: `Within 1 day, same amount ($${existing.amount}), similar description`,
    };
  }

  // Within 3 days + same amount + similar description
  if (daysDiff <= 3 && (descSimilarity >= DESCRIPTION_SIMILARITY_THRESHOLD || merchantMatch)) {
    return {
      confidence: 0.6,
      reason: `Within 3 days, same amount ($${existing.amount}), similar description`,
    };
  }

  return { confidence: 0, reason: '' };
}

// ── String similarity (Sørensen–Dice coefficient on bigrams) ──

export function computeStringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  let intersection = 0;
  const bCopy = new Map(bigramsB);

  for (const [bigram, countA] of bigramsA) {
    const countB = bCopy.get(bigram) || 0;
    intersection += Math.min(countA, countB);
  }

  const totalBigrams = sumValues(bigramsA) + sumValues(bigramsB);
  return totalBigrams === 0 ? 0 : (2 * intersection) / totalBigrams;
}

function getBigrams(str: string): Map<string, number> {
  const bigrams = new Map<string, number>();
  for (let i = 0; i < str.length - 1; i++) {
    const bigram = str.substring(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }
  return bigrams;
}

function sumValues(map: Map<string, number>): number {
  let sum = 0;
  for (const v of map.values()) sum += v;
  return sum;
}

// ── Helpers ──

export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // strip special chars
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim();
}

function dateDifferenceInDays(dateA?: string, dateB?: string): number {
  if (!dateA || !dateB) return Infinity;
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Process a batch of incoming transactions: check for duplicates,
 * flag them, and return the cleaned list ready for insert.
 */
export async function deduplicateAndPrepare(
  incoming: Transaction[]
): Promise<{ clean: Transaction[]; duplicates: DuplicateCandidate[] }> {
  const candidates = await checkForDuplicates(incoming);
  const duplicateNewIds = new Set(
    candidates.map((c) => {
      // Match by sourceReference or by date+amount combo
      return incoming.find(
        (t) =>
          t.sourceReference === c.newTransaction.sourceReference ||
          (t.date === c.newTransaction.date && t.amount === c.newTransaction.amount)
      )?.id;
    }).filter(Boolean)
  );

  const clean: Transaction[] = [];
  for (const txn of incoming) {
    if (duplicateNewIds.has(txn.id)) {
      txn.isDuplicate = true;
      const match = candidates.find(
        (c) =>
          c.newTransaction.sourceReference === txn.sourceReference ||
          (c.newTransaction.date === txn.date && c.newTransaction.amount === txn.amount)
      );
      txn.duplicateOfId = match?.existingTransaction.id || null;
    }
    clean.push(txn);
  }

  return { clean, duplicates: candidates };
}
