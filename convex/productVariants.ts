import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./helpers/auth";

const forWhoValidator = v.union(
  v.literal("customers"),
  v.literal("agents"),
  v.literal("both")
);

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("productVariants").take(500);
  },
});

// All active, customer-visible variants — for public/customer-facing forms
export const listAllPublic = query({
  args: {},
  handler: async (ctx) => {
    const variants = await ctx.db.query("productVariants").take(500);
    // forWho absent (not yet migrated) defaults to "customers"
    return variants.filter(
      (v) => v.status === "active" && v.forWho !== "agents"
    );
  },
});

export const listByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productVariants")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .take(50);
  },
});

// Only active, customer-visible variants — for customer-facing flows
export const listPublicByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_productId_and_status", (q) =>
        q.eq("productId", args.productId).eq("status", "active")
      )
      .take(50);
    return variants.filter((v) => v.forWho !== "agents");
  },
});

// All active variants for a product (agent + customer) — for agent-facing flows
export const listActiveByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productVariants")
      .withIndex("by_productId_and_status", (q) =>
        q.eq("productId", args.productId).eq("status", "active")
      )
      .take(50);
  },
});

export const get = query({
  args: { id: v.id("productVariants") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("productVariants")) },
  handler: async (ctx, args) => {
    const results = [];
    for (const id of args.ids) {
      const variant = await ctx.db.get(id);
      if (variant) results.push(variant);
    }
    return results;
  },
});

/** Returns distinct sizeMl values across all variants, sorted ascending. */
export const listSizes = query({
  args: {},
  handler: async (ctx) => {
    const variants = await ctx.db.query("productVariants").take(500);
    const sizes = new Set<number>();
    for (const v of variants) {
      if (v.sizeMl != null) sizes.add(v.sizeMl);
    }
    return Array.from(sizes).sort((a, b) => a - b);
  },
});

/** Returns distinct type values from agent-only variants, sorted alphabetically. */
export const listAgentTypes = query({
  args: {},
  handler: async (ctx) => {
    const variants = await ctx.db.query("productVariants").take(500);
    const types = new Set<string>();
    for (const v of variants) {
      if (v.forWho === "agents" && v.type) types.add(v.type);
    }
    return Array.from(types).sort();
  },
});

export const create = mutation({
  args: {
    productId: v.id("products"),
    name: v.string(),
    sizeMl: v.optional(v.number()),
    type: v.optional(v.string()),
    price: v.number(),
    forWho: forWhoValidator,
    status: v.union(v.literal("active"), v.literal("discontinued")),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");
    return await ctx.db.insert("productVariants", {
      ...args,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("productVariants"),
    name: v.string(),
    sizeMl: v.optional(v.number()),
    type: v.optional(v.string()),
    price: v.number(),
    forWho: forWhoValidator,
    status: v.union(v.literal("active"), v.literal("discontinued")),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Variant not found");
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

/**
 * Migration: backfills forWho on all productVariants that still use the old
 * variantType/agentOnly fields.
 * - agentOnly=true → forWho="agents"
 * - agentOnly=false (or absent) → forWho="customers"
 * Safe to run multiple times.
 */
export const migrateToForWho = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const variants = await ctx.db.query("productVariants").take(500);
    let migrated = 0;
    let skipped = 0;

    for (const variant of variants) {
      if (variant.forWho) {
        skipped++;
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacy = variant as any;
      const forWho = legacy.agentOnly === true ? "agents" : "customers";
      await ctx.db.patch(variant._id, { forWho });
      migrated++;
    }

    return { migrated, skipped };
  },
});

/**
 * One-time migration: for each product that has no variants yet,
 * create a default "30ML" variant from the product's existing price.
 * Also backfills variantId on all batches, inventory, and stockMovements
 * that belong to those products.
 *
 * Safe to run multiple times — skips products that already have variants.
 */
export const migrateProductsToVariants = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const products = await ctx.db.query("products").take(200);
    let created = 0;
    let skipped = 0;

    for (const product of products) {
      // Check if variants already exist
      const existing = await ctx.db
        .query("productVariants")
        .withIndex("by_productId", (q) => q.eq("productId", product._id))
        .take(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Create the default 30ML standard variant from the product's price
      const retailPrice = product.price ?? 0;
      const variantId = await ctx.db.insert("productVariants", {
        productId: product._id,
        name: "30ML",
        sizeMl: 30,
        price: retailPrice,
        forWho: "customers",
        status: "active",
        sortOrder: 0,
        updatedAt: Date.now(),
      });

      // Backfill batches
      const batches = await ctx.db
        .query("batches")
        .withIndex("by_productId", (q) => q.eq("productId", product._id))
        .take(500);

      for (const batch of batches) {
        if (!batch.variantId) {
          await ctx.db.patch(batch._id, { variantId });
        }
      }

      // Backfill inventory
      const inventoryRecords = await ctx.db
        .query("inventory")
        .withIndex("by_productId", (q) => q.eq("productId", product._id))
        .take(500);

      for (const inv of inventoryRecords) {
        if (!inv.variantId) {
          await ctx.db.patch(inv._id, { variantId });
        }
      }

      // Backfill stockMovements
      const movements = await ctx.db
        .query("stockMovements")
        .withIndex("by_productId", (q) => q.eq("productId", product._id))
        .take(500);

      for (const movement of movements) {
        if (!movement.variantId) {
          await ctx.db.patch(movement._id, { variantId });
        }
      }

      created++;
    }

    return { created, skipped };
  },
});
