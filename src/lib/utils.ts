import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract a user-friendly error message from a Convex error.
 * Convex errors look like:
 *   "[CONVEX M(...)] ... Uncaught Error: Email already in use\n  at handler ..."
 * This extracts just "Email already in use".
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message;
  const match = msg.match(/Uncaught Error:\s*(.+?)(?:\n|$)/);
  if (match?.[1]) return match[1].trim();
  return fallback;
}
