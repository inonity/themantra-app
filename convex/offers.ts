import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./helpers/auth";

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    minQuantity: v.number(),
    bundlePrice: v.number(),
    productId: v.optional(v.id("products")),
    productIds: v.optional(v.array(v.id("products"))),
    collection: v.optional(v.string()),
    agentIds: v.optional(v.array(v.id("users"))),
    isActive: v.boolean(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");
    return await ctx.db.insert("offers", {
      ...args,
      type: "bundle",
      createdBy: user._id,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("offers"),
    name: v.string(),
    description: v.optional(v.string()),
    minQuantity: v.number(),
    bundlePrice: v.number(),
    productId: v.optional(v.id("products")),
    productIds: v.optional(v.array(v.id("products"))),
    collection: v.optional(v.string()),
    agentIds: v.optional(v.array(v.id("users"))),
    isActive: v.boolean(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const { id, ...fields } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Offer not found");
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const toggleActive = mutation({
  args: { id: v.id("offers") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const offer = await ctx.db.get(args.id);
    if (!offer) throw new Error("Offer not found");
    await ctx.db.patch(args.id, {
      isActive: !offer.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("offers").order("desc").take(100);
  },
});

export const getByIds = query({
  args: {
    ids: v.array(v.id("offers")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const offers = [];
    for (const id of args.ids) {
      const offer = await ctx.db.get(id);
      if (offer) offers.push(offer);
    }
    return offers;
  },
});

export const getApplicableOffers = query({
  args: {
    productIds: v.array(v.id("products")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();

    const activeOffers = await ctx.db
      .query("offers")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .take(100);

    // Collect collections for the selected products
    const productCollections = new Set<string>();
    for (const productId of args.productIds) {
      const product = await ctx.db.get(productId);
      if (product?.collection) {
        productCollections.add(product.collection);
      }
    }

    return activeOffers.filter((offer) => {
      // Check date range
      if (offer.startDate && now < offer.startDate) return false;
      if (offer.endDate && now > offer.endDate) return false;

      // Check product scope — show offer if at least one product is eligible
      if (offer.productId) {
        if (!args.productIds.includes(offer.productId)) return false;
      } else if (offer.productIds && offer.productIds.length > 0) {
        const hasMatchingProduct = args.productIds.some((pid) =>
          offer.productIds!.includes(pid)
        );
        if (!hasMatchingProduct) return false;
      } else if (offer.collection) {
        if (!productCollections.has(offer.collection)) return false;
      }

      // Check agent scope
      if (offer.agentIds && offer.agentIds.length > 0) {
        if (!offer.agentIds.includes(userId)) return false;
      }

      return true;
    });
  },
});
