import { describe, it, expect } from 'vitest';
import {
  getLastDayOfMonth,
  clampDayOfMonth,
  addDays,
  computeNextDate,
  computeOccurrences,
  formatDayOfWeek,
  describeSchedule,
  type RecurringRule,
} from '../../src/shared/utils/recurringDates';

// ─── getLastDayOfMonth ────────────────────────────────────────────────────────

describe('getLastDayOfMonth', () => {
  it('January has 31 days', () => {
    expect(getLastDayOfMonth(2026, 1)).toBe(31);
  });

  it('February non-leap year has 28 days', () => {
    expect(getLastDayOfMonth(2025, 2)).toBe(28);
  });

  it('February leap year 2024 has 29 days', () => {
    expect(getLastDayOfMonth(2024, 2)).toBe(29);
  });

  it('February divisible by 400 (2000) has 29 days — true leap year', () => {
    expect(getLastDayOfMonth(2000, 2)).toBe(29);
  });

  it('February divisible by 100 but not 400 (1900) has 28 days — NOT a leap year', () => {
    expect(getLastDayOfMonth(1900, 2)).toBe(28);
  });

  it('March has 31 days', () => {
    expect(getLastDayOfMonth(2026, 3)).toBe(31);
  });

  it('April has 30 days', () => {
    expect(getLastDayOfMonth(2026, 4)).toBe(30);
  });

  it('May has 31 days', () => {
    expect(getLastDayOfMonth(2026, 5)).toBe(31);
  });

  it('June has 30 days', () => {
    expect(getLastDayOfMonth(2026, 6)).toBe(30);
  });

  it('July has 31 days', () => {
    expect(getLastDayOfMonth(2026, 7)).toBe(31);
  });

  it('August has 31 days', () => {
    expect(getLastDayOfMonth(2026, 8)).toBe(31);
  });

  it('September has 30 days', () => {
    expect(getLastDayOfMonth(2026, 9)).toBe(30);
  });

  it('October has 31 days', () => {
    expect(getLastDayOfMonth(2026, 10)).toBe(31);
  });

  it('November has 30 days', () => {
    expect(getLastDayOfMonth(2026, 11)).toBe(30);
  });

  it('December has 31 days', () => {
    expect(getLastDayOfMonth(2026, 12)).toBe(31);
  });
});

// ─── clampDayOfMonth ──────────────────────────────────────────────────────────

describe('clampDayOfMonth', () => {
  it('day within range is returned unchanged', () => {
    expect(clampDayOfMonth(15, 2, 2025)).toBe(15);
  });

  it('day=31 in Feb non-leap is clamped to 28', () => {
    expect(clampDayOfMonth(31, 2, 2025)).toBe(28);
  });

  it('day=31 in Feb leap year 2024 is clamped to 29', () => {
    expect(clampDayOfMonth(31, 2, 2024)).toBe(29);
  });

  it('day=31 in April is clamped to 30', () => {
    expect(clampDayOfMonth(31, 4, 2026)).toBe(30);
  });

  it('day=29 in Feb leap year 2024 returns 29', () => {
    expect(clampDayOfMonth(29, 2, 2024)).toBe(29);
  });

  it('day=29 in Feb non-leap 2025 is clamped to 28', () => {
    expect(clampDayOfMonth(29, 2, 2025)).toBe(28);
  });

  it('day=1 is never clamped', () => {
    expect(clampDayOfMonth(1, 2, 2025)).toBe(1);
  });

  it('day=30 in June returns 30', () => {
    expect(clampDayOfMonth(30, 6, 2026)).toBe(30);
  });

  it('day=31 in June is clamped to 30', () => {
    expect(clampDayOfMonth(31, 6, 2026)).toBe(30);
  });

  it('day=31 in December returns 31', () => {
    expect(clampDayOfMonth(31, 12, 2026)).toBe(31);
  });
});

// ─── addDays ──────────────────────────────────────────────────────────────────

