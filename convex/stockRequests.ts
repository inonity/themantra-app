import { query, mutation, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./helpers/auth";

// Agent: create a stock request
export const create = mutation({
  args: {
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    quantity: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    if (args.quantity < 1) throw new Error("Quantity must be at least 1");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");
    if (product.status !== "active" && product.status !== "future_release") {
      throw new Error("Product is not available");
    }

    return await ctx.db.insert("stockRequests", {
      agentId: userId,
      productId: args.productId,
      variantId: args.variantId,
      quantity: args.quantity,
      notes: args.notes,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

// Agent: cancel own pending request
export const cancel = mutation({
  args: {
    requestId: v.id("stockRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.agentId !== userId) throw new Error("Not authorized");
    if (request.status !== "pending") throw new Error("Request is not pending");

    await ctx.db.patch(args.requestId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
  },
});

// Admin: mark request as fulfilled (after transferring stock)
export const markFulfilled = mutation({
  args: {
    requestId: v.id("stockRequests"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") throw new Error("Request is not pending");

    await ctx.db.patch(args.requestId, {
      status: "fulfilled",
      updatedAt: Date.now(),
    });
  },
});

// Agent: list own requests
export const listMy = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("fulfilled"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    if (args.status) {
      return await ctx.db
        .query("stockRequests")
        .withIndex("by_agentId_and_status", (q) =>
          q.eq("agentId", userId).eq("status", args.status!)
        )
        .take(200);
    }

    const requests = await ctx.db
      .query("stockRequests")
      .withIndex("by_agentId_and_status", (q) => q.eq("agentId", userId))
      .take(200);
    // Sort newest first
    return requests.sort((a, b) => b.createdAt - a.createdAt);
  },
});

async function enrichRequests(
  ctx: QueryCtx,
  requests: Doc<"stockRequests">[]
) {
  const enriched = [];
  for (const req of requests) {
    const agent = await ctx.db.get(req.agentId);
    const product = await ctx.db.get(req.productId);
    let variantName: string | undefined;
    if (req.variantId) {
      const variant = await ctx.db.get(req.variantId);
      variantName = variant?.name;
    }
    enriched.push({
      ...req,
      agentName: agent?.nickname ?? agent?.name ?? agent?.email ?? "Unknown",
      productName: product?.name ?? "Unknown",
      productStatus: product?.status ?? "unknown",
      variantName,
    });
  }
  return enriched.sort((a, b) => b.createdAt - a.createdAt);
}

// Admin: list all pending requests (enriched with agent + product info)
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const requests = await ctx.db
      .query("stockRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .take(200);

    return enrichRequests(ctx, requests);
  },
});

// Admin: list fulfilled requests
export const listFulfilled = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const requests = await ctx.db
      .query("stockRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "fulfilled"))
      .take(200);

    return enrichRequests(ctx, requests);
  },
});

// Admin: list all requests (any status)
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    // Fetch from all statuses
    const pending = await ctx.db
      .query("stockRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .take(200);
    const fulfilled = await ctx.db
      .query("stockRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "fulfilled"))
      .take(200);
    const cancelled = await ctx.db
      .query("stockRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "cancelled"))
      .take(100);

    return enrichRequests(ctx, [...pending, ...fulfilled, ...cancelled]);
  },
});
