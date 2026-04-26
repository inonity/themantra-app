import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole, requireSeller, isSellerRole } from "./helpers/auth";

export const upsert = mutation({
  args: {
    agentId: v.id("users"),
    rateId: v.optional(v.id("rates")),
    defaultStockModel: v.optional(
      v.union(
        v.literal("hold_paid"),
        v.literal("consignment"),
        v.literal("presell"),
        v.literal("dropship") // legacy
      )
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const agent = await ctx.db.get(args.agentId);
    if (!agent || !isSellerRole(agent.role)) throw new Error("Invalid agent");

    // Validate rateId if provided
    if (args.rateId) {
      const rate = await ctx.db.get(args.rateId);
      if (!rate) throw new Error("Rate not found");
    }

    const existing = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();

    if (existing) {
      // Patch (not replace) so seller-managed fields like payment preferences are preserved
      await ctx.db.patch(existing._id, {
        rateId: args.rateId,
        defaultStockModel: args.defaultStockModel,
        notes: args.notes,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("agentProfiles", {
        agentId: args.agentId,
        rateId: args.rateId,
        defaultStockModel: args.defaultStockModel,
        notes: args.notes,
        updatedAt: Date.now(),
      });
    }
  },
});

export const getByAgentId = query({
  args: { agentId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Admin can view any, agent can only view own
    if (user.role !== "admin" && userId !== args.agentId) {
      throw new Error("Not authorized");
    }

    return await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();
  },
});

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const profile = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", userId))
      .unique();
    if (!profile) return null;

    const paymentQrUrl = profile.paymentQrStorageId
      ? await ctx.storage.getUrl(profile.paymentQrStorageId)
      : null;

    return { ...profile, paymentQrUrl };
  },
});

export const updateMyPaymentPreferences = mutation({
  args: {
    paymentCollectorPreference: v.optional(
      v.union(v.literal("agent"), v.literal("hq"))
    ),
    preferredPaymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("qr"),
        v.literal("bank_transfer")
      )
    ),
    paymentQrStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const seller = await requireSeller(ctx);

    // Enforce visibility rules: bank_transfer is only valid when HQ collects
    if (
      args.preferredPaymentMethod === "bank_transfer" &&
      args.paymentCollectorPreference === "agent"
    ) {
      throw new Error(
        "Bank transfer is not available when you collect payment yourself"
      );
    }

    const existing = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", seller._id))
      .unique();

    // If swapping out the QR image, delete the old storage object
    if (
      existing?.paymentQrStorageId &&
      args.paymentQrStorageId !== undefined &&
      args.paymentQrStorageId !== existing.paymentQrStorageId
    ) {
      await ctx.storage.delete(existing.paymentQrStorageId);
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        paymentCollectorPreference: args.paymentCollectorPreference,
        preferredPaymentMethod: args.preferredPaymentMethod,
        paymentQrStorageId:
          args.paymentQrStorageId === undefined
            ? existing.paymentQrStorageId
            : args.paymentQrStorageId,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("agentProfiles", {
      agentId: seller._id,
      paymentCollectorPreference: args.paymentCollectorPreference,
      preferredPaymentMethod: args.preferredPaymentMethod,
      paymentQrStorageId: args.paymentQrStorageId,
      updatedAt: Date.now(),
    });
  },
});

export const removeMyPaymentQr = mutation({
  args: {},
  handler: async (ctx) => {
    const seller = await requireSeller(ctx);
    const profile = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", seller._id))
      .unique();
    if (!profile?.paymentQrStorageId) return;

    await ctx.storage.delete(profile.paymentQrStorageId);
    await ctx.db.patch(profile._id, {
      paymentQrStorageId: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("agentProfiles").take(200);
  },
});
