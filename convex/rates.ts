import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./helpers/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("rates").take(100);
  },
});

export const get = query({
  args: { id: v.id("rates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    collectionRates: v.array(
      v.object({
        collection: v.string(),
        rateType: v.union(v.literal("fixed"), v.literal("percentage")),
        rateValue: v.number(),
      })
    ),
    defaultRate: v.optional(
      v.object({
        rateType: v.union(v.literal("fixed"), v.literal("percentage")),
        rateValue: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");

    // Check name uniqueness
    const existing = await ctx.db
      .query("rates")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (existing) throw new Error("A rate with this name already exists");

    return await ctx.db.insert("rates", {
      name: args.name,
      collectionRates: args.collectionRates,
      defaultRate: args.defaultRate,
      createdBy: admin._id,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("rates"),
    name: v.string(),
    collectionRates: v.array(
      v.object({
        collection: v.string(),
        rateType: v.union(v.literal("fixed"), v.literal("percentage")),
        rateValue: v.number(),
      })
    ),
    defaultRate: v.optional(
      v.object({
        rateType: v.union(v.literal("fixed"), v.literal("percentage")),
        rateValue: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const rate = await ctx.db.get(args.id);
    if (!rate) throw new Error("Rate not found");

    // Check name uniqueness (exclude self)
    if (args.name !== rate.name) {
      const nameConflict = await ctx.db
        .query("rates")
        .withIndex("by_name", (q) => q.eq("name", args.name))
        .unique();
      if (nameConflict) throw new Error("A rate with this name already exists");
    }

    await ctx.db.patch(args.id, {
      name: args.name,
      collectionRates: args.collectionRates,
      defaultRate: args.defaultRate,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("rates") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    // Check no agents are assigned to this rate
    const assignedProfiles = await ctx.db
      .query("agentProfiles")
      .take(200);
    const hasAssigned = assignedProfiles.some((p) => p.rateId === args.id);
    if (hasAssigned) {
      throw new Error("Cannot delete rate: agents are still assigned to it");
    }

    // Check no offer pricing references this rate
    const offerPricingRefs = await ctx.db
      .query("offerPricing")
      .withIndex("by_rateId", (q) => q.eq("rateId", args.id))
      .take(1);
    if (offerPricingRefs.length > 0) {
      throw new Error("Cannot delete rate: offer pricing rules reference it");
    }

    await ctx.db.delete(args.id);
  },
});
