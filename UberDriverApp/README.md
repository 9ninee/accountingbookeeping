# Uber Driver Tracker

A cross-platform mobile app (iOS + Android) for Uber drivers to track mileage and manage business vs personal transactions with automatic deduplication across multiple import sources.

Built with **React Native (Expo)** for a single codebase that runs on both platforms.

---

## Core Features

### 1. Mileage Tracking
- **GPS-based trip recording** with background location tracking
- Start/stop trip with a single tap
- Automatic distance calculation using the Haversine formula
- GPS jitter filtering for accurate readings
- Trip history with distance, duration, and average speed
- **IRS mileage deduction calculator** (standard rates by tax year)
- Route point recording for trip verification

### 2. Transaction Management
- **Business vs Personal separation** — every transaction is tagged
- Manual transaction entry with category selection
- Category-based organization (fuel, maintenance, insurance, tolls, uber fees, etc.)
- Transaction detail view with type toggle (reclassify business <-> personal)
- Monthly income/expense summaries on the dashboard

### 3. Multi-Source Transaction Import

#### CSV File Import
- Pick CSV files from device storage
- **Auto-detects column mapping** (supports Date, Description, Amount, Reference, Currency headers and bank-specific variations like Narrative, Value, Transaction Date)
- Handles quoted fields, escaped characters, various date formats, currency symbols, and parenthetical negatives

#### Apple Wallet / Google Pay
- Import via JSON export (from iOS Shortcuts automations or share sheet)
- Parses transaction ID, merchant name, amount, currency, and card info
- Supports array format, object-with-transactions-key format, and single transaction objects

#### Bank Statement Sync
- Integration with **Plaid** (US) or **TrueLayer** (UK/EU) via your backend server
- OAuth bank linking flow
- Automatic transaction fetching with date range filtering
- Filters out pending transactions

### 4. Automatic Deduplication Engine
Since transactions can arrive from multiple sources simultaneously, the app uses a multi-signal scoring algorithm:

| Signal | Confidence |
|---|---|
| Exact source reference match (bank txn ID) | 1.00 |
| Same date + same amount + similar description | 0.95 |
| Same date + exact amount | 0.85 |
| Within 1 day + same amount + similar description | 0.80 |
| Within 3 days + same amount + similar description | 0.60 |

- Transactions scoring >= 0.75 are flagged as duplicates and skipped
- String similarity uses the Sorensen-Dice coefficient on character bigrams
- Descriptions are normalized (lowercased, special chars stripped) before comparison
- Duplicates are preserved in the database with a link to the original for audit purposes

---

## Project Structure

```
UberDriverApp/
├── App.tsx                           # Entry point
├── app.json                          # Expo configuration
├── package.json                      # Dependencies
├── tsconfig.json                     # TypeScript config
├── __tests__/                        # Test suite
│   ├── deduplication.test.ts         # Dedup engine tests
│   ├── csvImporter.test.ts           # CSV parser tests
│   ├── walletImporter.test.ts        # Wallet import tests
│   ├── mileageTracker.test.ts        # Haversine distance tests
│   └── helpers.test.ts               # Utility function tests
└── src/
    ├── models/
    │   └── types.ts                  # TypeScript interfaces & types
    ├── services/
    │   ├── database.ts               # SQLite database layer (CRUD + summaries)
    │   ├── deduplication.ts          # Multi-signal duplicate detection
    │   ├── mileageTracker.ts         # GPS tracking + background location
    │   ├── csvImporter.ts            # CSV file import pipeline
    │   ├── walletImporter.ts         # Apple Wallet / Google Pay import
    │   └── bankSyncService.ts        # Plaid / TrueLayer bank sync
    ├── screens/
    │   ├── DashboardScreen.tsx       # Monthly summary overview
    │   ├── MileageScreen.tsx         # Trip tracking + history
    │   ├── TransactionsScreen.tsx    # Transaction list with filters
    │   ├── AddTransactionScreen.tsx  # Manual transaction entry
    │   ├── TransactionDetailScreen.tsx # View/edit/delete transaction
    │   ├── TripDetailScreen.tsx      # Trip details + stats
    │   └── ImportScreen.tsx          # Import hub (CSV/Wallet/Bank)
    ├── navigation/
    │   └── AppNavigator.tsx          # Tab + stack navigation
    └── utils/
        └── helpers.ts                # Formatting, IDs, date ranges, deduction calc
```

---

## Getting Started

### Prerequisites

```bash
npm install -g expo-cli
```

### Install & Run

```bash
cd UberDriverApp
npm install
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) or press `i` for iOS simulator / `a` for Android emulator.

### Run Tests

```bash
npm test
```

---

## Bank Sync Setup (Optional)

Bank sync requires a backend server with Plaid or TrueLayer API credentials. Update the API base URLs in `src/services/bankSyncService.ts`:

```typescript
const PLAID_API_BASE = 'https://your-backend.com/api/plaid';
const TRUELAYER_API_BASE = 'https://your-backend.com/api/truelayer';
```

Your backend needs to implement:
- `POST /create-link-token` — generates a bank authorization URL
- `POST /exchange-token` — exchanges the public token for access credentials
- `POST /transactions` — fetches transactions for a date range

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK 52) |
| Language | TypeScript |
| Database | SQLite (expo-sqlite) |
| Location | expo-location + expo-task-manager |
| File Import | expo-document-picker + expo-file-system |
| Navigation | React Navigation 6 |
| Bank Sync | Plaid / TrueLayer (via backend proxy) |
| Testing | Jest + jest-expo |

---

## Licence

MIT
