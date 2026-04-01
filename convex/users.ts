import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

export const listAgents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "agent"))
      .take(100);
  },
});

export const listSalesStaff = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "sales"))
      .take(100);
  },
});

export const listSellers = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "agent"))
      .take(100);
    const salesStaff = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "sales"))
      .take(100);
    return [...agents, ...salesStaff];
  },
});
