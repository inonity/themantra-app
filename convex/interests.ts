import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./helpers/auth";

export const record = mutation({
  args: {
    customerDetail: v.object({
      name: v.string(),
      phone: v.string(),
      email: v.string(),
    }),
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    if (args.items.length === 0) throw new Error("No items specified");

    // Validate products exist and are active
    for (const item of args.items) {
      const product = await ctx.db.get(item.productId);
      if (!product) throw new Error("Product not found");
      if (product.status !== "active" && product.status !== "future_release") {
        throw new Error(`Product "${product.name}" is not available for interest`);
      }
      if (item.quantity < 1) throw new Error("Quantity must be at least 1");
    }

    return await ctx.db.insert("interests", {
      agentId: userId,
      customerDetail: args.customerDetail,
      items: args.items,
      notes: args.notes,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

export const cancel = mutation({
  args: {
    interestId: v.id("interests"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const interest = await ctx.db.get(args.interestId);
    if (!interest) throw new Error("Interest not found");
    if (interest.agentId !== userId) throw new Error("Not authorized");
    if (interest.status !== "active") throw new Error("Interest is not active");

    await ctx.db.patch(args.interestId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
  },
});

export const markConverted = mutation({
  args: {
    interestId: v.id("interests"),
    saleId: v.id("sales"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const interest = await ctx.db.get(args.interestId);
    if (!interest) throw new Error("Interest not found");
    if (interest.agentId !== userId) throw new Error("Not authorized");
    if (interest.status !== "active") throw new Error("Interest is not active");

    await ctx.db.patch(args.interestId, {
      status: "converted",
      convertedSaleId: args.saleId,
      updatedAt: Date.now(),
    });
  },
});

// Agent: list own interests
export const listMy = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("converted"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    if (args.status) {
      return await ctx.db
        .query("interests")
        .withIndex("by_agentId_and_status", (q) =>
          q.eq("agentId", userId).eq("status", args.status!)
        )
        .take(200);
    }

    return await ctx.db
      .query("interests")
      .withIndex("by_agentId_and_createdAt", (q) => q.eq("agentId", userId))
      .order("desc")
      .take(200);
  },
});

// Admin: list all active interests (demand signals)
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db
      .query("interests")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(200);
  },
});

// Get single interest by ID
export const get = query({
  args: {
    interestId: v.id("interests"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.interestId);
  },
});
