import { generateId } from '../utils/helpers';
import { getDatabase } from './database';
import { GOCARDLESS_SECRET_ID, GOCARDLESS_SECRET_KEY } from '@env';

const BASE_URL = 'https://bankaccountdata.gocardless.com/api/v2';

export function isOpenBankingConfigured(): boolean {
  return Boolean(GOCARDLESS_SECRET_ID) && Boolean(GOCARDLESS_SECRET_KEY);
}

// ── Types ──

export interface GCAccessToken {
  access: string;
  access_expires: number;
  refresh: string;
  refresh_expires: number;
}

export interface Institution {
  id: string;
  name: string;
  bic: string;
  logo: string;
  countries: string[];
  transaction_total_days: string;
}

export interface Requisition {
  id: string;
  status: string;
  link: string;
  accounts: string[];
  reference: string;
  institution_id: string;
}

export interface BankAccount {
  id: string;
  iban: string;
  institution_id: string;
  status: string;
  owner_name: string;
}

export interface BankBalance {
  balanceAmount: { amount: string; currency: string };
  balanceType: string;
  referenceDate: string;
}

export interface BankTransaction {
  transactionId: string;
  bookingDate: string;
  valueDate: string;
  transactionAmount: { amount: string; currency: string };
  remittanceInformationUnstructured: string;
  creditorName?: string;
  debtorName?: string;
  merchantCategoryCode?: string;
}

export interface LinkedBank {
  id: string;
  requisitionId: string;
  institutionId: string;
  institutionName: string;
  accountIds: string[];
  linkedAt: string;
  expiresAt: string;
}

// ── Token Management ──

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const response = await fetch(`${BASE_URL}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret_id: GOCARDLESS_SECRET_ID,
      secret_key: GOCARDLESS_SECRET_KEY,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Auth failed: ${err}`);
  }

  const data: GCAccessToken = await response.json();
  cachedToken = {
    token: data.access,
    expiresAt: Date.now() + (data.access_expires - 60) * 1000,
  };

  return data.access;
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${path} failed (${response.status}): ${err}`);
  }

  return response.json();
}

// ── Institution (Bank) Selection ──

export async function getInstitutions(country: string = 'GB'): Promise<Institution[]> {
  return apiRequest<Institution[]>(`/institutions/?country=${country}`);
}

export async function searchInstitutions(
  query: string,
  country: string = 'GB'
): Promise<Institution[]> {
  const all = await getInstitutions(country);
  const q = query.toLowerCase();
  return all.filter(
    (inst) =>
      inst.name.toLowerCase().includes(q) ||
      inst.bic.toLowerCase().includes(q)
  );
}

// ── Requisition (Bank Linking) ──

export async function createRequisition(
  institutionId: string,
  redirectUrl: string = 'uberdrivertracker://bank-callback'
): Promise<Requisition> {
  const reference = `ref_${generateId().slice(0, 12)}`;

  const data = await apiRequest<Requisition>('/requisitions/', {
    method: 'POST',
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      reference,
      user_language: 'EN',
    }),
  });

  return data;
}

export async function getRequisition(requisitionId: string): Promise<Requisition> {
  return apiRequest<Requisition>(`/requisitions/${requisitionId}/`);
}

export async function deleteRequisition(requisitionId: string): Promise<void> {
  await apiRequest(`/requisitions/${requisitionId}/`, { method: 'DELETE' });
}

// ── Account Access ──

export async function getAccountDetails(accountId: string): Promise<BankAccount> {
  return apiRequest<BankAccount>(`/accounts/${accountId}/`);
}

export async function getAccountBalances(accountId: string): Promise<BankBalance[]> {
  const data = await apiRequest<{ balances: BankBalance[] }>(
    `/accounts/${accountId}/balances/`
  );
  return data.balances;
}

export async function getAccountTransactions(
  accountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ booked: BankTransaction[]; pending: BankTransaction[] }> {
  let path = `/accounts/${accountId}/transactions/`;
  const params: string[] = [];
  if (dateFrom) params.push(`date_from=${dateFrom}`);
  if (dateTo) params.push(`date_to=${dateTo}`);
  if (params.length > 0) path += `?${params.join('&')}`;

  const data = await apiRequest<{
    transactions: { booked: BankTransaction[]; pending: BankTransaction[] };
  }>(path);

  return data.transactions;
}

// ── Local Storage for Linked Banks ──

export async function saveLinkedBank(bank: LinkedBank): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO linked_banks (id, requisition_id, institution_id, institution_name, account_ids, linked_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    bank.id,
    bank.requisitionId,
    bank.institutionId,
    bank.institutionName,
    JSON.stringify(bank.accountIds),
    bank.linkedAt,
    bank.expiresAt
  );
}

export async function getLinkedBanks(): Promise<LinkedBank[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT * FROM linked_banks ORDER BY linked_at DESC');
  return (rows as any[]).map((row) => ({
    id: row.id,
    requisitionId: row.requisition_id,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    accountIds: JSON.parse(row.account_ids || '[]'),
    linkedAt: row.linked_at,
    expiresAt: row.expires_at,
  }));
}

export async function removeLinkedBank(id: string): Promise<void> {
  const db = await getDatabase();
  const banks = await getLinkedBanks();
  const bank = banks.find((b) => b.id === id);
  if (bank) {
    try {
      await deleteRequisition(bank.requisitionId);
    } catch {}
  }
  await db.runAsync('DELETE FROM linked_banks WHERE id = ?', id);
}

// ── Full Link Flow Helper ──

export async function completeBankLink(
  requisitionId: string,
  institutionName: string
): Promise<LinkedBank | null> {
  const req = await getRequisition(requisitionId);

  if (req.status !== 'LN') {
    return null;
  }

  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + 90);

  const bank: LinkedBank = {
    id: generateId(),
    requisitionId: req.id,
    institutionId: req.institution_id,
    institutionName,
    accountIds: req.accounts,
    linkedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  await saveLinkedBank(bank);
  return bank;
}
