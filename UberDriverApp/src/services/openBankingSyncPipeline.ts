import {
  getAccountTransactions,
  getAccountBalances,
  getLinkedBanks,
  BankTransaction,
  BankBalance,
  LinkedBank,
} from './openBankingService';
import { Transaction, ImportSource } from '../models/types';
import { generateId } from '../utils/helpers';
import { deduplicateAndPrepare } from './deduplication';
import { insertTransactionBatch, getDatabase } from './database';

export interface SyncSummary {
  bankName: string;
  accountsProcessed: number;
  fetched: number;
  inserted: number;
  duplicates: number;
  errors: string[];
}

export interface FullSyncResult {
  banks: SyncSummary[];
  totalInserted: number;
  totalDuplicates: number;
  balances: AccountBalance[];
}

export interface AccountBalance {
  accountId: string;
  bankName: string;
  amount: number;
  currency: string;
  type: string;
  date: string;
}

function bankTxnToTransaction(
  bt: BankTransaction,
  defaultType: 'business' | 'personal'
): Transaction {
  const now = new Date().toISOString();
  const amount = parseFloat(bt.transactionAmount.amount);

  return {
    id: generateId(),
    date: bt.bookingDate || bt.valueDate,
    description:
      bt.remittanceInformationUnstructured ||
      bt.creditorName ||
      bt.debtorName ||
      'Unknown',
    amount,
    currency: bt.transactionAmount.currency,
    type: defaultType,
    category: null,
    importSource: 'bank_sync' as ImportSource,
    sourceReference: bt.transactionId,
    merchantName: bt.creditorName || bt.debtorName || null,
    notes: null,
    isDuplicate: false,
    duplicateOfId: null,
    dedupHash: null,
    validationStatus: 'unverified' as const,
    matchedSourceIds: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function syncSingleBank(
  bank: LinkedBank,
  dateFrom?: string,
  dateTo?: string,
  defaultType: 'business' | 'personal' = 'business'
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    bankName: bank.institutionName,
    accountsProcessed: 0,
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    errors: [],
  };

  for (const accountId of bank.accountIds) {
    try {
      const { booked } = await getAccountTransactions(accountId, dateFrom, dateTo);
      summary.fetched += booked.length;
      summary.accountsProcessed++;

      if (booked.length === 0) continue;

      const transactions = booked.map((bt) => bankTxnToTransaction(bt, defaultType));
      const { clean, duplicates } = await deduplicateAndPrepare(transactions);
      const result = await insertTransactionBatch(clean);

      summary.inserted += result.inserted;
      summary.duplicates += duplicates.length;
    } catch (e: any) {
      summary.errors.push(`Account ${accountId.slice(0, 8)}...: ${e.message}`);
    }
  }

  return summary;
}

export async function syncAllBanks(
  dateFrom?: string,
  dateTo?: string,
  defaultType: 'business' | 'personal' = 'business'
): Promise<FullSyncResult> {
  const banks = await getLinkedBanks();
  const result: FullSyncResult = {
    banks: [],
    totalInserted: 0,
    totalDuplicates: 0,
    balances: [],
  };

  for (const bank of banks) {
    // Check if consent expired
    if (new Date(bank.expiresAt) < new Date()) {
      result.banks.push({
        bankName: bank.institutionName,
        accountsProcessed: 0,
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        errors: ['Consent expired — please re-link this bank'],
      });
      continue;
    }

    const summary = await syncSingleBank(bank, dateFrom, dateTo, defaultType);
    result.banks.push(summary);
    result.totalInserted += summary.inserted;
    result.totalDuplicates += summary.duplicates;

    // Fetch balances
    for (const accountId of bank.accountIds) {
      try {
        const balances = await getAccountBalances(accountId);
        for (const bal of balances) {
          result.balances.push({
            accountId,
            bankName: bank.institutionName,
            amount: parseFloat(bal.balanceAmount.amount),
            currency: bal.balanceAmount.currency,
            type: bal.balanceType,
            date: bal.referenceDate,
          });
        }
      } catch {}
    }
  }

  return result;
}

export async function getConsentStatus(): Promise<
  Array<{
    bankName: string;
    expiresAt: string;
    daysRemaining: number;
    isExpired: boolean;
    accountCount: number;
  }>
> {
  const banks = await getLinkedBanks();
  const now = new Date();

  return banks.map((bank) => {
    const expires = new Date(bank.expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return {
      bankName: bank.institutionName,
      expiresAt: bank.expiresAt,
      daysRemaining: Math.max(0, daysRemaining),
      isExpired: daysRemaining <= 0,
      accountCount: bank.accountIds.length,
    };
  });
}
