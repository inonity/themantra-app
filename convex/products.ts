import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./helpers/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("products").take(200);
  },
});

export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listCollections = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").take(200);
    const collections = new Set<string>();
    for (const p of products) {
      if (p.collection) collections.add(p.collection);
    }
    return Array.from(collections).sort();
  },
});

export const listSellable = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").take(200);
    return products.filter(
      (p) => p.status === "active" || p.status === "future_release"
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    shortCode: v.string(),
    description: v.optional(v.string()),
    collection: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("discontinued"), v.literal("future_release")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    return await ctx.db.insert("products", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.string(),
    shortCode: v.string(),
    description: v.optional(v.string()),
    collection: v.union(v.string(), v.null()),
    status: v.union(v.literal("active"), v.literal("discontinued"), v.literal("future_release")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const { id, collection, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      collection: collection ?? undefined,
      updatedAt: Date.now(),
    });
  },
});
