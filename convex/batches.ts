import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./helpers/auth";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("batches").take(500);
  },
});

export const listByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("batches")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .take(200);
  },
});

export const get = query({
  args: { id: v.id("batches") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getNextBatchNumber = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    const batches = await ctx.db
      .query("batches")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .take(500);

    // Find the highest number used for this product's short code
    const prefix = product.shortCode ?? "";
    if (!prefix) return null;

    let maxNum = 0;
    for (const batch of batches) {
      if (batch.batchCode.startsWith(prefix)) {
        const numPart = parseInt(batch.batchCode.slice(prefix.length));
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }

    return {
      shortCode: prefix,
      nextNumber: maxNum + 1,
      suggestedCode: `${prefix}${String(maxNum + 1).padStart(4, "0")}`,
    };
  },
});

export const checkBatchCodeUnique = query({
  args: { batchCode: v.string(), excludeBatchId: v.optional(v.id("batches")) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("batches")
      .withIndex("by_batchCode", (q) => q.eq("batchCode", args.batchCode))
      .take(1);

    if (existing.length === 0) return true;
    if (args.excludeBatchId && existing[0]._id === args.excludeBatchId) return true;
    return false;
  },
});

export const create = mutation({
  args: {
    productId: v.id("products"),
    batchCode: v.string(),
    manufacturedDate: v.string(),
    expectedReadyDate: v.optional(v.string()),
    totalQuantity: v.number(),
    status: v.union(
      v.literal("upcoming"),
      v.literal("available"),
      v.literal("depleted")
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    // Check batch code uniqueness
    const existing = await ctx.db
      .query("batches")
      .withIndex("by_batchCode", (q) => q.eq("batchCode", args.batchCode))
      .take(1);
    if (existing.length > 0) {
      throw new Error(`Batch code "${args.batchCode}" is already in use`);
    }

    const batchId = await ctx.db.insert("batches", {
      ...args,
      originSource: undefined,
    });

    // Auto-create business inventory for this batch if status is available
    if (args.status === "available") {
      await ctx.db.insert("inventory", {
        batchId,
        productId: args.productId,
        heldByType: "business",
        quantity: args.totalQuantity,
      });
    }

    return batchId;
  },
});

export const update = mutation({
  args: {
    id: v.id("batches"),
    batchCode: v.string(),
    manufacturedDate: v.string(),
    expectedReadyDate: v.optional(v.string()),
    totalQuantity: v.number(),
    status: v.union(
      v.literal("upcoming"),
      v.literal("available"),
      v.literal("depleted")
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const batch = await ctx.db.get(args.id);
    if (!batch) {
      throw new Error("Batch not found");
    }

    // Check batch code uniqueness (excluding self)
    const existing = await ctx.db
      .query("batches")
      .withIndex("by_batchCode", (q) => q.eq("batchCode", args.batchCode))
      .take(1);
    if (existing.length > 0 && existing[0]._id !== args.id) {
      throw new Error(`Batch code "${args.batchCode}" is already in use`);
    }

    const previousStatus = batch.status;
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });

    // If transitioning from upcoming to available, create business inventory
    if (previousStatus === "upcoming" && args.status === "available") {
      await ctx.db.insert("inventory", {
        batchId: id,
        productId: batch.productId,
        heldByType: "business",
        quantity: args.totalQuantity,
      });
    }
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("batches"),
    status: v.union(
      v.literal("upcoming"),
      v.literal("available"),
      v.literal("depleted")
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const batch = await ctx.db.get(args.id);
    if (!batch) {
      throw new Error("Batch not found");
    }

    const previousStatus = batch.status;
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });

    // If transitioning from upcoming to available, create business inventory
    if (previousStatus === "upcoming" && args.status === "available") {
      await ctx.db.insert("inventory", {
        batchId: args.id,
        productId: batch.productId,
        heldByType: "business",
        quantity: batch.totalQuantity,
      });
    }
  },
});