describe('addDays', () => {
  it('adds 30 days within a month', () => {
    expect(addDays('2026-01-01', 30)).toBe('2026-01-31');
  });

  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('correctly lands on Feb 29 in a leap year', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('skips Feb 29 in a non-leap year', () => {
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('zero days returns the same date', () => {
    expect(addDays('2026-03-15', 0)).toBe('2026-03-15');
  });

  it('negative days steps backward across a month boundary', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('negative days steps backward across a year boundary', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('adds 7 days (one week)', () => {
    expect(addDays('2026-03-25', 7)).toBe('2026-04-01');
  });
});

// ─── computeNextDate — WEEKLY ─────────────────────────────────────────────────

describe('computeNextDate — weekly', () => {
  // 2026-01-05 is a Monday (ISO weekday 0)
  // 2026-01-07 is a Wednesday (ISO weekday 2)
  // 2026-01-11 is a Sunday (ISO weekday 6)

  it('Monday after a Monday is 7 days later', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0, // Monday
      startDate: '2026-01-05',
    };
    expect(computeNextDate(rule, '2026-01-05')).toBe('2026-01-12');
  });

  it('Monday after a Wednesday is 5 days later', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0, // Monday
      startDate: '2026-01-05',
    };
    expect(computeNextDate(rule, '2026-01-07')).toBe('2026-01-12');
  });

  it('Monday after a Sunday is 1 day later', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0, // Monday
      startDate: '2026-01-05',
    };
    expect(computeNextDate(rule, '2026-01-11')).toBe('2026-01-12');
  });

  it('Friday after a Saturday is 6 days later', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 4, // Friday
      startDate: '2026-01-05',
    };
    // 2026-01-10 is a Saturday
    expect(computeNextDate(rule, '2026-01-10')).toBe('2026-01-16');
  });

  it('returns null when next date exceeds endDate', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0, // Monday
      startDate: '2026-01-05',
      endDate: '2026-01-11',
    };
    expect(computeNextDate(rule, '2026-01-05')).toBeNull();
  });

  it('returns next date when it equals endDate exactly', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0, // Monday
      startDate: '2026-01-05',
      endDate: '2026-01-12',
    };
    expect(computeNextDate(rule, '2026-01-05')).toBe('2026-01-12');
  });

  it('uses startDate weekday when dayOfWeek is not specified', () => {
    // startDate 2026-01-07 is a Wednesday → should recur on Wednesdays
    const rule: RecurringRule = {
      frequency: 'weekly',
      startDate: '2026-01-07',
    };
    // After 2026-01-07 (Wed), next Wed is 2026-01-14
    expect(computeNextDate(rule, '2026-01-07')).toBe('2026-01-14');
  });
});

// ─── computeNextDate — BIWEEKLY ───────────────────────────────────────────────

describe('computeNextDate — biweekly', () => {
  // startDate 2026-01-05 is a Monday

  it('first biweekly occurrence after startDate is 2 weeks later', () => {
    const rule: RecurringRule = {
      frequency: 'biweekly',
      dayOfWeek: 0, // Monday
      startDate: '2026-01-05',
    };
    expect(computeNextDate(rule, '2026-01-05')).toBe('2026-01-19');
  });

  it('biweekly after a date in between aligns to cycle', () => {
    const rule: RecurringRule = {
      frequency: 'biweekly',
      dayOfWeek: 0,
      startDate: '2026-01-05',
    };
    // 2026-01-12 is between the cycle points (Jan 5 and Jan 19)
    expect(computeNextDate(rule, '2026-01-12')).toBe('2026-01-19');
  });

  it('biweekly after 2026-01-19 gives 2026-02-02', () => {
    const rule: RecurringRule = {
      frequency: 'biweekly',
      dayOfWeek: 0,
      startDate: '2026-01-05',
    };
    expect(computeNextDate(rule, '2026-01-19')).toBe('2026-02-02');
  });

  it('returns null when next biweekly date exceeds endDate', () => {
    const rule: RecurringRule = {
      frequency: 'biweekly',
      dayOfWeek: 0,
      startDate: '2026-01-05',
      endDate: '2026-01-18',
    };
    expect(computeNextDate(rule, '2026-01-05')).toBeNull();
  });

  it('uses startDate weekday when dayOfWeek not set', () => {
    // startDate 2026-01-07 = Wednesday
    const rule: RecurringRule = {
      frequency: 'biweekly',
      startDate: '2026-01-07',
    };
    // Cycle: Jan 7, Jan 21, Feb 4...
    expect(computeNextDate(rule, '2026-01-07')).toBe('2026-01-21');
  });
});

// ─── computeNextDate — MONTHLY ────────────────────────────────────────────────

