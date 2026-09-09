/**
 * Output formatting for MCP tool results.
 *
 * Everything an MCP tool returns is billed as input tokens on the model's next
 * turn, so results are compact aligned text rather than JSON: no braces, no
 * repeated key names, no ids unless they are actionable.
 */

import { MY_OFFSET_MS } from "../helpers/dates";

export function money(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const fixed = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2);
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function rm(amount: number): string {
  return `RM${money(amount)}`;
}

export function num(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)}%`;
}

/** Malaysia-local date, matching how the dashboard buckets days. */
export function dateMY(ts: number): string {
  return new Date(ts + MY_OFFSET_MS).toISOString().slice(0, 10);
}

export function dateTimeMY(ts: number): string {
  return new Date(ts + MY_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export type Align = "l" | "r";

/**
 * Render an aligned plain-text table. Columns are padded to their widest cell,
 * which costs a few spaces but saves the model from re-reading key names on
 * every row.
 */
export function table(
  headers: string[],
  rows: string[][],
  align: Align[] = []
): string {
  if (rows.length === 0) return "(none)";

  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => (row[i] ?? "").length))
  );

  const renderRow = (cells: string[]) =>
    cells
      .map((cell, i) => {
        const value = cell ?? "";
        // Never pad the last column — trailing spaces are wasted tokens.
        if (i === cells.length - 1 && align[i] !== "r") return value;
        return align[i] === "r"
          ? value.padStart(widths[i])
          : value.padEnd(widths[i]);
      })
      .join("  ")
      .trimEnd();

  return [renderRow(headers), ...rows.map(renderRow)].join("\n");
}

/** Join sections, dropping empty ones, with a single blank line between. */
export function sections(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join("\n\n");
}

export function heading(text: string): string {
  return `## ${text}`;
}
