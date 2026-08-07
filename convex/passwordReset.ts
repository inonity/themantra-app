import { v } from "convex/values";
import { mutation, action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { modifyAccountCredentials } from "@convex-dev/auth/server";

// Minimum gap between reset emails for one account. Without it, this
// unauthenticated mutation can be called in a loop to flood a user's inbox.
const RESET_REQUEST_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Public mutation: request a password reset link for the given email.
// Always succeeds silently — don't reveal whether the email exists.
export const requestReset = mutation({
  args: {
    email: v.string(),
    // Accepted but ignored. Older deployed clients still send this; the link
    // is always built from SITE_URL server-side. Remove once every client is
    // on a build that no longer sends it.
    siteUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // The reset link is built from a server-side origin, never from a
    // caller-supplied one. A caller-supplied URL would let anyone have this
    // system mail a valid reset token pointing at a domain they control.
    const siteUrl = process.env.SITE_URL;
    if (!siteUrl) {
      throw new Error("Server configuration error: SITE_URL not set");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (!user) return; // Silently ignore unknown emails

    // Throttle: if a still-valid token was issued recently, send nothing.
    // Returns silently so the caller can't tell the difference.
    if (user.passwordResetExpiresAt) {
      const issuedAt = user.passwordResetExpiresAt - RESET_TOKEN_TTL_MS;
      if (Date.now() - issuedAt < RESET_REQUEST_COOLDOWN_MS) return;
    }

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;

    await ctx.db.patch(user._id, {
      passwordResetToken: token,
      passwordResetExpiresAt: expiresAt,
    });

    const resetLink = `${siteUrl}/reset-password?token=${token}`;
    await ctx.scheduler.runAfter(0, internal.emails.sendPasswordResetEmail, {
      email: args.email,
      name: user.name ?? args.email,
      resetLink,
    });
  },
});

// Public query: check if a reset token is valid.
export const checkToken = query({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<"valid" | "expired" | "invalid"> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_passwordResetToken", (q) =>
        q.eq("passwordResetToken", args.token),
      )
      .unique();

    if (!user || !user.passwordResetToken) return "invalid";
    if (
      !user.passwordResetExpiresAt ||
      Date.now() > user.passwordResetExpiresAt
    ) {
      return "expired";
    }
    return "valid";
  },
});

// Internal mutation: atomically validate and consume the token, returning the email.
export const validateAndConsumeToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_passwordResetToken", (q) =>
        q.eq("passwordResetToken", args.token),
      )
      .unique();

    if (!user || !user.passwordResetToken) return null;

    // Always clear the token (whether valid or expired) so it can't be reused
    await ctx.db.patch(user._id, {
      passwordResetToken: undefined,
      passwordResetExpiresAt: undefined,
    });

    if (
      !user.passwordResetExpiresAt ||
      Date.now() > user.passwordResetExpiresAt
    ) {
      return null; // Expired
    }

    return user.email ?? null;
  },
});

// Public action: complete the password reset using a valid token.
export const completeReset = action({
  args: { token: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    const email: string | null = await ctx.runMutation(
      internal.passwordReset.validateAndConsumeToken,
      { token: args.token },
    );

    if (!email) {
      throw new Error("This reset link is invalid or has expired.");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: args.newPassword },
    });
  },
});