describe('computeNextDate — monthly (dayOfMonth)', () => {
  it('same month when afterDate is before the day', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: '2026-01-01',
    };
    expect(computeNextDate(rule, '2026-01-10')).toBe('2026-01-15');
  });

  it('next month when afterDate equals the day (exclusive)', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: '2026-01-01',
    };
    expect(computeNextDate(rule, '2026-01-15')).toBe('2026-02-15');
  });

  it('next month when afterDate is past the day', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: '2026-01-01',
    };
    expect(computeNextDate(rule, '2026-01-20')).toBe('2026-02-15');
  });

  it('day 31 in Feb non-leap is clamped to Feb 28', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 31,
      startDate: '2026-01-01',
    };
    // after Jan 31, next should be Feb (clamped to 28 in 2026)
    expect(computeNextDate(rule, '2026-01-31')).toBe('2026-02-28');
  });

  it('day 31 in April is clamped to Apr 30', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 31,
      startDate: '2026-01-01',
    };
    // after Mar 31, next candidate April 31 → clamped to April 30
    expect(computeNextDate(rule, '2026-03-31')).toBe('2026-04-30');
  });

  it('day 29 in Feb of a leap year returns Feb 29', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 29,
      startDate: '2024-01-01',
    };
    expect(computeNextDate(rule, '2024-01-31')).toBe('2024-02-29');
  });

  it('day 29 in Feb of a non-leap year is clamped to Feb 28', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 29,
      startDate: '2025-01-01',
    };
    expect(computeNextDate(rule, '2025-01-31')).toBe('2025-02-28');
  });

  it('crosses year boundary correctly', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2025-01-01',
    };
    expect(computeNextDate(rule, '2025-12-01')).toBe('2026-01-01');
  });

  it('returns null when next date exceeds endDate', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: '2026-01-01',
      endDate: '2026-02-10',
    };
    expect(computeNextDate(rule, '2026-01-15')).toBeNull();
  });
});

describe('computeNextDate — monthly (monthPosition)', () => {
  it("monthPosition='first' selects the 1st of next month when afterDate is past the 1st", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'first',
      startDate: '2026-01-01',
    };
    expect(computeNextDate(rule, '2026-01-15')).toBe('2026-02-01');
  });

  it("monthPosition='first' crosses year boundary from Dec to Jan", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'first',
      startDate: '2025-01-01',
    };
    expect(computeNextDate(rule, '2025-12-31')).toBe('2026-01-01');
  });

  it("monthPosition='last' selects last day of current month when afterDate is before it", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'last',
      startDate: '2026-01-01',
    };
    expect(computeNextDate(rule, '2026-01-15')).toBe('2026-01-31');
  });

  it("monthPosition='last' moves to Feb 28 in non-leap year after Jan 31", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'last',
      startDate: '2026-01-01',
    };
    expect(computeNextDate(rule, '2026-01-31')).toBe('2026-02-28');
  });

  it("monthPosition='last' moves to Feb 29 in leap year after Jan 31", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'last',
      startDate: '2024-01-01',
    };
    expect(computeNextDate(rule, '2024-01-31')).toBe('2024-02-29');
  });

  it("monthPosition='last' returns null when next exceeds endDate", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'last',
      startDate: '2026-01-01',
      endDate: '2026-02-27',
    };
    // After Jan 31, next is Feb 28 which exceeds endDate Feb 27
    expect(computeNextDate(rule, '2026-01-31')).toBeNull();
  });
});

// ─── computeNextDate — QUARTERLY ──────────────────────────────────────────────

describe('computeNextDate — quarterly', () => {
  it('day=1 with startDate Jan advances to April 1', () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
    };
    expect(computeNextDate(rule, '2026-01-01')).toBe('2026-04-01');
  });

  it('day=1 with startDate Jan and afterDate in Feb still returns April 1', () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
    };
    expect(computeNextDate(rule, '2026-02-15')).toBe('2026-04-01');
  });

  it('quarters align to startDate month — startDate=Feb gives May cycle', () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      dayOfMonth: 15,
      startDate: '2026-02-01',
    };
    // Feb+3=May, Feb+6=Aug, Feb+9=Nov, Feb+12=Feb next year
    expect(computeNextDate(rule, '2026-02-15')).toBe('2026-05-15');
  });

  it('quarterly advances correctly across year boundary', () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
    };
    // After Oct 1, next is Jan 1 next year
    expect(computeNextDate(rule, '2026-10-01')).toBe('2027-01-01');
  });

  it("monthPosition='last' with startDate Jan uses last day of April", () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      monthPosition: 'last',
      startDate: '2026-01-01',
    };
    expect(computeNextDate(rule, '2026-01-31')).toBe('2026-04-30');
  });

  it('returns null when next quarterly date exceeds endDate', () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    };
    expect(computeNextDate(rule, '2026-01-01')).toBeNull();
  });
});

