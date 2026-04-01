import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole, requireAuth } from "./helpers/auth";

export const create = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    phone: v.string(),
    role: v.optional(v.union(v.literal("agent"), v.literal("sales"))),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");

    // Check if email already has an existing user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .take(1);
    if (existingUser.length > 0) {
      throw new Error("A user with this email already exists");
    }

    // Check if email already has a pending invite
    const existingInvite = await ctx.db
      .query("agentInvites")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .take(1);
    if (existingInvite.length > 0 && existingInvite[0].status === "pending") {
      throw new Error("A pending invite already exists for this email");
    }

    const inviteToken = crypto.randomUUID();

    const inviteId = await ctx.db.insert("agentInvites", {
      email: args.email,
      name: args.name,
      phone: args.phone,
      role: args.role ?? "agent",
      inviteToken,
      status: "pending",
      createdBy: admin._id,
    });

    return { inviteId, inviteToken };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("agentInvites").order("desc").take(100);
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("agentInvites")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.token))
      .unique();

    if (!invite) return null;

    return {
      email: invite.email,
      name: invite.name,
      status: invite.status,
      role: invite.role ?? "agent",
    };
  },
});

export const completeInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // No auth required — the invite token serves as authorization.
    // Auth state may not have propagated yet after signUp.
    const invite = await ctx.db
      .query("agentInvites")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.token))
      .unique();

    if (!invite) {
      throw new Error("Invalid invite token");
    }
    if (invite.status !== "pending") {
      throw new Error("This invite has already been used");
    }

    // Find the user created by signUp via email
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", invite.email))
      .unique();

    if (!user) {
      throw new Error("User account not found. Please try again.");
    }

    const assignedRole = invite.role ?? "agent";

    // Set the user's role and profile, track who invited them
    await ctx.db.patch(user._id, {
      role: assignedRole,
      name: invite.name,
      phone: invite.phone,
      invitedBy: invite.createdBy,
      updatedAt: Date.now(),
    });

    // Auto-create profile and pricing defaults for sales staff
    if (assignedRole === "sales") {
      await ctx.db.insert("agentProfiles", {
        agentId: user._id,
        defaultStockModel: "dropship",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("agentPricing", {
        agentId: user._id,
        stockModel: "dropship",
        rateType: "percentage",
        rateValue: 1.0, // 100% to HQ = 0 commission
        updatedAt: Date.now(),
      });
    }

    // Mark invite as completed
    await ctx.db.patch(invite._id, { status: "completed", updatedAt: Date.now() });
  },
});

export const revoke = mutation({
  args: { inviteId: v.id("agentInvites") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Invite not found");
    }
    if (invite.status !== "pending") {
      throw new Error("Can only revoke pending invites");
    }

    await ctx.db.delete(args.inviteId);
  },
});
