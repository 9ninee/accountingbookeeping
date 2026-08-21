// ── Core Data Types ──

export type TransactionType = 'business' | 'personal';

export type ImportSource = 'manual' | 'csv_import' | 'apple_wallet' | 'bank_sync';

export type ValidationStatus = 'verified' | 'unverified' | 'conflict';

export type StorageTier = 'hot' | 'warm' | 'cold';

export type TransactionCategory =
  | 'fuel'
  | 'vehicle_maintenance'
  | 'insurance'
  | 'phone_bill'
  | 'food_drink'
  | 'tolls_parking'
  | 'car_wash'
  | 'uber_fees'
  | 'supplies'
  | 'other_business'
  | 'groceries'
  | 'entertainment'
  | 'rent_mortgage'
  | 'utilities'
  | 'healthcare'
  | 'clothing'
  | 'subscriptions'
  | 'other_personal';

export interface Transaction {
  id: string;
  date: string; // ISO 8601 date string
  description: string;
  amount: number; // negative = expense, positive = income
  currency: string;
  type: TransactionType;
  category: TransactionCategory | null;
  importSource: ImportSource;
  sourceReference: string | null; // external ID from bank/wallet for dedup
  merchantName: string | null;
  notes: string | null;
  isDuplicate: boolean;
  duplicateOfId: string | null; // links to the original if flagged as duplicate
  dedupHash: string | null; // hash for O(1) dedup lookups
  validationStatus: ValidationStatus;
  matchedSourceIds: string[] | null; // IDs of matching transactions from other sources
  createdAt: string;
  updatedAt: string;
}

export interface MileageTrip {
  id: string;
  startTime: string;
  endTime: string | null;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number | null;
  endLongitude: number | null;
  distanceMiles: number;
  isActive: boolean; // currently tracking
  purpose: 'uber_trip' | 'commute' | 'errand' | 'other';
  notes: string | null;
  routePoints: RoutePoint[]; // loaded lazily from route_points table
  storageTier: StorageTier;
  createdAt: string;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null; // mph
}

export interface MileageSummary {
  totalMiles: number;
  businessMiles: number;
  periodStart: string;
  periodEnd: string;
  tripCount: number;
}

export interface TransactionSummary {
  totalIncome: number;
  totalBusinessExpenses: number;
  totalPersonalExpenses: number;
  netBusinessIncome: number;
  transactionCount: number;
  periodStart: string;
  periodEnd: string;
  byCategory: Record<string, number>;
}

export interface DuplicateCandidate {
  existingTransaction: Transaction;
  newTransaction: Partial<Transaction>;
  confidence: number; // 0-1, how confident we are it's a duplicate
  reason: string;
}

export interface CSVColumnMapping {
  date: string;
  description: string;
  amount: string;
  currency?: string;
  reference?: string;
  merchantName?: string;
}

export interface BankSyncConfig {
  provider: 'plaid' | 'truelayer';
  accessToken: string | null;
  institutionId: string | null;
  institutionName: string | null;
  lastSyncAt: string | null;
  accountIds: string[];
}

// ── Cross-Reference Types ──

export interface CrossReferenceMatch {
  transactionIds: string[]; // IDs from different sources that match
  sources: ImportSource[];
  confidence: number;
  date: string;
  amount: number;
  descriptions: string[];
}

export interface CrossReferenceResult {
  matched: CrossReferenceMatch[];
  unmatchedBySource: Record<ImportSource, Transaction[]>;
  conflicts: CrossReferenceConflict[];
  totalProcessed: number;
}

export interface CrossReferenceConflict {
  transactionIds: string[];
  sources: ImportSource[];
  reason: string; // e.g., "Amount differs by GBP 2.50"
  date: string;
  amounts: number[];
}

// ── Import Review Types ──

export type ImportReviewStatus = 'new' | 'duplicate' | 'conflict';

export interface ImportReviewItem {
  transaction: Partial<Transaction>;
  status: ImportReviewStatus;
  duplicateMatch?: DuplicateCandidate;
  conflictDetails?: string;
  userAction?: 'accept' | 'reject';
}

export interface ImportReviewResult {
  items: ImportReviewItem[];
  summary: {
    newCount: number;
    duplicateCount: number;
    conflictCount: number;
  };
}

// ── Pagination Types ──

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}
