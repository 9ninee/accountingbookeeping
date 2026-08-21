/**
 * Generate a unique ID (v4 UUID-like).
 * Uses crypto.getRandomValues when available, falls back to Math.random.
 */
export function generateId(): string {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) id += '-';
    const randomIndex = Math.floor(Math.random() * 16);
    id += hex[randomIndex];
  }
  return id;
}

/**
 * Format a number as currency.
 */
export function formatCurrency(amount: number, currency: string = 'GBP'): string {
  const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  const absAmount = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-${symbol}${absAmount}` : `${symbol}${absAmount}`;
}

/**
 * Format a distance in miles.
 */
export function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

/**
 * Format a date string for display.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date + time string for display.
 */
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get the start and end of the current month as ISO date strings.
 */
export function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  };
}

/** Format a Date as YYYY-MM-DD using LOCAL time (toISOString shifts the day for non-UTC timezones). */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get the start and end of the current week (Monday–Sunday).
 */
export function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toLocalDateString(monday),
    end: toLocalDateString(sunday),
  };
}

/**
 * HMRC Approved Mileage Allowance Payment (AMAP) rates for cars and vans.
 *
 * AMAP is tiered, not flat: the higher rate applies to the first 10,000
 * business miles of the UK tax year and the lower rate to every mile after
 * that. The threshold resets each 6 April.
 *
 * The 55p first-tier rate took effect 6 April 2026 (announced 21 May 2026 and
 * backdated to the start of the tax year) — the first change since 2011-12,
 * when it was 45p. The 25p upper-tier rate is unchanged.
 *
 * Motorcycles (24p) and bicycles (20p) are flat-rate and not modelled here;
 * this app tracks car and van driving.
 */
const AMAP_THRESHOLD_MILES = 10000;
const AMAP_UPPER_TIER_RATE = 0.25;

function amapFirstTierRate(taxYearStart: number): number {
  return taxYearStart >= 2026 ? 0.55 : 0.45;
}

/**
 * The starting calendar year of the UK tax year containing `date`.
 * The UK tax year runs 6 April - 5 April, so 2026 means "2026/27".
 */
export function getUkTaxYearStart(date: Date = new Date()): number {
  const year = date.getFullYear();
  const taxYearStart = new Date(year, 3, 6); // 6 April
  return date >= taxYearStart ? year : year - 1;
}

/** Format a UK tax year for display, e.g. 2026 -> "2026/27". */
export function formatTaxYear(taxYearStart: number = getUkTaxYearStart()): string {
  const endShort = String((taxYearStart + 1) % 100).padStart(2, '0');
  return `${taxYearStart}/${endShort}`;
}

/**
 * Calculate the HMRC mileage allowance claimable on business miles driven
 * within a single UK tax year.
 */
export function calculateMileageDeduction(
  miles: number,
  taxYearStart: number = getUkTaxYearStart()
): number {
  const firstTierMiles = Math.min(miles, AMAP_THRESHOLD_MILES);
  const upperTierMiles = Math.max(0, miles - AMAP_THRESHOLD_MILES);
  const total =
    firstTierMiles * amapFirstTierRate(taxYearStart) +
    upperTierMiles * AMAP_UPPER_TIER_RATE;
  return Math.round(total * 100) / 100;
}
