import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole, isSellerRole } from "./helpers/auth";

const stockModelValidator = v.union(
  v.literal("hold_paid"),
  v.literal("consignment"),
  v.literal("dropship")
);

export const upsert = mutation({
  args: {
    agentId: v.id("users"),
    stockModel: stockModelValidator,
    rateType: v.union(v.literal("fixed"), v.literal("percentage")),
    rateValue: v.number(),
    productOverrides: v.optional(
      v.array(
        v.object({
          productId: v.id("products"),
          rateType: v.union(v.literal("fixed"), v.literal("percentage")),
          rateValue: v.number(),
        })
      )
    ),
    collectionOverrides: v.optional(
      v.array(
        v.object({
          collection: v.string(),
          rateType: v.union(v.literal("fixed"), v.literal("percentage")),
          rateValue: v.number(),
        })
      )
    ),
    offerOverrides: v.optional(
      v.array(
        v.object({
          offerId: v.id("offers"),
          rateType: v.union(v.literal("fixed"), v.literal("percentage")),
          rateValue: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const agent = await ctx.db.get(args.agentId);
    if (!agent || !isSellerRole(agent.role)) throw new Error("Invalid agent");

    const existing = await ctx.db
      .query("agentPricing")
      .withIndex("by_agentId_and_stockModel", (q) =>
        q.eq("agentId", args.agentId).eq("stockModel", args.stockModel)
      )
      .unique();

    const data = {
      agentId: args.agentId,
      stockModel: args.stockModel,
      rateType: args.rateType,
      rateValue: args.rateValue,
      productOverrides: args.productOverrides,
      collectionOverrides: args.collectionOverrides,
      offerOverrides: args.offerOverrides,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.replace(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("agentPricing", data);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("agentPricing") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.delete(args.id);
  },
});

export const listByAgent = query({
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
      .query("agentPricing")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .take(10);
  },
});

export const getByAgentAndStockModel = query({
  args: {
    agentId: v.id("users"),
    stockModel: stockModelValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (user.role !== "admin" && userId !== args.agentId) {
      throw new Error("Not authorized");
    }

    return await ctx.db
      .query("agentPricing")
      .withIndex("by_agentId_and_stockModel", (q) =>
        q.eq("agentId", args.agentId).eq("stockModel", args.stockModel)
      )
      .unique();
  },
});

export const listMyPricing = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("agentPricing")
      .withIndex("by_agentId", (q) => q.eq("agentId", userId))
      .take(10);
  },
});
