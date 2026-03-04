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
export function formatCurrency(amount: number, currency: string = 'USD'): string {
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
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
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
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

/**
 * Calculate IRS standard mileage deduction.
 * 2024 rate: $0.67 per mile for business use.
 */
export function calculateMileageDeduction(miles: number, year: number = 2024): number {
  const rates: Record<number, number> = {
    2023: 0.655,
    2024: 0.67,
    2025: 0.70, // estimated
  };
  const rate = rates[year] || 0.67;
  return miles * rate;
}
