import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAuth } from "./helpers/auth";

const EMAIL_CONFIRM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

export const listAgents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "agent"))
      .take(100);
  },
});

export const listSalesStaff = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "sales"))
      .take(100);
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.phone !== undefined) updates.phone = args.phone;

    await ctx.db.patch(userId, updates);
    return userId;
  },
});

export const requestEmailChange = mutation({
  args: {
    newEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (args.newEmail === user.email) {
      throw new Error("New email is the same as current email");
    }

    // Check if email is already in use by another user
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.newEmail))
      .first();
    if (existing && existing._id !== userId) {
      throw new Error("Email already in use");
    }

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + EMAIL_CONFIRM_EXPIRY_MS;

    await ctx.db.patch(userId, {
      pendingEmail: args.newEmail,
      pendingEmailToken: token,
      pendingEmailExpiresAt: expiresAt,
      updatedAt: Date.now(),
    });

    // Send confirmation email to the NEW address
    // The confirm link goes through the frontend app
    const appUrl = process.env.SITE_URL;
    if (!appUrl) throw new Error("Server configuration error: SITE_URL not set");
    const confirmLink = `${appUrl}/confirm-email?token=${token}`;
    await ctx.scheduler.runAfter(0, internal.emails.sendEmailConfirmation, {
      email: args.newEmail,
      name: user.name ?? "User",
      confirmLink,
      expiresInMinutes: 30,
    });

    return { pendingEmail: args.newEmail, expiresAt };
  },
});

export const confirmEmailChange = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Find user with this token
    const users = await ctx.db.query("users").take(500);
    const user = users.find((u) => u.pendingEmailToken === args.token);

    if (!user) {
      return { success: false, error: "Invalid or expired confirmation link" };
    }

    if (!user.pendingEmail || !user.pendingEmailExpiresAt) {
      return { success: false, error: "No pending email change" };
    }

    if (Date.now() > user.pendingEmailExpiresAt) {
      // Expired — clean up
      await ctx.db.patch(user._id, {
        pendingEmail: undefined,
        pendingEmailToken: undefined,
        pendingEmailExpiresAt: undefined,
        updatedAt: Date.now(),
      });
      return { success: false, error: "Confirmation link has expired. Please request a new email change." };
    }

    // Check uniqueness again
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", user.pendingEmail!))
      .first();
    if (existing && existing._id !== user._id) {
      await ctx.db.patch(user._id, {
        pendingEmail: undefined,
        pendingEmailToken: undefined,
        pendingEmailExpiresAt: undefined,
        updatedAt: Date.now(),
      });
      return { success: false, error: "Email is already in use by another account" };
    }

    const newEmail = user.pendingEmail;

    // 1. Delete all existing auth sessions for this user so the client
    //    cleanly transitions to unauthenticated state (prevents double-login).
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .take(100);
    for (const session of sessions) {
      // Delete associated refresh tokens first
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .take(100);
      for (const rt of refreshTokens) {
        await ctx.db.delete(rt._id);
      }
      await ctx.db.delete(session._id);
    }

    // 2. Update the authAccounts record (password provider uses email as providerAccountId)
    const authAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", user._id).eq("provider", "password")
      )
      .unique();
    if (authAccount) {
      await ctx.db.patch(authAccount._id, {
        providerAccountId: newEmail,
      });
    }

    // 3. Apply the email change on the user
    await ctx.db.patch(user._id, {
      email: newEmail,
      pendingEmail: undefined,
      pendingEmailToken: undefined,
      pendingEmailExpiresAt: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const cancelPendingEmail = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(userId, {
      pendingEmail: undefined,
      pendingEmailToken: undefined,
      pendingEmailExpiresAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const getSettingsData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    // Get agent profile if seller
    let agentProfile = null;
    if (user.role === "agent" || user.role === "sales") {
      agentProfile = await ctx.db
        .query("agentProfiles")
        .withIndex("by_agentId", (q) => q.eq("agentId", userId))
        .unique();
    }

    // Get agent pricing if seller
    let agentPricing = null;
    if (user.role === "agent" || user.role === "sales") {
      agentPricing = await ctx.db
        .query("agentPricing")
        .withIndex("by_agentId", (q) => q.eq("agentId", userId))
        .take(10);
    }

    // Get pricing defaults (fallback)
    const pricingDefaults = await ctx.db
      .query("pricingDefaults")
      .take(200);

    // Get applicable offers
    const allOffers = await ctx.db
      .query("offers")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .take(100);

    // Filter offers applicable to this user
    const applicableOffers = allOffers.filter((offer) => {
      if (!offer.agentIds || offer.agentIds.length === 0) return true;
      return offer.agentIds.includes(userId);
    });

    // Get offer pricing for applicable offers
    const offerPricingList = [];
    for (const offer of applicableOffers) {
      const pricing = await ctx.db
        .query("offerPricing")
        .withIndex("by_offerId", (q) => q.eq("offerId", offer._id))
        .take(10);
      offerPricingList.push(...pricing);
    }

    return {
      user,
      agentProfile,
      agentPricing,
      pricingDefaults,
      applicableOffers,
      offerPricing: offerPricingList,
    };
  },
});

export const listSellers = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "agent"))
      .take(100);
    const salesStaff = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "sales"))
      .take(100);
    return [...agents, ...salesStaff];
  },
});
