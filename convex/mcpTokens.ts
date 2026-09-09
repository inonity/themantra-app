import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireRealAuth } from "./helpers/auth";
import { generateSecret, secretPrefix, sha256Hex } from "./mcp/crypto";

export const TOKEN_PREFIX = "mtk";

/** Active tokens one person may hold at once. */
const MAX_TOKENS_PER_USER = 20;

/**
 * Create a personal MCP token.
 *
 * This is an action because hashing needs `crypto.subtle`, which is only
 * available outside the deterministic query/mutation runtime. The plaintext
 * secret is returned exactly once and never stored.
 */
export const create = action({
  args: { name: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ secret: string; prefix: string; tokenId: Id<"mcpTokens"> }> => {
    const secret = generateSecret(TOKEN_PREFIX);
    const prefix = secretPrefix(secret);
    const tokenId: Id<"mcpTokens"> = await ctx.runMutation(
      internal.mcpTokens.insertToken,
      {
        name: args.name.trim().slice(0, 60) || "Untitled token",
        tokenHash: await sha256Hex(secret),
        tokenPrefix: prefix,
      }
    );
    return { secret, prefix, tokenId };
  },
});

export const insertToken = internalMutation({
  args: {
    name: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"mcpTokens">> => {
    // Deliberately the *real* user, not the quick-switch target: a token must
    // always belong to the person actually signed in.
    const userId = await requireRealAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user?.role) {
      throw new Error("Your account has no role assigned yet");
    }

    const existing = await ctx.db
      .query("mcpTokens")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .take(MAX_TOKENS_PER_USER * 4);
    const active = existing.filter((t) => !t.revokedAt);
    if (active.length >= MAX_TOKENS_PER_USER) {
      throw new Error(
        `You already have ${MAX_TOKENS_PER_USER} active tokens. Revoke one first.`
      );
    }

    return await ctx.db.insert("mcpTokens", {
      userId,
      name: args.name,
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      source: "manual",
      createdAt: Date.now(),
    });
  },
});

/**
 * Tokens belonging to the signed-in user. Admins also get everyone else's,
 * so a departing agent's access can be cut without their help.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireRealAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Not authenticated");

    const own = await ctx.db
      .query("mcpTokens")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);

    const shape = (t: (typeof own)[number], ownerName?: string) => ({
      _id: t._id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      source: t.source,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt ?? null,
      revokedAt: t.revokedAt ?? null,
      ownerName,
    });

    if (user.role !== "admin") {
      return { mine: own.map((t) => shape(t)), others: [] };
    }

    const all = await ctx.db.query("mcpTokens").order("desc").take(300);
    const foreign = all.filter((t) => t.userId !== userId);
    const owners = new Map<string, string>();
    for (const token of foreign) {
      if (owners.has(token.userId)) continue;
      const owner = await ctx.db.get(token.userId);
      owners.set(
        token.userId,
        owner?.nickname ?? owner?.name ?? owner?.email ?? "Unknown user"
      );
    }

    return {
      mine: own.map((t) => shape(t)),
      others: foreign.map((t) => shape(t, owners.get(t.userId))),
    };
  },
});

export const revoke = mutation({
  args: { tokenId: v.id("mcpTokens") },
  handler: async (ctx, args) => {
    const userId = await requireRealAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Not authenticated");

    const token = await ctx.db.get(args.tokenId);
    if (!token) throw new Error("Token not found");
    if (token.userId !== userId && user.role !== "admin") {
      throw new Error("You can only revoke your own tokens");
    }
    if (token.revokedAt) return null;

    await ctx.db.patch(args.tokenId, { revokedAt: Date.now() });
    return null;
  },
});
