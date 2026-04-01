import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getAuthUserId,
  retrieveAccount,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";

export const getUserEmail = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return { email: user.email, name: user.name };
  },
});

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    if (args.newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }

    // Look up the user to get their email (used as account ID for password provider)
    const user: { email?: string; name?: string } | null = await ctx.runQuery(
      internal.passwordChange.getUserEmail,
      { userId }
    );

    if (!user || !user.email) {
      throw new Error("User email not found");
    }

    // Verify current password using the built-in retrieveAccount helper
    // This throws if the secret doesn't match
    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: {
          id: user.email,
          secret: args.currentPassword,
        },
      });
    } catch {
      throw new Error("Current password is incorrect");
    }

    // Update to the new password using the built-in helper
    // This handles hashing internally
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: {
        id: user.email,
        secret: args.newPassword,
      },
    });

    // Send password changed notification email
    await ctx.runAction(internal.emails.sendPasswordChangedEmail, {
      email: user.email,
      name: user.name ?? "User",
    });
  },
});
