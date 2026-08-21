import {
  generateId,
  formatCurrency,
  formatMiles,
  calculateMileageDeduction,
  getUkTaxYearStart,
  formatTaxYear,
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
  it('defaults to GBP (this is a UK app)', () => {
    expect(formatCurrency(125.5)).toBe('£125.50');
  });

  it('formats negative amounts with minus sign', () => {
    expect(formatCurrency(-45.5)).toBe('-£45.50');
  });

  it('still formats USD when explicitly asked', () => {
    expect(formatCurrency(125.5, 'USD')).toBe('$125.50');
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

describe('calculateMileageDeduction (HMRC AMAP)', () => {
  it('applies the 55p first-tier rate from 2026/27', () => {
    expect(calculateMileageDeduction(100, 2026)).toBe(55);
  });

  it('applies the old 45p first-tier rate for earlier tax years', () => {
    expect(calculateMileageDeduction(100, 2025)).toBe(45);
  });

  it('pays the full first-tier rate right up to the 10,000-mile threshold', () => {
    expect(calculateMileageDeduction(10000, 2026)).toBe(5500);
  });

  it('drops to 25p for miles above the threshold', () => {
    // 10,000 x 55p = 5500, plus 2,000 x 25p = 500
    expect(calculateMileageDeduction(12000, 2026)).toBe(6000);
  });

  it('returns 0 for no miles', () => {
    expect(calculateMileageDeduction(0, 2026)).toBe(0);
  });
});

describe('getUkTaxYearStart', () => {
  it('treats 6 April as the first day of the new tax year', () => {
    expect(getUkTaxYearStart(new Date(2026, 3, 6))).toBe(2026);
  });

  it('treats 5 April as still the previous tax year', () => {
    expect(getUkTaxYearStart(new Date(2026, 3, 5))).toBe(2025);
  });

  it('handles dates late in the calendar year', () => {
    expect(getUkTaxYearStart(new Date(2026, 11, 31))).toBe(2026);
  });
});

describe('formatTaxYear', () => {
  it('renders the UK tax year span', () => {
    expect(formatTaxYear(2026)).toBe('2026/27');
  });

  it('pads the century rollover', () => {
    expect(formatTaxYear(2099)).toBe('2099/00');
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
