import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireSeller } from "./helpers/auth";

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug = "";
  for (let i = 0; i < 8; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
}

export const create = mutation({
  args: {
    title: v.optional(v.string()),
    stockModel: v.union(
      v.literal("hold_paid"),
      v.literal("consignment"),
      v.literal("presell")
    ),
    date: v.string(),
    offerId: v.optional(v.id("offers")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireSeller(ctx);

    // Generate unique slug
    let slug = generateSlug();
    for (let i = 0; i < 10; i++) {
      const existing = await ctx.db
        .query("interestForms")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (!existing) break;
      slug = generateSlug();
    }

    return await ctx.db.insert("interestForms", {
      agentId: user._id,
      slug,
      title: args.title,
      stockModel: args.stockModel,
      date: args.date,
      offerId: args.offerId,
      notes: args.notes,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

export const close = mutation({
  args: { formId: v.id("interestForms") },
  handler: async (ctx, args) => {
    const user = await requireSeller(ctx);
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.agentId !== user._id) throw new Error("Not authorized");
    await ctx.db.patch(args.formId, { status: "closed", updatedAt: Date.now() });
  },
});

export const reopen = mutation({
  args: { formId: v.id("interestForms") },
  handler: async (ctx, args) => {
    const user = await requireSeller(ctx);
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.agentId !== user._id) throw new Error("Not authorized");
    await ctx.db.patch(args.formId, { status: "active", updatedAt: Date.now() });
  },
});

// Agent lists their own forms
export const listMy = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireSeller(ctx);
    return await ctx.db
      .query("interestForms")
      .withIndex("by_agentId_and_createdAt", (q) => q.eq("agentId", user._id))
      .order("desc")
      .take(100);
  },
});

// Public: get form by slug (no auth required)
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("interestForms")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

// Public: get full form page data — form + interests + products
export const getPublicPageData = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const form = await ctx.db
      .query("interestForms")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!form) return null;

    // Get all active interests linked to this form
    const entries = await ctx.db
      .query("interests")
      .withIndex("by_formId_and_createdAt", (q) => q.eq("formId", form._id))
      .order("desc")
      .take(500);

    // Get all unique product IDs across entries
    const productIds = new Set<string>();
    for (const entry of entries) {
      for (const item of entry.items) {
        productIds.add(item.productId);
      }
    }

    // Fetch products
    const products = await Promise.all(
      Array.from(productIds).map((id) => ctx.db.get(id as Id<"products">))
    );
    const productMap: Record<string, { name: string; price?: number }> = {};
    for (const p of products) {
      if (p) productMap[p._id] = { name: p.name, price: p.price };
    }

    // Get offer if set
    const offer = form.offerId ? await ctx.db.get(form.offerId) : null;

    // Active products for the order form
    const activeProducts = await ctx.db
      .query("products")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(100);

    // Compute most-bought products
    const quantityByProduct: Record<string, { name: string; total: number }> = {};
    for (const entry of entries) {
      if (entry.status === "cancelled") continue;
      for (const item of entry.items) {
        const name = productMap[item.productId]?.name ?? "Unknown";
        if (!quantityByProduct[item.productId]) {
          quantityByProduct[item.productId] = { name, total: 0 };
        }
        quantityByProduct[item.productId].total += item.quantity;
      }
    }
    const topProducts = Object.entries(quantityByProduct)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3)
      .map(([productId, { name, total }]) => ({ productId, name, total }));

    const activeEntries = entries.filter((e) => e.status !== "cancelled");

    return {
      form,
      entries: activeEntries,
      productMap,
      activeProducts,
      offer,
      topProducts,
      totalEntries: activeEntries.length,
    };
  },
});
