/**
 * Validate a `?next=` redirect target.
 *
 * Only same-site absolute paths are accepted. Anything else — a full URL, a
 * protocol-relative `//evil.com`, a backslash variant some browsers normalise
 * to one — is rejected, so the parameter cannot be used as an open redirect.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
