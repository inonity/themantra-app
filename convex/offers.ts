import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./helpers/auth";

const forWhoValidator = v.union(
  v.literal("customers"),
  v.literal("agents"),
  v.literal("both")
);

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    minQuantity: v.number(),
    bundlePrice: v.number(),
    productId: v.optional(v.id("products")),
    productIds: v.optional(v.array(v.id("products"))),
    collection: v.optional(v.string()),
    sizeMl: v.optional(v.number()),
    forWho: v.optional(forWhoValidator),
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
    sizeMl: v.optional(v.number()),
    forWho: v.optional(forWhoValidator),
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

// Any authenticated user can list active offers (for form creation, etc.)
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const now = Date.now();
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .take(100);
    return offers.filter((o) => {
      if (o.startDate && now < o.startDate) return false;
      if (o.endDate && now > o.endDate) return false;
      return true;
    });
  },
});

/**
 * Returns active offers applicable to the given sale context.
 *
 * Filters are AND-based:
 * 1. Product scope (collection / specific product(s) / all) — at least one item matches
 * 2. Size filter (offer.sizeMl) — at least one selected variant has that size
 * 3. Audience filter (offer.forWho) — matches the saleContext ("customers" | "agents")
 * 4. Agent eligibility (offer.agentIds)
 *
 * Legacy offers that only have variantId/variantIds use the old OR logic for backward compat.
 */
export const getApplicableOffers = query({
  args: {
    productIds: v.array(v.id("products")),
    variantIds: v.optional(v.array(v.id("productVariants"))),
    // "customers" for agent→customer (b2c), "agents" for HQ→agent (b2b)
    saleContext: v.optional(v.union(v.literal("customers"), v.literal("agents"))),
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

    // Collect sizeMl values for the selected variants
    const variantSizes = new Set<number>();
    for (const variantId of args.variantIds ?? []) {
      const variant = await ctx.db.get(variantId);
      if (variant?.sizeMl != null) variantSizes.add(variant.sizeMl);
    }

    const variantIds = args.variantIds ?? [];
    const saleContext = args.saleContext ?? "customers";

    return activeOffers.filter((offer) => {
      // Check date range
      if (offer.startDate && now < offer.startDate) return false;
      if (offer.endDate && now > offer.endDate) return false;

      // --- Legacy offers (variantId / variantIds) — old OR logic ---
      if (offer.variantId || (offer.variantIds && offer.variantIds.length > 0)) {
        if (offer.variantId) {
          if (!variantIds.includes(offer.variantId)) return false;
        } else if (offer.variantIds && offer.variantIds.length > 0) {
          const hasMatch = variantIds.some((vid) => offer.variantIds!.includes(vid));
          if (!hasMatch) return false;
        }
        // Agent scope
        if (offer.agentIds && offer.agentIds.length > 0) {
          if (!offer.agentIds.includes(userId)) return false;
        }
        return true;
      }

      // --- New AND-based logic ---

      // 1. Product scope: collection or specific product(s) — all absent = any product
      if (offer.collection) {
        if (!productCollections.has(offer.collection)) return false;
      } else if (offer.productId) {
        if (!args.productIds.includes(offer.productId)) return false;
      } else if (offer.productIds && offer.productIds.length > 0) {
        const hasMatchingProduct = args.productIds.some((pid) =>
          offer.productIds!.includes(pid)
        );
        if (!hasMatchingProduct) return false;
      }

      // 2. Size filter
      if (offer.sizeMl != null) {
        if (!variantSizes.has(offer.sizeMl)) return false;
      }

      // 3. Audience filter
      if (offer.forWho && offer.forWho !== "both") {
        if (offer.forWho !== saleContext) return false;
      }

      // 4. Agent scope
      if (offer.agentIds && offer.agentIds.length > 0) {
        if (!offer.agentIds.includes(userId)) return false;
      }

      return true;
    });
  },
});
