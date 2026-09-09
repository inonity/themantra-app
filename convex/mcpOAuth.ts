/**
 * Convex-side state for the OAuth connector flow. The HTTP handlers live in
 * `mcp/oauth.ts`; this file holds the database work.
 */

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireRealAuth } from "./helpers/auth";
import { AUTHORIZATION_CODE_TTL_MS } from "./mcp/oauth";
import { mcpAllowedForRole } from "./mcp/config";

export const registerClient = internalMutation({
  args: {
    clientId: v.string(),
    clientName: v.optional(v.string()),
    redirectUris: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("mcpOAuthClients", {
      clientId: args.clientId,
      clientName: args.clientName,
      redirectUris: args.redirectUris,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Details for the consent screen. Requires a signed-in user — an anonymous
 * caller has no business enumerating registered clients.
 */
export const describeRequest = query({
  args: { clientId: v.string(), redirectUri: v.string() },
  handler: async (ctx, args) => {
    await requireRealAuth(ctx);

    const client = await ctx.db
      .query("mcpOAuthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();

    if (!client) {
      return { valid: false as const, reason: "Unknown client." };
    }
    if (!client.redirectUris.includes(args.redirectUri)) {
      return {
        valid: false as const,
        reason: "This redirect URL was not registered by the client.",
      };
    }
    return {
      valid: true as const,
      clientName: client.clientName ?? "An MCP client",
    };
  },
});

/**
 * Approve a connector and mint a single-use authorization code. The code is
 * bound to the client, the redirect URI and the PKCE challenge; the token
 * endpoint checks all three.
 */
export const approve = mutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
  },
  handler: async (ctx, args): Promise<{ code: string }> => {
    const userId = await requireRealAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user?.role) {
      throw new Error("Your account has no role assigned yet");
    }
    if (!mcpAllowedForRole(user.role)) {
      throw new Error("MCP access is not available for your account");
    }

    if (args.codeChallengeMethod !== "S256") {
      throw new Error("Only the S256 PKCE method is supported");
    }
    if (!args.codeChallenge) {
      throw new Error("A PKCE code challenge is required");
    }

    const client = await ctx.db
      .query("mcpOAuthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (!client) throw new Error("Unknown OAuth client");
    if (!client.redirectUris.includes(args.redirectUri)) {
      throw new Error("Redirect URL was not registered by this client");
    }

    const now = Date.now();

    // Opportunistic cleanup so expired codes do not accumulate.
    const stale = await ctx.db.query("mcpOAuthCodes").take(50);
    for (const row of stale) {
      if (row.expiresAt <= now) await ctx.db.delete(row._id);
    }

    const code = `mcpa_${crypto.randomUUID().replace(/-/g, "")}`;
    await ctx.db.insert("mcpOAuthCodes", {
      code,
      clientId: args.clientId,
      userId,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      expiresAt: now + AUTHORIZATION_CODE_TTL_MS,
    });

    return { code };
  },
});

/**
 * Redeem an authorization code for an access token. The code is deleted
 * whatever the outcome of the PKCE check, so it can never be retried.
 */
export const exchangeCode = internalMutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    challenge: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    now: v.number(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const row = await ctx.db
      .query("mcpOAuthCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!row) return { ok: false, error: "Authorization code is invalid or already used" };

    await ctx.db.delete(row._id);

    if (row.expiresAt <= args.now) {
      return { ok: false, error: "Authorization code has expired" };
    }
    if (row.clientId !== args.clientId) {
      return { ok: false, error: "Authorization code was issued to another client" };
    }
    if (row.redirectUri !== args.redirectUri) {
      return { ok: false, error: "redirect_uri does not match the authorization request" };
    }
    if (row.codeChallenge !== args.challenge) {
      return { ok: false, error: "PKCE verification failed" };
    }

    const user = await ctx.db.get(row.userId);
    if (!user?.role) return { ok: false, error: "User no longer has access" };
    if (!mcpAllowedForRole(user.role)) {
      return { ok: false, error: "User no longer has access" };
    }

    const client = await ctx.db
      .query("mcpOAuthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();

    await ctx.db.insert("mcpTokens", {
      userId: row.userId,
      name: client?.clientName
        ? `${client.clientName} (connector)`
        : "OAuth connector",
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      source: "oauth",
      oauthClientId: args.clientId,
      createdAt: args.now,
    });

    return { ok: true };
  },
});
