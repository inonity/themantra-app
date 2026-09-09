/**
 * Secret generation and hashing for MCP access tokens.
 *
 * `crypto.randomUUID()` is the one source of randomness available in the
 * deterministic Convex runtime (it is already used for invite and password
 * reset tokens), so secrets are built from two UUIDs — 244 bits of entropy.
 * `crypto.subtle` is only used from actions and HTTP actions.
 */

/** Full secret handed to the user once, e.g. `mtk_a1b2...` (64 hex chars). */
export function generateSecret(prefix: string): string {
  const body = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  return `${prefix}_${body}`;
}

/** The part shown in the UI after creation so a token can be recognised. */
export function secretPrefix(secret: string): string {
  const body = secret.slice(secret.indexOf("_") + 1);
  return body.slice(0, 6);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Base64url without padding — used for PKCE and OAuth codes. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 of `verifier`, base64url encoded — the PKCE `S256` challenge. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/** Length-independent comparison, to keep token checks off the timing side channel. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
