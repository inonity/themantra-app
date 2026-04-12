// Malaysia is fixed UTC+8 (no DST).
export const MY_OFFSET_MS = 8 * 60 * 60 * 1000;

export function myDateKey(ts: number): string {
  const d = new Date(ts + MY_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function myWeekKey(ts: number): string {
  // ISO-like week starting Monday, keyed by the Monday's date.
  const d = new Date(ts + MY_OFFSET_MS);
  const weekday = d.getUTCDay(); // 0 = Sun
  const diffToMonday = (weekday + 6) % 7;
  const monday = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - diffToMonday
  ));
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const day = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function myMonthKey(ts: number): string {
  const d = new Date(ts + MY_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function pickBucketKey(ts: number, granularity: "day" | "week" | "month"): string {
  if (granularity === "month") return myMonthKey(ts);
  if (granularity === "week") return myWeekKey(ts);
  return myDateKey(ts);
}

export function dayCount(from: number, to: number): number {
  return Math.max(1, Math.round((to - from + 1) / (24 * 3600 * 1000)));
}

export function granularityFor(from: number, to: number): "day" | "week" | "month" {
  const days = dayCount(from, to);
  if (days <= 45) return "day";
  if (days <= 180) return "week";
  return "month";
}

// Produce an ordered list of bucket keys from `from` to `to` (inclusive) at given granularity.
export function bucketKeys(from: number, to: number, granularity: "day" | "week" | "month"): string[] {
  const keys: string[] = [];
  let cursor = from;
  let lastKey = "";
  while (cursor <= to) {
    const k = pickBucketKey(cursor, granularity);
    if (k !== lastKey) {
      keys.push(k);
      lastKey = k;
    }
    cursor += 24 * 3600 * 1000;
  }
  return keys;
}

export function last7DayKeys(now: number = Date.now()): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    keys.push(myDateKey(now - i * 24 * 3600 * 1000));
  }
  return keys;
}