// ─── computeOccurrences ───────────────────────────────────────────────────────

describe('computeOccurrences', () => {
  it('weekly over 4 weeks produces 4 dates', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0, // Monday
      startDate: '2026-01-05',
    };
    const results = computeOccurrences(rule, '2026-01-05', '2026-01-26');
    expect(results).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  });

  it('monthly over 3 months produces 3 dates', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
    };
    const results = computeOccurrences(rule, '2026-01-01', '2026-03-01');
    expect(results).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('returns empty array when fromDate is after toDate', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0,
      startDate: '2026-01-05',
    };
    const results = computeOccurrences(rule, '2026-02-01', '2026-01-01');
    expect(results).toEqual([]);
  });

  it('returns empty array when no occurrences fall in range', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: '2026-01-01',
      endDate: '2026-01-10',
    };
    const results = computeOccurrences(rule, '2026-01-01', '2026-01-10');
    expect(results).toEqual([]);
  });

  it('is capped at 100 results', () => {
    // Daily approximated with weekly at 7 days — quarterly would need many years
    // Use weekly over a very long range (> 100 weeks)
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0,
      startDate: '2020-01-06',
    };
    const results = computeOccurrences(rule, '2020-01-06', '2030-12-31');
    expect(results.length).toBe(100);
  });

  it('includes fromDate boundary when it matches an occurrence', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
    };
    const results = computeOccurrences(rule, '2026-01-01', '2026-03-31');
    expect(results[0]).toBe('2026-01-01');
  });

  it('includes toDate boundary when it matches an occurrence', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 31,
      startDate: '2026-01-01',
    };
    const results = computeOccurrences(rule, '2026-01-01', '2026-03-31');
    expect(results[results.length - 1]).toBe('2026-03-31');
  });

  it('respects endDate on the rule — stops before endDate exclusion', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0,
      startDate: '2026-01-05',
      endDate: '2026-01-19',
    };
    const results = computeOccurrences(rule, '2026-01-05', '2026-02-28');
    expect(results).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('biweekly over one month produces correct dates', () => {
    const rule: RecurringRule = {
      frequency: 'biweekly',
      dayOfWeek: 0,
      startDate: '2026-01-05',
    };
    const results = computeOccurrences(rule, '2026-01-05', '2026-02-02');
    expect(results).toEqual(['2026-01-05', '2026-01-19', '2026-02-02']);
  });

  it('quarterly over one year produces 4 dates', () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
    };
    const results = computeOccurrences(rule, '2026-01-01', '2026-12-31');
    expect(results).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']);
  });
});

// ─── formatDayOfWeek ──────────────────────────────────────────────────────────

describe('formatDayOfWeek', () => {
  it('0 → Montag (de)', () => {
    expect(formatDayOfWeek(0, 'de')).toBe('Montag');
  });

  it('0 → Monday (en)', () => {
    expect(formatDayOfWeek(0, 'en')).toBe('Monday');
  });

  it('1 → Dienstag (de)', () => {
    expect(formatDayOfWeek(1, 'de')).toBe('Dienstag');
  });

  it('1 → Tuesday (en)', () => {
    expect(formatDayOfWeek(1, 'en')).toBe('Tuesday');
  });

  it('2 → Mittwoch (de)', () => {
    expect(formatDayOfWeek(2, 'de')).toBe('Mittwoch');
  });

  it('3 → Donnerstag (de)', () => {
    expect(formatDayOfWeek(3, 'de')).toBe('Donnerstag');
  });

  it('4 → Freitag (de)', () => {
    expect(formatDayOfWeek(4, 'de')).toBe('Freitag');
  });

  it('4 → Friday (en)', () => {
    expect(formatDayOfWeek(4, 'en')).toBe('Friday');
  });

  it('5 → Samstag (de)', () => {
    expect(formatDayOfWeek(5, 'de')).toBe('Samstag');
  });

  it('5 → Saturday (en)', () => {
    expect(formatDayOfWeek(5, 'en')).toBe('Saturday');
  });

  it('6 → Sonntag (de)', () => {
    expect(formatDayOfWeek(6, 'de')).toBe('Sonntag');
  });

  it('6 → Sunday (en)', () => {
    expect(formatDayOfWeek(6, 'en')).toBe('Sunday');
  });

  it('out-of-range index → Unbekannt (de)', () => {
    expect(formatDayOfWeek(99, 'de')).toBe('Unbekannt');
  });

  it('out-of-range index → Unknown (en)', () => {
    expect(formatDayOfWeek(99, 'en')).toBe('Unknown');
  });
});

