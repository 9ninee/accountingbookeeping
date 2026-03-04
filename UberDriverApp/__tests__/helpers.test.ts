import {
  generateId,
  formatCurrency,
  formatMiles,
  calculateMileageDeduction,
  getCurrentMonthRange,
  getCurrentWeekRange,
} from '../src/utils/helpers';

describe('generateId', () => {
  it('generates a string with dashes in UUID-like positions', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('formatCurrency', () => {
  it('formats positive USD amounts', () => {
    expect(formatCurrency(125.5)).toBe('$125.50');
  });

  it('formats negative amounts with minus sign', () => {
    expect(formatCurrency(-45.5)).toBe('-$45.50');
  });

  it('formats GBP', () => {
    expect(formatCurrency(100, 'GBP')).toBe('£100.00');
  });

  it('formats EUR', () => {
    expect(formatCurrency(50, 'EUR')).toBe('€50.00');
  });
});

describe('formatMiles', () => {
  it('formats to one decimal place', () => {
    expect(formatMiles(12.345)).toBe('12.3 mi');
  });

  it('handles zero', () => {
    expect(formatMiles(0)).toBe('0.0 mi');
  });
});

describe('calculateMileageDeduction', () => {
  it('calculates 2024 IRS rate correctly', () => {
    const deduction = calculateMileageDeduction(100, 2024);
    expect(deduction).toBe(67); // $0.67 * 100
  });

  it('calculates 2023 IRS rate correctly', () => {
    const deduction = calculateMileageDeduction(100, 2023);
    expect(deduction).toBe(65.5); // $0.655 * 100
  });

  it('falls back to 0.67 for unknown year', () => {
    const deduction = calculateMileageDeduction(100, 2020);
    expect(deduction).toBe(67);
  });
});

describe('getCurrentMonthRange', () => {
  it('returns start and end of current month', () => {
    const range = getCurrentMonthRange();
    expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.start < range.end).toBe(true);
  });
});

describe('getCurrentWeekRange', () => {
  it('returns start and end of current week', () => {
    const range = getCurrentWeekRange();
    expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
