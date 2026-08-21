import {
  Transaction, ImportSource, CrossReferenceResult,
  CrossReferenceMatch, CrossReferenceConflict, ValidationStatus,
} from '../models/types';
import { getTransactions, updateTransaction } from './database';
import { normalizeDescription, computeStringSimilarity, normalizeMerchant } from './deduplication';

const MATCH_AMOUNT_TOLERANCE = 0.02;
const MATCH_DATE_TOLERANCE_DAYS = 1;
const MATCH_DESCRIPTION_THRESHOLD = 0.5;
const CONFLICT_AMOUNT_TOLERANCE = 5.00; // Flag as conflict if amounts differ by > GBP 5

/**
 * Cross-reference transactions from multiple import sources within a date range.
 * Processes in 30-day windows to stay memory-efficient at scale.
 */
export async function crossReferenceTransactions(
  startDate: string,
  endDate: string
): Promise<CrossReferenceResult> {
  const result: CrossReferenceResult = {
    matched: [],
    unmatchedBySource: {
      manual: [],
      csv_import: [],
      apple_wallet: [],
      bank_sync: [],
    },
    conflicts: [],
    totalProcessed: 0,
  };

  // Process in 30-day windows for scalability
  const windows = getDateWindows(startDate, endDate, 30);

  for (const window of windows) {
    const transactions = await getTransactions({
      startDate: window.start,
      endDate: window.end,
      excludeDuplicates: true,
    });

    result.totalProcessed += transactions.length;

    // Group by source
    const bySource = groupBySource(transactions);
    const sources = Object.keys(bySource) as ImportSource[];

    // Skip if only one source in this window
    if (sources.length <= 1) {
      for (const src of sources) {
        result.unmatchedBySource[src].push(...bySource[src]);
      }
      continue;
    }

    // Cross-reference each pair of sources
    const matched = new Set<string>(); // track matched transaction IDs

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const sourceA = bySource[sources[i]];
        const sourceB = bySource[sources[j]];

        for (const txnA of sourceA) {
          if (matched.has(txnA.id)) continue;

          for (const txnB of sourceB) {
            if (matched.has(txnB.id)) continue;

            const matchResult = compareTransactions(txnA, txnB);

            if (matchResult.type === 'match') {
              result.matched.push({
                transactionIds: [txnA.id, txnB.id],
                sources: [txnA.importSource, txnB.importSource],
                confidence: matchResult.confidence,
                date: txnA.date,
                amount: txnA.amount,
                descriptions: [txnA.description, txnB.description],
              });
              matched.add(txnA.id);
              matched.add(txnB.id);
              break;
            } else if (matchResult.type === 'conflict') {
              result.conflicts.push({
                transactionIds: [txnA.id, txnB.id],
                sources: [txnA.importSource, txnB.importSource],
                reason: matchResult.reason,
                date: txnA.date,
                amounts: [txnA.amount, txnB.amount],
              });
              matched.add(txnA.id);
              matched.add(txnB.id);
              break;
            }
          }
        }
      }
    }

    // Collect unmatched
    for (const src of sources) {
      for (const txn of bySource[src]) {
        if (!matched.has(txn.id)) {
          result.unmatchedBySource[src].push(txn);
        }
      }
    }
  }

  return result;
}

/**
 * Apply validation results: update transaction validation status in the DB.
 */
export async function applyValidationResults(
  result: CrossReferenceResult
): Promise<{ verified: number; conflicts: number }> {
  let verified = 0;
  let conflicts = 0;

  // Mark matched transactions as verified
  for (const match of result.matched) {
    for (const id of match.transactionIds) {
      await updateTransaction(id, {
        validationStatus: 'verified' as ValidationStatus,
        matchedSourceIds: match.transactionIds.filter((tid) => tid !== id),
      });
      verified++;
    }
  }

  // Mark conflicts
  for (const conflict of result.conflicts) {
    for (const id of conflict.transactionIds) {
      await updateTransaction(id, {
        validationStatus: 'conflict' as ValidationStatus,
        matchedSourceIds: conflict.transactionIds.filter((tid) => tid !== id),
      });
      conflicts++;
    }
  }

  return { verified, conflicts };
}

// ── Comparison Logic ──

type CompareResult =
  | { type: 'match'; confidence: number }
  | { type: 'conflict'; reason: string }
  | { type: 'no_match' };

function compareTransactions(a: Transaction, b: Transaction): CompareResult {
  // Source reference match takes priority
  if (a.sourceReference && b.sourceReference && a.sourceReference === b.sourceReference) {
    if (Math.abs(a.amount - b.amount) <= MATCH_AMOUNT_TOLERANCE) {
      return { type: 'match', confidence: 1.0 };
    }
    return {
      type: 'conflict',
      reason: `Same reference but amounts differ: $${a.amount.toFixed(2)} vs $${b.amount.toFixed(2)}`,
    };
  }

  const daysDiff = Math.abs(
    Math.round((new Date(a.date).getTime() - new Date(b.date).getTime()) / (1000 * 60 * 60 * 24))
  );

  if (daysDiff > MATCH_DATE_TOLERANCE_DAYS) return { type: 'no_match' };

  const amountDiff = Math.abs(a.amount - b.amount);
  const descSimilarity = computeStringSimilarity(
    normalizeDescription(a.description),
    normalizeDescription(b.description)
  );
  const merchantMatch = a.merchantName && b.merchantName
    ? normalizeMerchant(a.merchantName) === normalizeMerchant(b.merchantName)
    : false;

  // Exact amount match + similar description or merchant
  if (amountDiff <= MATCH_AMOUNT_TOLERANCE && (descSimilarity >= MATCH_DESCRIPTION_THRESHOLD || merchantMatch)) {
    const confidence = daysDiff === 0 ? 0.95 : 0.85;
    return { type: 'match', confidence };
  }

  // Similar description/merchant but amount differs — possible conflict
  if ((descSimilarity >= MATCH_DESCRIPTION_THRESHOLD || merchantMatch) && amountDiff > MATCH_AMOUNT_TOLERANCE && amountDiff <= CONFLICT_AMOUNT_TOLERANCE) {
    return {
      type: 'conflict',
      reason: `Similar transaction but amounts differ by $${amountDiff.toFixed(2)}`,
    };
  }

  return { type: 'no_match' };
}

// ── Helpers ──

function groupBySource(transactions: Transaction[]): Record<ImportSource, Transaction[]> {
  const groups: Record<ImportSource, Transaction[]> = {
    manual: [],
    csv_import: [],
    apple_wallet: [],
    bank_sync: [],
  };
  for (const txn of transactions) {
    groups[txn.importSource].push(txn);
  }
  return groups;
}

function getDateWindows(
  startDate: string,
  endDate: string,
  windowDays: number
): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const windowEnd = new Date(current);
    windowEnd.setDate(windowEnd.getDate() + windowDays - 1);

    windows.push({
      start: current.toISOString().split('T')[0],
      end: (windowEnd > end ? end : windowEnd).toISOString().split('T')[0],
    });

    current = new Date(windowEnd);
    current.setDate(current.getDate() + 1);
  }

  return windows;
}
