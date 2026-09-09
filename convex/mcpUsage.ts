/**
 * MCP usage tracking: one row per tool call, and the rollups the settings page
 * shows. Answers "how much is this being used, and which tools actually earn
 * their place in the catalogue".
 */

import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireRealAuth } from "./helpers/auth";

/** Rows older than this are pruned by the daily cron. */
export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const SCAN_CAP = 5000;

export const log = internalMutation({
  args: {
    tokenId: v.id("mcpTokens"),
    userId: v.id("users"),
    tool: v.string(),
    ok: v.boolean(),
    durationMs: v.number(),
    errorMessage: v.optional(v.string()),
    calledAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("mcpToolCalls", {
      ...args,
      // Keep stored failures short; the full text already went back to the client.
      errorMessage: args.errorMessage?.slice(0, 300),
    });
    return null;
  },
});

/** Delete call records past the retention window, a batch at a time. */
export const pruneOldCalls = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const before = Date.now() - RETENTION_MS;
    const stale = await ctx.db
      .query("mcpToolCalls")
      .withIndex("by_calledAt", (q) => q.lt("calledAt", before))
      .take(500);

    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

/**
 * Usage rollup for the MCP settings page. Admins see the whole team; everyone
 * else sees only their own calls, matching the tools' own scoping.
 */
export const summary = query({
  args: {
    days: v.number(),
    now: v.number(),
    // Narrow every figure to one connection. Absent = all of them.
    tokenId: v.optional(v.id("mcpTokens")),
  },
  handler: async (ctx, args) => {
    const userId = await requireRealAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Not authenticated");

    const isAdmin = user.role === "admin";
    const windowDays = Math.max(1, Math.min(365, Math.floor(args.days)));
    const since = args.now - windowDays * 24 * 60 * 60 * 1000;

    // Connections this person may look at — the picker's options. Listed from
    // the tokens table rather than from call history, so a token that has
    // never been used still appears.
    const ownTokens = await ctx.db
      .query("mcpTokens")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    const selectable = isAdmin
      ? await ctx.db.query("mcpTokens").order("desc").take(300)
      : ownTokens;

    const ownerNames = new Map<Id<"users">, string>();
    if (isAdmin) {
      for (const token of selectable) {
        if (ownerNames.has(token.userId)) continue;
        const owner: Doc<"users"> | null = await ctx.db.get(token.userId);
        ownerNames.set(
          token.userId,
          owner?.nickname ?? owner?.name ?? owner?.email ?? "Unknown"
        );
      }
    }

    const connections = selectable.map((token) => ({
      tokenId: token._id,
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      source: token.source,
      revoked: token.revokedAt !== undefined,
      ownerName: isAdmin ? ownerNames.get(token.userId) ?? null : null,
    }));

    // A specific connection was picked: check it is one this person may see,
    // then read only that token's calls.
    let rows;
    if (args.tokenId) {
      const target = await ctx.db.get(args.tokenId);
      if (!target || (!isAdmin && target.userId !== userId)) {
        throw new Error("That connection belongs to someone else");
      }
      rows = await ctx.db
        .query("mcpToolCalls")
        .withIndex("by_tokenId_and_calledAt", (q) =>
          q.eq("tokenId", args.tokenId!).gte("calledAt", since)
        )
        .take(SCAN_CAP);
    } else if (isAdmin) {
      rows = await ctx.db
        .query("mcpToolCalls")
        .withIndex("by_calledAt", (q) => q.gte("calledAt", since))
        .take(SCAN_CAP);
    } else {
      rows = await ctx.db
        .query("mcpToolCalls")
        .withIndex("by_userId_and_calledAt", (q) =>
          q.eq("userId", userId).gte("calledAt", since)
        )
        .take(SCAN_CAP);
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const last24h = rows.filter((r) => r.calledAt >= args.now - dayMs);

    // Per-tool breakdown
    const byTool = new Map<string, { calls: number; errors: number; totalMs: number }>();
    for (const row of rows) {
      const bucket = byTool.get(row.tool) ?? { calls: 0, errors: 0, totalMs: 0 };
      bucket.calls += 1;
      if (!row.ok) bucket.errors += 1;
      bucket.totalMs += row.durationMs;
      byTool.set(row.tool, bucket);
    }
    const tools = [...byTool.entries()]
      .map(([tool, b]) => ({
        tool,
        calls: b.calls,
        errors: b.errors,
        avgMs: Math.round(b.totalMs / b.calls),
      }))
      .sort((a, b) => b.calls - a.calls);

    // Per-token breakdown — which connection is actually doing the work.
    const byToken = new Map<Id<"mcpTokens">, { calls: number; lastAt: number }>();
    for (const row of rows) {
      const bucket = byToken.get(row.tokenId) ?? { calls: 0, lastAt: 0 };
      bucket.calls += 1;
      bucket.lastAt = Math.max(bucket.lastAt, row.calledAt);
      byToken.set(row.tokenId, bucket);
    }
    const tokens: {
      name: string;
      tokenPrefix: string | null;
      ownerName: string | null;
      source: string | null;
      revoked: boolean;
      calls: number;
      lastCallAt: number;
    }[] = [];
    for (const [tokenId, bucket] of byToken) {
      const token = await ctx.db.get(tokenId);
      let ownerName: string | null = null;
      if (isAdmin && token) {
        const owner: Doc<"users"> | null = await ctx.db.get(token.userId);
        ownerName = owner?.nickname ?? owner?.name ?? owner?.email ?? "Unknown";
      }
      tokens.push({
        // A token can be deleted outright while its call history survives.
        name: token?.name ?? "Deleted token",
        tokenPrefix: token?.tokenPrefix ?? null,
        ownerName,
        source: token?.source ?? null,
        revoked: token?.revokedAt !== undefined,
        calls: bucket.calls,
        lastCallAt: bucket.lastAt,
      });
    }
    tokens.sort((a, b) => b.calls - a.calls);

    // Per-person breakdown (admins only)
    let people: { name: string; calls: number }[] = [];
    if (isAdmin) {
      const byUser = new Map<Id<"users">, number>();
      for (const row of rows) {
        byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + 1);
      }
      const named: { name: string; calls: number }[] = [];
      for (const [id, calls] of byUser) {
        const person: Doc<"users"> | null = await ctx.db.get(id);
        named.push({
          name: person?.nickname ?? person?.name ?? person?.email ?? "Unknown",
          calls,
        });
      }
      people = named.sort((a, b) => b.calls - a.calls);
    }

    // Daily counts, oldest first, for the sparkline.
    const perDay = new Map<number, number>();
    for (let i = windowDays - 1; i >= 0; i--) {
      perDay.set(Math.floor((args.now - i * dayMs) / dayMs), 0);
    }
    for (const row of rows) {
      const key = Math.floor(row.calledAt / dayMs);
      if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }

    return {
      isAdmin,
      windowDays,
      totalCalls: rows.length,
      callsLast24h: last24h.length,
      errorCount: rows.filter((r) => !r.ok).length,
      truncated: rows.length >= SCAN_CAP,
      connections,
      selectedTokenId: args.tokenId ?? null,
      tools,
      tokens,
      people,
      daily: [...perDay.values()],
      recent: rows
        .sort((a, b) => b.calledAt - a.calledAt)
        .slice(0, 15)
        .map((r) => ({
          tool: r.tool,
          ok: r.ok,
          durationMs: r.durationMs,
          calledAt: r.calledAt,
          errorMessage: r.errorMessage ?? null,
        })),
    };
  },
});
