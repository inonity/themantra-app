import { v } from "convex/values";
import { mutation, action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { modifyAccountCredentials } from "@convex-dev/auth/server";

// Public mutation: request a password reset link for the given email.
// Always succeeds silently — don't reveal whether the email exists.
export const requestReset = mutation({
  args: { email: v.string(), siteUrl: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (!user) return; // Silently ignore unknown emails

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    await ctx.db.patch(user._id, {
      passwordResetToken: token,
      passwordResetExpiresAt: expiresAt,
    });

    const resetLink = `${args.siteUrl}/reset-password?token=${token}`;
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
