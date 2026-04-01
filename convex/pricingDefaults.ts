import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./helpers/auth";

const stockModelValidator = v.union(
  v.literal("hold_paid"),
  v.literal("consignment"),
  v.literal("dropship")
);

export const upsert = mutation({
  args: {
    stockModel: stockModelValidator,
    productId: v.optional(v.id("products")),
    productIds: v.optional(v.array(v.id("products"))),
    collection: v.optional(v.string()),
    rateType: v.union(v.literal("fixed"), v.literal("percentage")),
    rateValue: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");

    // Validate mutual exclusivity: at most one of productId, productIds, collection
    const selectors = [args.productId, args.productIds, args.collection].filter(
      (v) => v !== undefined
    );
    if (selectors.length > 1) {
      throw new Error(
        "Only one of productId, productIds, or collection can be set"
      );
    }

    const data = {
      stockModel: args.stockModel,
      productId: args.productId,
      productIds: args.productIds,
      collection: args.collection,
      rateType: args.rateType,
      rateValue: args.rateValue,
      updatedBy: admin._id,
      updatedAt: Date.now(),
    };

    if (args.productId !== undefined) {
      // Single product: use existing index
      const existing = await ctx.db
        .query("pricingDefaults")
        .withIndex("by_stockModel_and_productId", (q) =>
          q.eq("stockModel", args.stockModel).eq("productId", args.productId)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, data);
        return existing._id;
      }
    } else if (args.collection !== undefined) {
      // Collection: use collection index
      const existing = await ctx.db
        .query("pricingDefaults")
        .withIndex("by_stockModel_and_collection", (q) =>
          q.eq("stockModel", args.stockModel).eq("collection", args.collection)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, data);
        return existing._id;
      }
    } else if (args.productIds !== undefined) {
      // Multi-product: scan by stockModel, find matching set
      const candidates = await ctx.db
        .query("pricingDefaults")
        .withIndex("by_stockModel", (q) => q.eq("stockModel", args.stockModel))
        .take(200);
      const sorted = [...args.productIds].sort();
      const existing = candidates.find((c) => {
        if (!c.productIds) return false;
        const cSorted = [...c.productIds].sort();
        return (
          cSorted.length === sorted.length &&
          cSorted.every((id, i) => id === sorted[i])
        );
      });
      if (existing) {
        await ctx.db.patch(existing._id, data);
        return existing._id;
      }
    } else {
      // Global default (no product/collection selector)
      const existing = await ctx.db
        .query("pricingDefaults")
        .withIndex("by_stockModel_and_productId", (q) =>
          q.eq("stockModel", args.stockModel).eq("productId", undefined)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, data);
        return existing._id;
      }
    }

    return await ctx.db.insert("pricingDefaults", data);
  },
});

export const remove = mutation({
  args: { id: v.id("pricingDefaults") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.delete(args.id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("pricingDefaults").take(200);
  },
});
