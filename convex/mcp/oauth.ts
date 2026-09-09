/**
 * OAuth 2.1 for claude.ai custom connectors.
 *
 * Claude Code, Codex and Claude Desktop send a static bearer token and never
 * touch any of this. claude.ai cannot hold a static token, so it discovers
 * these endpoints, registers itself, sends the user through /mcp/authorize in
 * the app, and exchanges the resulting code for a token. The token it gets is
 * an ordinary row in `mcpTokens`, revocable from the same settings page.
 *
 * Public clients with PKCE only — no client secrets are issued or accepted.
 */

import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { CORS_HEADERS } from "./server";
import { generateSecret, pkceChallenge, secretPrefix, sha256Hex } from "./crypto";
import { requirePublicOrigin } from "./config";

const TOKEN_PREFIX = "mtk";
const CODE_TTL_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status);
}

/* ----------------------------- discovery ----------------------------- */

/** RFC 9728 — tells a client which authorization server guards this resource. */
export function protectedResourceMetadata(): Response {
  const origin = requirePublicOrigin();
  return json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
  });
}

/** RFC 8414 — the authorization server's own metadata. */
export function authorizationServerMetadata(): Response {
  const origin = requirePublicOrigin();
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    token_endpoint: `${origin}/mcp/oauth/token`,
    registration_endpoint: `${origin}/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}

/* -------------------------- client registration -------------------------- */

/** RFC 7591 dynamic client registration. */
export async function registerClient(
  ctx: ActionCtx,
  request: Request
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_request", "Body is not valid JSON");
  }

  const payload = (body ?? {}) as {
    client_name?: unknown;
    redirect_uris?: unknown;
  };

  const redirectUris = Array.isArray(payload.redirect_uris)
    ? payload.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];

  if (redirectUris.length === 0) {
    return oauthError("invalid_redirect_uri", "redirect_uris is required");
  }
  for (const uri of redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return oauthError("invalid_redirect_uri", `Not a valid URL: ${uri}`);
    }
    // Loopback redirects are how desktop clients receive the code.
    const isLoopback =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !isLoopback) {
      return oauthError(
        "invalid_redirect_uri",
        `Redirect URIs must use https (or loopback): ${uri}`
      );
    }
  }

  const clientId = `mcpc_${crypto.randomUUID().replace(/-/g, "")}`;
  const clientName =
    typeof payload.client_name === "string" ? payload.client_name : undefined;

  await ctx.runMutation(internal.mcpOAuth.registerClient, {
    clientId,
    clientName,
    redirectUris,
  });

  return json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    201
  );
}

/* ------------------------------ token grant ------------------------------ */

async function readParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(body ?? {})) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  // forEach rather than entries(): the Convex tsconfig omits DOM.Iterable.
  form.forEach((value, key) => {
    if (typeof value === "string") out[key] = value;
  });
  return out;
}

export async function issueToken(
  ctx: ActionCtx,
  request: Request
): Promise<Response> {
  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch {
    return oauthError("invalid_request", "Could not read request parameters");
  }

  if (params.grant_type !== "authorization_code") {
    return oauthError(
      "unsupported_grant_type",
      "Only authorization_code is supported"
    );
  }

  const { code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier } =
    params;

  if (!code || !clientId || !redirectUri || !verifier) {
    return oauthError(
      "invalid_request",
      "code, client_id, redirect_uri and code_verifier are all required"
    );
  }

  // PKCE: the challenge stored at /authorize must equal S256(code_verifier).
  const challenge = await pkceChallenge(verifier);

  const secret = generateSecret(TOKEN_PREFIX);
  const outcome = await ctx.runMutation(internal.mcpOAuth.exchangeCode, {
    code,
    clientId,
    redirectUri,
    challenge,
    tokenHash: await sha256Hex(secret),
    tokenPrefix: secretPrefix(secret),
    now: Date.now(),
  });

  if (!outcome.ok) {
    return oauthError("invalid_grant", outcome.error);
  }

  return json({
    access_token: secret,
    token_type: "Bearer",
    scope: "mcp",
  });
}

export const AUTHORIZATION_CODE_TTL_MS = CODE_TTL_MS;
