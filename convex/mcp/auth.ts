import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

export type McpRole = "admin" | "agent" | "sales";

export type McpIdentity = {
  tokenId: Id<"mcpTokens">;
  tokenName: string;
  userId: Id<"users">;
  displayName: string;
  role: McpRole;
  lastUsedAt: number | null;
};

/**
 * Resolve a bearer token to the user it acts as. Returns null for unknown,
 * revoked, expired, or role-less tokens — the caller turns that into a 401.
 */
export const resolveToken = internalQuery({
  args: { tokenHash: v.string(), now: v.number() },
  handler: async (ctx, args): Promise<McpIdentity | null> => {
    const token = await ctx.db
      .query("mcpTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();

    if (!token) return null;
    if (token.revokedAt !== undefined) return null;
    if (token.expiresAt !== undefined && token.expiresAt <= args.now) return null;

    const user: Doc<"users"> | null = await ctx.db.get(token.userId);
    if (!user?.role) return null;

    return {
      tokenId: token._id,
      tokenName: token.name,
      userId: user._id,
      displayName: user.nickname ?? user.name ?? user.email ?? "Unknown",
      role: user.role,
      lastUsedAt: token.lastUsedAt ?? null,
    };
  },
});

/**
 * Record that a token was used. Called at most once every few minutes per
 * token so a busy client does not rewrite the same document on every request.
 */
export const touchToken = internalMutation({
  args: { tokenId: v.id("mcpTokens"), now: v.number() },
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token || token.revokedAt !== undefined) return null;
    await ctx.db.patch(args.tokenId, { lastUsedAt: args.now });
    return null;
  },
});
