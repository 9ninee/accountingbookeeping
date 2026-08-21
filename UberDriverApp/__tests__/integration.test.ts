/**
 * Integration / Customer Scenario Tests
 *
 * These simulate real user workflows to verify the app works end-to-end
 * as a customer would experience it.
 */

import {
  generateDedupHash,
  checkIntraBatchDuplicates,
  findBestMatch,
  normalizeDescription,
  normalizeMerchant,
  computeStringSimilarity,
} from '../src/services/deduplication';
import { douglasPeucker, haversineDistance } from '../src/services/mileageTracker';
import { generateId, formatCurrency, formatMiles, calculateMileageDeduction, getCurrentMonthRange } from '../src/utils/helpers';
import { RoutePoint, Transaction, ImportSource } from '../src/models/types';

// ═══════════════════════════════════════════
// SCENARIO 1: Uber driver imports CSV from bank
// and then imports same period from Apple Wallet.
// System should detect duplicates.
// ═══════════════════════════════════════════

describe('Scenario: Import from bank CSV then Apple Wallet', () => {
  const bankTransactions: Pick<Transaction, 'id' | 'date' | 'description' | 'amount' | 'sourceReference' | 'merchantName'>[] = [
    { id: 'bank-1', date: '2024-03-15', description: 'SHELL OIL 04381234', amount: -45.50, sourceReference: 'REF001', merchantName: null },
    { id: 'bank-2', date: '2024-03-15', description: 'UBER TRIP PAYMENT', amount: 125.00, sourceReference: 'REF002', merchantName: 'Uber' },
    { id: 'bank-3', date: '2024-03-14', description: 'AMAZON.COM AMZN.COM', amount: -29.99, sourceReference: 'REF003', merchantName: null },
    { id: 'bank-4', date: '2024-03-13', description: 'STARBUCKS #5678', amount: -5.75, sourceReference: 'REF004', merchantName: null },
    { id: 'bank-5', date: '2024-03-12', description: 'EXXON MOBIL 99887766', amount: -52.30, sourceReference: 'REF005', merchantName: null },
  ];

  it('detects Apple Wallet transactions that match bank CSV entries', () => {
    // Wallet shows same transactions with different descriptions
    const walletShell = {
      date: '2024-03-15', description: 'Shell Gas Station', amount: -45.50,
      sourceReference: null, merchantName: 'Shell',
    };
    const match = findBestMatch(walletShell, bankTransactions);
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('detects Uber payment duplicate from wallet', () => {
    const walletUber = {
      date: '2024-03-15', description: 'Uber - Trip Payment', amount: 125.00,
      sourceReference: null, merchantName: 'Uber',
    };
    const match = findBestMatch(walletUber, bankTransactions);
    expect(match).not.toBeNull();
    expect(match!.existingTransaction.id).toBe('bank-2');
  });

  it('allows unique wallet transactions through', () => {
    const walletUnique = {
      date: '2024-03-15', description: 'McDonalds Lunch', amount: -12.50,
      sourceReference: null, merchantName: 'McDonalds',
    };
    const match = findBestMatch(walletUnique, bankTransactions);
    expect(match).toBeNull(); // no duplicate — should be imported
  });

  it('handles the same transaction from 3 sources via intra-batch dedup', () => {
    const batch = [
      { date: '2024-03-15', description: 'Shell Gas', amount: -45.50 },
      { date: '2024-03-15', description: 'Shell Gas', amount: -45.50 }, // duplicate in batch
      { date: '2024-03-15', description: 'SHELL OIL', amount: -45.50 }, // different desc, same hash may differ
    ];

    const dups = checkIntraBatchDuplicates(batch);
    expect(dups.has(1)).toBe(true); // exact duplicate detected
  });
});

// ═══════════════════════════════════════════
// SCENARIO 2: Driver completes a 2-hour trip,
// GPS records many points. System should compress
// for storage efficiency.
// ═══════════════════════════════════════════

describe('Scenario: Long trip GPS compression', () => {
  it('compresses a simulated 2-hour highway drive', () => {
    // Simulate 2 hours of driving on a highway (mostly straight)
    // GPS updates every 5 seconds = ~1440 points
    const points: RoutePoint[] = [];
    const startLat = 40.7128; // NYC
    const startLon = -74.0060;

    for (let i = 0; i < 1440; i++) {
      // Mostly straight southwest direction with minor noise
      const noise = (Math.random() - 0.5) * 0.00001;
      points.push({
        latitude: startLat - i * 0.0001 + noise,
        longitude: startLon - i * 0.00015 + noise,
        timestamp: new Date(Date.now() + i * 5000).toISOString(),
        speed: 60 + (Math.random() - 0.5) * 10, // ~60mph ± 5
      });
    }

    const compressed = douglasPeucker(points, 0.00005);

    // Should achieve significant compression (>70%)
    const compressionRatio = 1 - compressed.length / points.length;
    expect(compressionRatio).toBeGreaterThan(0.7);

    // Preserves first and last points
    expect(compressed[0].latitude).toBe(points[0].latitude);
    expect(compressed[compressed.length - 1].latitude).toBe(points[points.length - 1].latitude);
  });

  it('preserves turns and stops in a city driving route', () => {
    // Simulate city driving with turns
    const points: RoutePoint[] = [
      // Straight section (north)
      { latitude: 40.7128, longitude: -74.006, timestamp: 't1', speed: 30 },
      { latitude: 40.7138, longitude: -74.006, timestamp: 't2', speed: 30 },
      { latitude: 40.7148, longitude: -74.006, timestamp: 't3', speed: 30 },
      // Turn east
      { latitude: 40.7148, longitude: -74.004, timestamp: 't4', speed: 25 },
      { latitude: 40.7148, longitude: -74.002, timestamp: 't5', speed: 25 },
      // Turn south
      { latitude: 40.7138, longitude: -74.002, timestamp: 't6', speed: 30 },
      { latitude: 40.7128, longitude: -74.002, timestamp: 't7', speed: 30 },
    ];

    const compressed = douglasPeucker(points, 0.0001);

    // Should keep turn points (the route changes direction significantly)
    expect(compressed.length).toBeGreaterThanOrEqual(4);
    // Must keep start and end
    expect(compressed[0].latitude).toBe(40.7128);
    expect(compressed[compressed.length - 1].longitude).toBe(-74.002);
  });
});

// ═══════════════════════════════════════════
// SCENARIO 3: Driver checks monthly summary,
// verifies HMRC mileage allowance calculation
// ═══════════════════════════════════════════

describe('Scenario: Monthly tax summary', () => {
  it('calculates the HMRC mileage allowance for a month under the threshold', () => {
    const totalMiles = 1250.5;
    const allowance = calculateMileageDeduction(totalMiles, 2026);

    // 2026/27 first-tier rate: 55p/mile, well under the 10,000-mile threshold
    expect(allowance).toBeCloseTo(1250.5 * 0.55, 2);
    expect(allowance).toBeCloseTo(687.78, 1);
  });

  it('uses the right first-tier rate per tax year', () => {
    const miles = 1000;
    expect(calculateMileageDeduction(miles, 2025)).toBeCloseTo(450, 0);
    expect(calculateMileageDeduction(miles, 2026)).toBeCloseTo(550, 0);
  });

  it('tapers to 25p once a driver passes 10,000 business miles', () => {
    // A full-time driver: 10,000 x 55p + 5,000 x 25p
    expect(calculateMileageDeduction(15000, 2026)).toBeCloseTo(6750, 0);
  });

  it('formats currency correctly', () => {
    expect(formatCurrency(1250.50)).toBe('£1250.50');
    expect(formatCurrency(-45.50)).toBe('-£45.50');
    expect(formatCurrency(0)).toBe('£0.00');
    expect(formatCurrency(1000, 'USD')).toBe('$1000.00');
  });

  it('formats mileage correctly', () => {
    expect(formatMiles(125.5)).toBe('125.5 mi');
    expect(formatMiles(0)).toBe('0.0 mi');
  });

  it('gets correct month range', () => {
    const range = getCurrentMonthRange();
    const start = new Date(range.start);
    const end = new Date(range.end);

    expect(start.getDate()).toBe(1); // first of month
    expect(end.getDate()).toBeGreaterThanOrEqual(28); // last of month
    expect(start.getMonth()).toBe(end.getMonth()); // same month
  });
});

// ═══════════════════════════════════════════
// SCENARIO 4: Multiple bank statements with
// overlapping dates. System must prevent
// double-entry of existing records.
// ═══════════════════════════════════════════

describe('Scenario: Overlapping bank statement imports', () => {
  it('prevents double entry via hash matching', () => {
    // First import: March 1-15
    const firstBatch = [
      { date: '2024-03-10', amount: -45.50, description: 'Shell Gas Station' },
      { date: '2024-03-12', amount: -29.99, description: 'Amazon Purchase' },
      { date: '2024-03-15', amount: 125.00, description: 'Uber Payment' },
    ];

    // Second import: March 10-31 (overlapping Mar 10-15)
    const secondBatch = [
      { date: '2024-03-10', amount: -45.50, description: 'Shell Gas Station' }, // DUPLICATE
      { date: '2024-03-12', amount: -29.99, description: 'Amazon Purchase' },   // DUPLICATE
      { date: '2024-03-15', amount: 125.00, description: 'Uber Payment' },      // DUPLICATE
      { date: '2024-03-20', amount: -15.00, description: 'Parking Lot' },       // NEW
    ];

    // Dedup hashes from first batch
    const existingHashes = new Set(
      firstBatch.map((t) => generateDedupHash(t.date, t.amount, t.description))
    );

    // Check second batch against first
    let duplicates = 0;
    let newEntries = 0;
    for (const txn of secondBatch) {
      const hash = generateDedupHash(txn.date, txn.amount, txn.description);
      if (existingHashes.has(hash)) {
        duplicates++;
      } else {
        newEntries++;
      }
    }

    expect(duplicates).toBe(3); // 3 overlapping
    expect(newEntries).toBe(1); // only the parking lot is new
  });
});

// ═══════════════════════════════════════════
// SCENARIO 5: Merchant name variations across
// bank/wallet/CSV sources
// ═══════════════════════════════════════════

describe('Scenario: Merchant name normalization across sources', () => {
  it('matches Shell across different formats', () => {
    const variants = [
      'Shell Oil LLC',
      'SHELL #1234',
      'Shell Gas Station',
      'SHELL OIL 04381234',
    ];

    const normalized = variants.map(normalizeMerchant);
    // All should normalize to something containing 'shell'
    for (const n of normalized) {
      expect(n).toContain('shell');
    }
  });

  it('matches Amazon across sources via string similarity', () => {
    const sim = computeStringSimilarity(
      normalizeMerchant('Amazon.com Inc'),
      normalizeMerchant('Amazon Inc')
    );
    expect(sim).toBeGreaterThan(0.7); // high similarity despite ".com" suffix
  });

  it('keeps Uber distinct from UberEats', () => {
    const uber = normalizeMerchant('Uber Technologies Inc');
    const uberEats = normalizeMerchant('Uber Eats Inc');
    expect(uber).not.toBe(uberEats);
  });
});

// ═══════════════════════════════════════════
// SCENARIO 6: Trip distance calculation accuracy
// ═══════════════════════════════════════════

describe('Scenario: Trip distance verification', () => {
  it('calculates a known short trip distance', () => {
    // Times Square to Central Park South: ~1.2km
    const dist = haversineDistance(
      40.7580, -73.9855, // Times Square
      40.7678, -73.9718  // Central Park South
    );
    const km = dist / 1000;
    expect(km).toBeGreaterThan(1.0);
    expect(km).toBeLessThan(2.0);
  });

  it('calculates a highway trip distance', () => {
    // JFK Airport to LaGuardia Airport: ~16km
    const dist = haversineDistance(
      40.6413, -73.7781, // JFK
      40.7769, -73.8740  // LGA
    );
    const km = dist / 1000;
    expect(km).toBeGreaterThan(14);
    expect(km).toBeLessThan(18);
  });

  it('GPS jitter filter: ignores very short segments', () => {
    // Two points 1 meter apart (GPS noise)
    const dist = haversineDistance(40.7128, -74.006, 40.71281, -74.006);
    expect(dist).toBeLessThan(2); // should be filtered by the 2m threshold
  });
});

// ═══════════════════════════════════════════
// SCENARIO 7: Unique ID generation
// ═══════════════════════════════════════════

describe('Scenario: ID uniqueness at scale', () => {
  it('generates unique IDs across 1000 rapid calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000); // all unique
  });

  it('generates valid UUID-like format', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
