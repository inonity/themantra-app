import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireRealAuth } from "./helpers/auth";

/** Start a quick switch session — admin impersonates another user. */
export const startSession = mutation({
  args: {
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const realUserId = await requireRealAuth(ctx);
    const realUser = await ctx.db.get(realUserId);
    if (!realUser || realUser.role !== "admin") {
      throw new Error("Only admins can use Quick Switch");
    }

    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }
    if (targetUser._id === realUserId) {
      throw new Error("Cannot switch to yourself");
    }

    // Remove any existing session for this admin
    const existing = await ctx.db
      .query("quickSwitchSessions")
      .withIndex("by_realUserId", (q) => q.eq("realUserId", realUserId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Create new session
    await ctx.db.insert("quickSwitchSessions", {
      realUserId,
      actingAsUserId: args.targetUserId,
    });
  },
});

/** End the current quick switch session — return to admin account. */
export const endSession = mutation({
  args: {},
  handler: async (ctx) => {
    const realUserId = await requireRealAuth(ctx);

    const session = await ctx.db
      .query("quickSwitchSessions")
      .withIndex("by_realUserId", (q) => q.eq("realUserId", realUserId))
      .first();
    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

/** Get the current quick switch status for the banner/UI. */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const realUserId = await getAuthUserId(ctx);
    if (!realUserId) return null;

    const realUser = await ctx.db.get(realUserId);
    if (!realUser) return null;

    // Only admins can have quick switch sessions
    if (realUser.role !== "admin") return null;

    const session = await ctx.db
      .query("quickSwitchSessions")
      .withIndex("by_realUserId", (q) => q.eq("realUserId", realUserId))
      .first();

    if (!session) {
      return { isActive: false as const, realUser };
    }

    const actingAsUser = await ctx.db.get(session.actingAsUserId);
    if (!actingAsUser) {
      // Target user was deleted — clean up stale session
      return { isActive: false as const, realUser };
    }

    return {
      isActive: true as const,
      realUser,
      actingAsUser,
    };
  },
});

/** List users that the admin can switch to. */
export const listSwitchableUsers = query({
  args: {},
  handler: async (ctx) => {
    const realUserId = await getAuthUserId(ctx);
    if (!realUserId) return [];

    const realUser = await ctx.db.get(realUserId);
    if (!realUser || realUser.role !== "admin") return [];

    const agents = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "agent"))
      .take(100);
    const salesStaff = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "sales"))
      .take(100);

    return [...salesStaff, ...agents];
  },
});
