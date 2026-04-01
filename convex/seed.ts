import { internalAction, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

// ONE-TIME USE: Create the first admin user.
// Run from Convex dashboard > Functions > seed:createAdmin
// Delete this file after use.
export const createAdmin = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Use convex-auth's signIn action to create the account
    await ctx.runAction(api.auth.signIn, {
      provider: "password",
      params: { email: args.email, password: args.password, flow: "signUp", name: args.name },
    });

    // Find the newly created user and promote to admin
    await ctx.runMutation(internal.seed.promoteToAdmin, { email: args.email });
  },
});

export const promoteToAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();
    if (!user) throw new Error(`User not found: ${args.email}`);
    await ctx.db.patch(user._id, { role: "admin" });
  },
});
