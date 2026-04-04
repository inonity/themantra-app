import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Scrypt } from "lucia";

// Internal — called by resetPassword action below
export const _updateAccountSecret = internalMutation({
  args: {
    email: v.string(),
    hashedPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", args.email)
      )
      .unique();

    if (!account) {
      throw new Error(`No password account found for email: ${args.email}`);
    }

    await ctx.db.patch(account._id, { secret: args.hashedPassword });
    return { success: true };
  },
});

// Run from Convex dashboard: Functions → adminResetPassword → resetPassword
// Args: { "email": "user@example.com", "newPassword": "newpassword123" }
export const resetPassword = internalAction({
  args: {
    email: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const hashedPassword = await new Scrypt().hash(args.newPassword);
    await ctx.runMutation(internal.adminResetPassword._updateAccountSecret, {
      email: args.email,
      hashedPassword,
    });
    return { success: true, message: `Password reset for ${args.email}` };
  },
});
