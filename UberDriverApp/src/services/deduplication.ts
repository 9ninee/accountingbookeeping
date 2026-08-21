import { Transaction, DuplicateCandidate, ImportReviewItem, ImportReviewResult } from '../models/types';
import { getTransactionsForDedupInRange, findTransactionsByDedupHash, getAllTransactionsForDedup } from './database';

/**
 * Deduplication engine for transactions arriving from multiple sources
 * (Apple Wallet, bank sync, CSV import, manual entry).
 *
 * Uses a multi-signal scoring approach:
 *   1. Exact source reference match  → 1.0 confidence (definite duplicate)
 *   2. Hash-based fast path (date+amount+normalized description) → 1.0
 *   3. Same date + same amount + similar description → 0.95 confidence
 *   4. Date within 1 day + same amount + similar description → 0.80 confidence
 *   5. Same amount + similar description within 3 days → 0.60 confidence
 *
 * Anything >= DUPLICATE_THRESHOLD is flagged as a duplicate.
 */

const DUPLICATE_THRESHOLD = 0.75;
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.6;
const AMOUNT_TOLERANCE = 0.02; // GBP 0.02 tolerance for currency conversion differences

/**
 * Generate a dedup hash for fast O(1) lookups.
 * Hash = lowercase(date + "|" + amount_rounded_2dp + "|" + normalized_description)
 */
export function generateDedupHash(date: string, amount: number, description: string): string {
  const normalDate = date.split('T')[0]; // strip time if present
  const normalAmount = Math.abs(amount).toFixed(2);
  const normalDesc = normalizeDescription(description);
  return `${normalDate}|${normalAmount}|${normalDesc}`;
}

/**
 * Check for duplicates using scalable date-windowed queries.
 * Falls back to full scan for small datasets.
 */
export async function checkForDuplicates(
  incoming: Partial<Transaction>[]
): Promise<DuplicateCandidate[]> {
  if (incoming.length === 0) return [];

  // Determine date range of incoming transactions
  const dates = incoming
    .map((t) => t.date)
    .filter((d): d is string => !!d)
    .sort();

  let existing: Pick<Transaction, 'id' | 'date' | 'description' | 'amount' | 'sourceReference' | 'merchantName'>[];

  if (dates.length > 0) {
    // Add 3-day buffer on each side for fuzzy date matching
    const minDate = shiftDate(dates[0], -3);
    const maxDate = shiftDate(dates[dates.length - 1], 3);
    existing = await getTransactionsForDedupInRange(minDate, maxDate);
  } else {
    // Fallback: load all (for cases where dates are missing)
    existing = await getAllTransactionsForDedup();
  }

  // Also check for hash-based fast matches
  const incomingHashes = incoming
    .filter((t) => t.date && t.amount !== undefined && t.description)
    .map((t) => generateDedupHash(t.date!, t.amount!, t.description!));
  const existingHashes = await findTransactionsByDedupHash(incomingHashes);

  const duplicates: DuplicateCandidate[] = [];

  for (const newTxn of incoming) {
    // Fast path: hash match
    if (newTxn.date && newTxn.amount !== undefined && newTxn.description) {
      const hash = generateDedupHash(newTxn.date, newTxn.amount, newTxn.description);
      if (existingHashes.has(hash)) {
        // Find the matching existing transaction for the result
        const match = findBestMatch(newTxn, existing);
        if (match) {
          duplicates.push(match);
          continue;
        }
      }
    }

    const match = findBestMatch(newTxn, existing);
    if (match) {
      duplicates.push(match);
    }
  }

  return duplicates;
}

/**
 * Check for duplicates within a batch (intra-batch dedup).
 * Prevents importing the same transaction twice in a single batch.
 */
