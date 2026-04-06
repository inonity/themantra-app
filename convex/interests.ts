import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./helpers/auth";

export const record = mutation({
  args: {
    customerDetail: v.object({
      name: v.string(),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
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

// Public: submit interest via a shared form (no auth required)
export const recordViaForm = mutation({
  args: {
    formId: v.id("interestForms"),
    customerDetail: v.object({
      name: v.string(),
      phone: v.string(),
    }),
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.items.length === 0) throw new Error("No items specified");

    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.status !== "active") throw new Error("This form is no longer accepting entries");

    for (const item of args.items) {
      const product = await ctx.db.get(item.productId);
      if (!product) throw new Error("Product not found");
      if (item.quantity < 1) throw new Error("Quantity must be at least 1");
    }

    return await ctx.db.insert("interests", {
      agentId: form.agentId,
      formId: form._id,
      customerDetail: {
        name: args.customerDetail.name,
        phone: args.customerDetail.phone,
      },
      items: args.items,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

// Public: update an interest entry via form — requires phone verification
export const updateViaForm = mutation({
  args: {
    interestId: v.id("interests"),
    phone: v.string(),
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.items.length === 0) throw new Error("No items specified");

    const interest = await ctx.db.get(args.interestId);
    if (!interest) throw new Error("Entry not found");
    if (interest.status !== "active") throw new Error("This entry is no longer editable");

    // Verify phone matches
    if (interest.customerDetail.phone !== args.phone) {
      throw new Error("Phone number does not match. Please enter the number you used when placing the order.");
    }

    // Verify form is still active
    if (interest.formId) {
      const form = await ctx.db.get(interest.formId);
      if (form && form.status !== "active") throw new Error("This form is no longer accepting edits");
    }

    for (const item of args.items) {
      const product = await ctx.db.get(item.productId);
      if (!product) throw new Error("Product not found");
      if (item.quantity < 1) throw new Error("Quantity must be at least 1");
    }

    await ctx.db.patch(args.interestId, {
      items: args.items,
      updatedAt: Date.now(),
    });
  },
});
