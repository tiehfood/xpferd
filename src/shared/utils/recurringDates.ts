/**
 * Pure utility functions for recurring invoice date computation.
 * No server or client dependencies — safe to import from both sides.
 *
 * Date convention: YYYY-MM-DD strings throughout.
 * All Date arithmetic uses UTC to avoid timezone shifts.
 *
 * dayOfWeek convention: 0 = Monday, 1 = Tuesday, ..., 6 = Sunday (ISO weekday).
 * NOTE: JavaScript's Date.getDay() returns 0 = Sunday — we normalize internally.
 */

export interface RecurringRule {
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  /** ISO weekday: 0=Monday..6=Sunday */
  dayOfWeek?: number;
  /** 1–31, for monthly/quarterly */
  dayOfMonth?: number;
  /** Use 'first' (1st) or 'last' (last day of month) instead of dayOfMonth */
  monthPosition?: 'first' | 'last';
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD — if set, occurrences after this date are excluded */
  endDate?: string;
}

// ─── Low-level date helpers ────────────────────────────────────────────────

/**
 * Parse a YYYY-MM-DD string as a UTC midnight Date.
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00Z');
}

/**
 * Format a UTC Date to YYYY-MM-DD.
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Convert a JavaScript Date.getDay() value (0=Sunday) to ISO weekday (0=Monday).
 */