export function checkIntraBatchDuplicates(
  incoming: Partial<Transaction>[]
): Map<number, number> {
  const duplicateMap = new Map<number, number>(); // index → duplicate_of_index
  const seen = new Map<string, number>(); // hash → first seen index

  for (let i = 0; i < incoming.length; i++) {
    const txn = incoming[i];
    if (!txn.date || txn.amount === undefined || !txn.description) continue;

    const hash = generateDedupHash(txn.date, txn.amount, txn.description);

    if (seen.has(hash)) {
      duplicateMap.set(i, seen.get(hash)!);
    } else {
      seen.set(hash, i);
    }

    // Also check source reference uniqueness
    if (txn.sourceReference) {
      const refKey = `ref:${txn.sourceReference}`;
      if (seen.has(refKey)) {
        duplicateMap.set(i, seen.get(refKey)!);
      } else {
        seen.set(refKey, i);
      }
    }
  }

  return duplicateMap;
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
    ? Math.abs(newTxn.amount - existing.amount) <= AMOUNT_TOLERANCE
    : false;

  if (!amountMatch) {
    return { confidence: 0, reason: '' };
  }

  const daysDiff = dateDifferenceInDays(newTxn.date, existing.date);
  const descSimilarity = computeStringSimilarity(
    normalizeDescription(newTxn.description || ''),
    normalizeDescription(existing.description || '')
  );
  const merchantMatch = matchMerchants(newTxn.merchantName, existing.merchantName);

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

/**
 * Match merchants with normalization — strips common suffixes like LLC, Inc, Ltd.
 */
function matchMerchants(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return normalizeMerchant(a) === normalizeMerchant(b);
}

export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|ltd|corp|co|plc|gmbh|pty)\b/gi, '')
    .replace(/[#*]\d+/g, '') // strip store/card numbers like #1234
    .replace(/\d{4,}/g, '') // strip long number sequences (card numbers)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Process a batch of incoming transactions: check for duplicates
 * (both intra-batch and against existing), flag them, and return
 * the cleaned list ready for insert.
 */
export async function deduplicateAndPrepare(
  incoming: Transaction[]
): Promise<{ clean: Transaction[]; duplicates: DuplicateCandidate[] }> {
  // Step 1: Intra-batch dedup
  const intraDups = checkIntraBatchDuplicates(incoming);

  // Step 2: Check against existing DB
  const candidates = await checkForDuplicates(incoming);
  const duplicateNewIds = new Set(
    candidates.map((c) => {
      return incoming.find(
        (t) =>
          t.sourceReference === c.newTransaction.sourceReference ||
          (t.date === c.newTransaction.date && Math.abs(t.amount - (c.newTransaction.amount ?? 0)) <= AMOUNT_TOLERANCE)
      )?.id;
    }).filter(Boolean)
  );

  const clean: Transaction[] = [];
  for (let i = 0; i < incoming.length; i++) {
    const txn = incoming[i];

    // Generate dedup hash
    txn.dedupHash = generateDedupHash(txn.date, txn.amount, txn.description);

    // Check intra-batch duplicate
    if (intraDups.has(i)) {
      txn.isDuplicate = true;
      const origIdx = intraDups.get(i)!;
      txn.duplicateOfId = incoming[origIdx]?.id || null;
    }

    // Check against existing
    if (duplicateNewIds.has(txn.id)) {
      txn.isDuplicate = true;
      const match = candidates.find(
        (c) =>
          c.newTransaction.sourceReference === txn.sourceReference ||
          (c.newTransaction.date === txn.date && Math.abs((c.newTransaction.amount ?? 0) - txn.amount) <= AMOUNT_TOLERANCE)
      );
      txn.duplicateOfId = match?.existingTransaction.id || null;
    }
    clean.push(txn);
  }

  return { clean, duplicates: candidates };
}

/**
 * Prepare an import review result for the UI.
 * Returns structured items with status and summary counts.
 */
export async function prepareImportReview(
  incoming: Transaction[]
): Promise<ImportReviewResult> {
  const { clean, duplicates } = await deduplicateAndPrepare(incoming);

  const dupMap = new Map<string, DuplicateCandidate>();
  for (const dup of duplicates) {
    const key = dup.newTransaction.sourceReference
      || `${dup.newTransaction.date}|${dup.newTransaction.amount}`;
    dupMap.set(key, dup);
  }

  const items: ImportReviewItem[] = clean.map((txn) => {
    if (txn.isDuplicate) {
      const key = txn.sourceReference || `${txn.date}|${txn.amount}`;
      return {
        transaction: txn,
        status: 'duplicate' as const,
        duplicateMatch: dupMap.get(key),
      };
    }
    return {
      transaction: txn,
      status: 'new' as const,
    };
  });

  return {
    items,
    summary: {
      newCount: items.filter((i) => i.status === 'new').length,
      duplicateCount: items.filter((i) => i.status === 'duplicate').length,
      conflictCount: items.filter((i) => i.status === 'conflict').length,
    },
  };
}
