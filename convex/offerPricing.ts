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
    offerId: v.id("offers"),
    stockModel: stockModelValidator,
    rateType: v.union(v.literal("fixed"), v.literal("percentage")),
    rateValue: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");

    const offer = await ctx.db.get(args.offerId);
    if (!offer) throw new Error("Offer not found");

    const existing = await ctx.db
      .query("offerPricing")
      .withIndex("by_offerId_and_stockModel", (q) =>
        q.eq("offerId", args.offerId).eq("stockModel", args.stockModel)
      )
      .unique();

    const data = {
      offerId: args.offerId,
      stockModel: args.stockModel,
      rateType: args.rateType,
      rateValue: args.rateValue,
      updatedBy: admin._id,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("offerPricing", data);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("offerPricing") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.delete(args.id);
  },
});

export const listByOffer = query({
  args: { offerId: v.id("offers") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    return await ctx.db
      .query("offerPricing")
      .withIndex("by_offerId", (q) => q.eq("offerId", args.offerId))
      .take(10);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("offerPricing").take(200);
  },
});
