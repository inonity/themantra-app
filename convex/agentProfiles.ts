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

    const profile = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();
    if (!profile) return null;

    const paymentQrUrl = profile.paymentQrStorageId
      ? await ctx.storage.getUrl(profile.paymentQrStorageId)
      : null;
    const payoutQrUrl = profile.payoutQrStorageId
      ? await ctx.storage.getUrl(profile.payoutQrStorageId)
      : null;

    return { ...profile, paymentQrUrl, payoutQrUrl };
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
    const payoutQrUrl = profile.payoutQrStorageId
      ? await ctx.storage.getUrl(profile.payoutQrStorageId)
      : null;

    return { ...profile, paymentQrUrl, payoutQrUrl };
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

// Seller: set the details HQ needs to pay out their commission.
// Empty strings are treated as "clear this field".
export const updateMyPayoutDetails = mutation({
  args: {
    payoutMethod: v.optional(
      v.union(v.literal("bank_transfer"), v.literal("qr"))
    ),
    payoutBankName: v.optional(v.string()),
    payoutBankAccountNumber: v.optional(v.string()),
    payoutBankAccountHolder: v.optional(v.string()),
    payoutQrStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const seller = await requireSeller(ctx);

    const clean = (s?: string) => {
      const trimmed = s?.trim();
      return trimmed ? trimmed : undefined;
    };
    const bankName = clean(args.payoutBankName);
    const accountNumber = clean(args.payoutBankAccountNumber);
    const accountHolder = clean(args.payoutBankAccountHolder);

    if (accountNumber && !/^[0-9]{5,20}$/.test(accountNumber)) {
      throw new Error("Account number must be 5–20 digits");
    }
    if (args.payoutMethod === "bank_transfer" && (!bankName || !accountNumber)) {
      throw new Error(
        "Bank name and account number are required for bank transfer payouts"
      );
    }

    const existing = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", seller._id))
      .unique();

    // If swapping out the payout QR image, delete the old storage object
    if (
      existing?.payoutQrStorageId &&
      args.payoutQrStorageId !== undefined &&
      args.payoutQrStorageId !== existing.payoutQrStorageId
    ) {
      await ctx.storage.delete(existing.payoutQrStorageId);
    }

    const fields = {
      payoutMethod: args.payoutMethod,
      payoutBankName: bankName,
      payoutBankAccountNumber: accountNumber,
      payoutBankAccountHolder: accountHolder,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        payoutQrStorageId:
          args.payoutQrStorageId === undefined
            ? existing.payoutQrStorageId
            : args.payoutQrStorageId,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("agentProfiles", {
      agentId: seller._id,
      ...fields,
      payoutQrStorageId: args.payoutQrStorageId,
      updatedAt: Date.now(),
    });
  },
});

export const removeMyPayoutQr = mutation({
  args: {},
  handler: async (ctx) => {
    const seller = await requireSeller(ctx);
    const profile = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", seller._id))
      .unique();
    if (!profile?.payoutQrStorageId) return;

    await ctx.storage.delete(profile.payoutQrStorageId);
    await ctx.db.patch(profile._id, {
      payoutQrStorageId: undefined,
      updatedAt: Date.now(),
    });
  },
});

// Admin: payout details for a seller, used when paying out commission.
// Falls back to the seller's customer-payment QR when no dedicated payout QR is set.
export const getPayoutDetails = query({
  args: { agentId: v.id("users") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const profile = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();

    const payoutQrUrl = profile?.payoutQrStorageId
      ? await ctx.storage.getUrl(profile.payoutQrStorageId)
      : null;
    const fallbackQrUrl =
      !payoutQrUrl && profile?.paymentQrStorageId
        ? await ctx.storage.getUrl(profile.paymentQrStorageId)
        : null;

    return {
      payoutMethod: profile?.payoutMethod,
      bankName: profile?.payoutBankName,
      accountNumber: profile?.payoutBankAccountNumber,
      accountHolder: profile?.payoutBankAccountHolder,
      qrUrl: payoutQrUrl ?? fallbackQrUrl,
      qrIsFallback: !payoutQrUrl && !!fallbackQrUrl,
    };
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("agentProfiles").take(200);
  },
});