// ─── describeSchedule ─────────────────────────────────────────────────────────

describe('describeSchedule', () => {
  it('weekly dayOfWeek=0 → Jeden Montag (de)', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0,
      startDate: '2026-01-05',
    };
    expect(describeSchedule(rule, 'de')).toBe('Jeden Montag');
  });

  it('weekly dayOfWeek=0 → Every Monday (en)', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 0,
      startDate: '2026-01-05',
    };
    expect(describeSchedule(rule, 'en')).toBe('Every Monday');
  });

  it('weekly dayOfWeek=4 → Jeden Freitag (de)', () => {
    const rule: RecurringRule = {
      frequency: 'weekly',
      dayOfWeek: 4,
      startDate: '2026-01-05',
    };
    expect(describeSchedule(rule, 'de')).toBe('Jeden Freitag');
  });

  it('weekly no dayOfWeek uses startDate weekday', () => {
    // 2026-01-07 is a Wednesday (ISO weekday 2)
    const rule: RecurringRule = {
      frequency: 'weekly',
      startDate: '2026-01-07',
    };
    expect(describeSchedule(rule, 'de')).toBe('Jeden Mittwoch');
  });

  it('biweekly dayOfWeek=4 → Alle 2 Wochen am Freitag (de)', () => {
    const rule: RecurringRule = {
      frequency: 'biweekly',
      dayOfWeek: 4,
      startDate: '2026-01-05',
    };
    expect(describeSchedule(rule, 'de')).toBe('Alle 2 Wochen am Freitag');
  });

  it('biweekly dayOfWeek=4 → Every 2 weeks on Friday (en)', () => {
    const rule: RecurringRule = {
      frequency: 'biweekly',
      dayOfWeek: 4,
      startDate: '2026-01-05',
    };
    expect(describeSchedule(rule, 'en')).toBe('Every 2 weeks on Friday');
  });

  it('monthly dayOfMonth=15 → Monatlich am 15. (de)', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'de')).toBe('Monatlich am 15.');
  });

  it('monthly dayOfMonth=15 → Monthly on the 15th (en)', () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'en')).toBe('Monthly on the 15th');
  });

  it("monthly monthPosition='first' → Monatlich am 1. (de)", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'first',
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'de')).toBe('Monatlich am 1.');
  });

  it("monthly monthPosition='first' → Monthly on the 1st (en)", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'first',
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'en')).toBe('Monthly on the 1st');
  });

  it("monthly monthPosition='last' → Monatlich am Monatsende (de)", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'last',
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'de')).toBe('Monatlich am Monatsende');
  });

  it("monthly monthPosition='last' → Monthly on the last day (en)", () => {
    const rule: RecurringRule = {
      frequency: 'monthly',
      monthPosition: 'last',
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'en')).toBe('Monthly on the last day');
  });

  it('quarterly dayOfMonth=1 → Vierteljährlich am 1. (de)', () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'de')).toBe('Vierteljährlich am 1.');
  });

  it('quarterly dayOfMonth=1 → Quarterly on the 1st (en)', () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'en')).toBe('Quarterly on the 1st');
  });

  it("quarterly monthPosition='first' → Vierteljährlich am 1. (de)", () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      monthPosition: 'first',
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'de')).toBe('Vierteljährlich am 1.');
  });

  it("quarterly monthPosition='last' → Vierteljährlich am Monatsende (de)", () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      monthPosition: 'last',
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'de')).toBe('Vierteljährlich am Monatsende');
  });

  it("quarterly monthPosition='last' → Quarterly on the last day (en)", () => {
    const rule: RecurringRule = {
      frequency: 'quarterly',
      monthPosition: 'last',
      startDate: '2026-01-01',
    };
    expect(describeSchedule(rule, 'en')).toBe('Quarterly on the last day');
  });
});
