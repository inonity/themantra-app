// Malaysia is fixed UTC+8 (no DST).
export const MY_OFFSET_MS = 8 * 60 * 60 * 1000;

export type DateRange = { from: number; to: number };

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "allTime"
  | "custom";

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  last90: "Last 90 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  thisYear: "This year",
  allTime: "All time",
  custom: "Custom",
};

function myParts(ts: number) {
  const d = new Date(ts + MY_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
  };
}

// UTC ms at Malaysia midnight for the given local (year, month0, day)
function myMidnightUtcMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) - MY_OFFSET_MS;
}

// YYYY-MM-DD key in Malaysia time
export function myDateKey(ts: number): string {
  const { year, month, day } = myParts(ts);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Inclusive range bounds for a Malaysia-local date range (from "YYYY-MM-DD" to "YYYY-MM-DD")
function dayRange(fromKey: string, toKey: string): DateRange {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = myMidnightUtcMs(fy, fm - 1, fd);
  const toExclusive = myMidnightUtcMs(ty, tm - 1, td + 1);
  return { from, to: toExclusive - 1 };
}

export function rangeForPreset(preset: DateRangePreset, now: number = Date.now()): DateRange {
  const today = myParts(now);
  const todayKey = myDateKey(now);

  switch (preset) {
    case "today":
      return dayRange(todayKey, todayKey);
    case "yesterday": {
      const y = myDateKey(now - 24 * 3600 * 1000);
      return dayRange(y, y);
    }
    case "last7": {
      const startKey = myDateKey(now - 6 * 24 * 3600 * 1000);
      return dayRange(startKey, todayKey);
    }
    case "last30": {
      const startKey = myDateKey(now - 29 * 24 * 3600 * 1000);
      return dayRange(startKey, todayKey);
    }
    case "last90": {
      const startKey = myDateKey(now - 89 * 24 * 3600 * 1000);
      return dayRange(startKey, todayKey);
    }
    case "thisMonth": {
      const startKey = `${today.year}-${String(today.month + 1).padStart(2, "0")}-01`;
      return dayRange(startKey, todayKey);
    }
    case "lastMonth": {
      const prev = new Date(Date.UTC(today.year, today.month - 1, 1));
      const py = prev.getUTCFullYear();
      const pm = prev.getUTCMonth();
      const startKey = `${py}-${String(pm + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(Date.UTC(py, pm + 1, 0)).getUTCDate();
      const endKey = `${py}-${String(pm + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return dayRange(startKey, endKey);
    }
    case "thisYear": {
      const startKey = `${today.year}-01-01`;
      return dayRange(startKey, todayKey);
    }
    case "allTime":
      return { from: 0, to: now };
    case "custom":
      return dayRange(todayKey, todayKey);
  }
}

// For delta comparisons: return a range of equal length immediately preceding `range`.
export function previousRange(range: DateRange): DateRange {
  const len = range.to - range.from + 1;
  return { from: range.from - len, to: range.from - 1 };
}

// Shift a range by N whole days (positive = forward)
export function shiftRangeByDays(range: DateRange, days: number): DateRange {
  const d = days * 24 * 3600 * 1000;
  return { from: range.from + d, to: range.to + d };
}

// Build a local Date that represents "Malaysia midnight on date key".
// Suitable as a prop to <Calendar> which shows local days.
export function myDateKeyToLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Convert a Date from <Calendar> (local day) to a YYYY-MM-DD key interpreted in MY time.
// We take the local Y/M/D and treat it as a MY date — calendar picks don't carry timezones.
export function localDateToMyKey(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function customRange(fromKey: string, toKey: string): DateRange {
  return dayRange(fromKey, toKey);
}

export function dayCount(range: DateRange): number {
  return Math.max(1, Math.round((range.to - range.from + 1) / (24 * 3600 * 1000)));
}

// Pick granularity appropriate for the range
export type Granularity = "day" | "week" | "month";
export function granularityFor(range: DateRange): Granularity {
  const days = dayCount(range);
  if (days <= 45) return "day";
  if (days <= 180) return "week";
  return "month";
}

// Format a date key for chart axes
export function formatKeyForAxis(key: string, granularity: Granularity): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (granularity === "month") {
    return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatRangeLabel(range: DateRange): string {
  const from = new Date(range.from + MY_OFFSET_MS);
  const to = new Date(range.to + MY_OFFSET_MS);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (fmt(from) === fmt(to)) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}
