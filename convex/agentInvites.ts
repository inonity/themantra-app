import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireRole } from "./helpers/auth";

export const create = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    phone: v.string(),
    role: v.optional(v.union(v.literal("agent"), v.literal("sales"))),
    siteUrl: v.string(),
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
    const assignedRole = args.role ?? "agent";

    const inviteId = await ctx.db.insert("agentInvites", {
      email: args.email,
      name: args.name,
      phone: args.phone,
      role: assignedRole,
      inviteToken,
      status: "pending",
      emailStatus: "pending",
      createdBy: admin._id,
    });

    // Schedule sending the invite email (action handles status tracking)
    const inviteLink = `${args.siteUrl}/join?token=${inviteToken}`;
    await ctx.scheduler.runAfter(0, internal.emails.sendInviteEmail, {
      email: args.email,
      name: args.name,
      role: assignedRole,
      inviteLink,
      inviteId,
    });

    return { inviteId, inviteToken };
  },
});

export const markEmailSent = internalMutation({
  args: { inviteId: v.id("agentInvites") },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) return;
    // Only update if still pending (not already failed)
    if (invite.emailStatus === "pending") {
      await ctx.db.patch(args.inviteId, {
        emailStatus: "sent",
        emailSentAt: Date.now(),
      });
    }
  },
});

export const markEmailFailed = internalMutation({
  args: {
    inviteId: v.id("agentInvites"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) return;
    await ctx.db.patch(args.inviteId, {
      emailStatus: "failed",
      emailError: args.error,
    });
  },
});

export const resendInviteEmail = mutation({
  args: {
    inviteId: v.id("agentInvites"),
    siteUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.status !== "pending") {
      throw new Error("Can only resend emails for pending invites");
    }

    // Reset email status
    await ctx.db.patch(args.inviteId, {
      emailStatus: "pending",
      emailError: undefined,
    });

    const inviteLink = `${args.siteUrl}/join?token=${invite.inviteToken}`;
    await ctx.scheduler.runAfter(0, internal.emails.sendInviteEmail, {
      email: invite.email,
      name: invite.name,
      role: invite.role ?? "agent",
      inviteLink,
      inviteId: args.inviteId,
    });
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

    // Auto-create profile for sales staff
    if (assignedRole === "sales") {
      await ctx.db.insert("agentProfiles", {
        agentId: user._id,
        defaultStockModel: "dropship",
        updatedAt: Date.now(),
      });
    }

    // Mark invite as completed
    await ctx.db.patch(invite._id, { status: "completed", updatedAt: Date.now() });

    // Send welcome email
    await ctx.scheduler.runAfter(0, internal.emails.sendWelcomeEmail, {
      email: invite.email,
      name: invite.name,
      role: assignedRole,
    });
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
