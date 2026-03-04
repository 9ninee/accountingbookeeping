// ── Core Data Types ──

export type TransactionType = 'business' | 'personal';

export type ImportSource = 'manual' | 'csv_import' | 'apple_wallet' | 'bank_sync';

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
  routePoints: RoutePoint[]; // stored as JSON in DB
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
