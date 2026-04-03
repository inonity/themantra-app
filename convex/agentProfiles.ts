import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole, isSellerRole } from "./helpers/auth";

export const upsert = mutation({
  args: {
    agentId: v.id("users"),
    rateId: v.optional(v.id("rates")),
    defaultStockModel: v.optional(
      v.union(
        v.literal("hold_paid"),
        v.literal("consignment"),
        v.literal("presell"),
        v.literal("dropship") // legacy
      )
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const agent = await ctx.db.get(args.agentId);
    if (!agent || !isSellerRole(agent.role)) throw new Error("Invalid agent");

    // Validate rateId if provided
    if (args.rateId) {
      const rate = await ctx.db.get(args.rateId);
      if (!rate) throw new Error("Rate not found");
    }

    const existing = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();

    if (existing) {
      await ctx.db.replace(existing._id, {
        agentId: args.agentId,
        rateId: args.rateId,
        defaultStockModel: args.defaultStockModel,
        notes: args.notes,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("agentProfiles", {
        agentId: args.agentId,
        rateId: args.rateId,
        defaultStockModel: args.defaultStockModel,
        notes: args.notes,
        updatedAt: Date.now(),
      });
    }
  },
});

export const getByAgentId = query({
  args: { agentId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Admin can view any, agent can only view own
    if (user.role !== "admin" && userId !== args.agentId) {
      throw new Error("Not authorized");
    }

    return await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();
  },
});

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", userId))
      .unique();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("agentProfiles").take(200);
  },
});