function jsToIsoWeekday(jsDay: number): number {
  // JS: 0=Sun,1=Mon,...,6=Sat → ISO: 0=Mon,1=Tue,...,6=Sun
  return jsDay === 0 ? 6 : jsDay - 1;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Returns the last day of the given month.
 * @param year - full year (e.g. 2024)
 * @param month - 1-based month (1=January, 12=December)
 */
export function getLastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of the current month
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Clamps a desired day-of-month to the actual last day of that month.
 * e.g. day=31, month=2, year=2025 → 28
 * e.g. day=31, month=4, year=2026 → 30
 * e.g. day=29, month=2, year=2024 → 29 (leap year)
 */
export function clampDayOfMonth(day: number, month: number, year: number): number {
  return Math.min(day, getLastDayOfMonth(year, month));
}

/**
 * Adds N days to a YYYY-MM-DD date string and returns the result as YYYY-MM-DD.
 * Uses UTC arithmetic to avoid DST shifts.
 */
export function addDays(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

// ─── computeNextDate helpers ───────────────────────────────────────────────

/**
 * Find the next occurrence of isoWeekday (0=Mon..6=Sun) strictly after afterDate.
 */
function nextWeekdayAfter(afterDate: string, isoWeekday: number): string {
  const d = parseDate(afterDate);
  const currentIsoDay = jsToIsoWeekday(d.getUTCDay());
  // Days until the target weekday (at least 1)
  let delta = isoWeekday - currentIsoDay;
  if (delta <= 0) delta += 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return formatDate(d);
}

/**
 * Returns the date that is N full weeks after `baseDate` and falls on `isoWeekday`,
 * while being strictly after `afterDate`.
 */
function nextBiweeklyAfter(
  startDate: string,
  isoWeekday: number,
  afterDate: string,
): string {
  // Find the first occurrence of the weekday on or after startDate
  const start = parseDate(startDate);
  const startIsoDay = jsToIsoWeekday(start.getUTCDay());
  let delta = isoWeekday - startIsoDay;
  if (delta < 0) delta += 7;
  const firstOccurrence = new Date(start);
  firstOccurrence.setUTCDate(start.getUTCDate() + delta);

  // Advance in 2-week steps until we are strictly past afterDate
  const after = parseDate(afterDate);
  const current = new Date(firstOccurrence);
  while (current <= after) {
    current.setUTCDate(current.getUTCDate() + 14);
  }
  return formatDate(current);
}

/**
 * Advance `month` by `months` months, returning { year, month } (both 1-based).
 */
function addMonths(year: number, month: number, months: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + months;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/**
 * Compute the next monthly/quarterly occurrence after `afterDate`.
 * `stepMonths` is 1 for monthly, 3 for quarterly.
 * For quarterly, the eligible months are those aligned to startDate's month.
 */
function nextMonthlyOccurrenceAfter(
  rule: RecurringRule,
  afterDate: string,
  stepMonths: number,
): string {
  const after = parseDate(afterDate);
  const afterYear = after.getUTCFullYear();
  const afterMonth = after.getUTCMonth() + 1; // 1-based
  const afterDay = after.getUTCDate();

  const start = parseDate(rule.startDate);
  const startMonth = start.getUTCMonth() + 1; // 1-based for quarterly alignment

  // Helper: given a year+month, return the candidate date for the rule
  const candidateDateFor = (year: number, month: number): Date => {
    if (rule.monthPosition === 'first') {
      return new Date(Date.UTC(year, month - 1, 1));
    }
    if (rule.monthPosition === 'last') {
      return new Date(Date.UTC(year, month - 1, getLastDayOfMonth(year, month)));
    }
    // Use dayOfMonth (clamped)
    const day = clampDayOfMonth(rule.dayOfMonth ?? 1, month, year);
    return new Date(Date.UTC(year, month - 1, day));
  };

  // For quarterly, enumerate only months aligned to startDate's month (mod 3)
  // For monthly, every month is valid
  const isEligibleMonth = (year: number, month: number): boolean => {
    if (stepMonths === 1) return true;
    // Quarterly: months that are `startMonth + k*3` (mod 12)
    const diff = ((month - startMonth) % 12 + 12) % 12;
    return diff % stepMonths === 0;
  };

  // Start from the current month and find the first valid candidate strictly after afterDate
  let year = afterYear;
  let month = afterMonth;

  // Try at most 24 iterations (covers 2 years worth of months/quarters)
  for (let i = 0; i < 24; i++) {
    if (isEligibleMonth(year, month)) {
      const candidate = candidateDateFor(year, month);
      if (candidate > after) {
        return formatDate(candidate);
      }
    }
    // Advance by 1 month (we'll skip ineligible ones via isEligibleMonth)
    const next = addMonths(year, month, 1);
    year = next.year;
    month = next.month;
  }

  // Should not be reached with sane inputs
  return formatDate(candidateDateFor(year, month));
}

// ─── Main exported functions ───────────────────────────────────────────────

/**
 * Compute the next occurrence of the rule strictly after `afterDate`.
 * Returns null if `endDate` is set and the next occurrence would be after it.
 */
export function computeNextDate(rule: RecurringRule, afterDate: string): string | null {
  let next: string;

  switch (rule.frequency) {
    case 'weekly': {
      // If dayOfWeek not specified, use the same weekday as startDate
      const start = parseDate(rule.startDate);
      const isoWeekday = rule.dayOfWeek ?? jsToIsoWeekday(start.getUTCDay());
      next = nextWeekdayAfter(afterDate, isoWeekday);
      break;
    }

    case 'biweekly': {
      const start = parseDate(rule.startDate);
      const isoWeekday = rule.dayOfWeek ?? jsToIsoWeekday(start.getUTCDay());
      next = nextBiweeklyAfter(rule.startDate, isoWeekday, afterDate);
      break;
    }

    case 'monthly': {
      next = nextMonthlyOccurrenceAfter(rule, afterDate, 1);
      break;
    }

    case 'quarterly': {
      next = nextMonthlyOccurrenceAfter(rule, afterDate, 3);
      break;
    }
  }

  // Enforce endDate
  if (rule.endDate && next > rule.endDate) {
    return null;
  }

  return next;
}

/**
 * Returns all occurrence dates between `fromDate` and `toDate` (inclusive).
 * Capped at 100 results to prevent infinite loops.
 */
export function computeOccurrences(
  rule: RecurringRule,
  fromDate: string,
  toDate: string,
): string[] {
  const results: string[] = [];

  // Start iteration from one day before fromDate so the first call to
  // computeNextDate returns the first occurrence >= fromDate
  let cursor = addDays(fromDate, -1);

  for (let i = 0; i < 100; i++) {
    const next = computeNextDate(rule, cursor);
    if (next === null || next > toDate) break;
    if (next >= fromDate) {
      results.push(next);
    }
    cursor = next;
  }

  return results;
}

// ─── Display helpers ───────────────────────────────────────────────────────

const DAY_NAMES_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Returns the English ordinal suffix for a positive integer.
 * e.g. 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th", 21 → "21st"
 */
function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Returns a localized day name for an ISO weekday (0=Monday..6=Sunday).
 */
export function formatDayOfWeek(day: number, locale: 'de' | 'en'): string {
  const names = locale === 'de' ? DAY_NAMES_DE : DAY_NAMES_EN;
  return names[day] ?? (locale === 'de' ? 'Unbekannt' : 'Unknown');
}

/**
 * Returns a human-readable description of the recurring schedule.
 * e.g. "Jeden Montag", "Alle 2 Wochen am Freitag", "Monatlich am 15.",
 *      "Monatlich am Monatsende", "Vierteljährlich am 1."
 */
export function describeSchedule(rule: RecurringRule, locale: 'de' | 'en'): string {
  const start = parseDate(rule.startDate);
  const startIsoDay = jsToIsoWeekday(start.getUTCDay());
  const effectiveDayOfWeek = rule.dayOfWeek ?? startIsoDay;
  const dayName = formatDayOfWeek(effectiveDayOfWeek, locale);

  if (rule.frequency === 'weekly') {
    return locale === 'de'
      ? `Jeden ${dayName}`
      : `Every ${dayName}`;
  }

  if (rule.frequency === 'biweekly') {
    return locale === 'de'
      ? `Alle 2 Wochen am ${dayName}`
      : `Every 2 weeks on ${dayName}`;
  }

  if (rule.frequency === 'monthly') {
    if (rule.monthPosition === 'first') {
      return locale === 'de' ? 'Monatlich am 1.' : 'Monthly on the 1st';
    }
    if (rule.monthPosition === 'last') {
      return locale === 'de' ? 'Monatlich am Monatsende' : 'Monthly on the last day';
    }
    const day = rule.dayOfMonth ?? 1;
    return locale === 'de' ? `Monatlich am ${day}.` : `Monthly on the ${ordinalSuffix(day)}`;
  }

  if (rule.frequency === 'quarterly') {
    if (rule.monthPosition === 'first') {
      return locale === 'de' ? 'Vierteljährlich am 1.' : 'Quarterly on the 1st';
    }
    if (rule.monthPosition === 'last') {
      return locale === 'de' ? 'Vierteljährlich am Monatsende' : 'Quarterly on the last day';
    }
    const day = rule.dayOfMonth ?? 1;
    return locale === 'de' ? `Vierteljährlich am ${day}.` : `Quarterly on the ${ordinalSuffix(day)}`;
  }

  return '';
}
