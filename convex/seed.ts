import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

export const setAdminRole = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    if (!user) throw new Error("User not found after sign-up");
    await ctx.db.patch(user._id, { role: "admin", updatedAt: Date.now() });
    return user._id;
  },
});

export const checkUserExists = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    return user !== null;
  },
});

/**
 * Create an admin user for dev environments.
 * Requires IS_DEV=true environment variable on the Convex deployment.
 *
 * Usage:
 *   npx convex run seed:createAdmin '{"email":"admin@example.com","password":"password123","name":"Admin"}'
 */
export const createAdmin = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ userId: Id<"users">; email: string }> => {
    const isDev = process.env.IS_DEV;
    if (isDev !== "true") {
      throw new Error(
        "createAdmin is only available in dev environments. Set IS_DEV=true in your Convex environment variables."
      );
    }

    // Check if user already exists
    const existing = await ctx.runQuery(internal.seed.checkUserExists, {
      email: args.email,
    });
    if (existing) {
      throw new Error(
        "A user with this email already exists. Use promoteAdmin instead."
      );
    }

    // Sign up through the auth system
    await ctx.runAction(api.auth.signIn, {
      provider: "password",
      params: {
        email: args.email,
        password: args.password,
        name: args.name ?? "Admin",
        flow: "signUp",
      },
    });

    // Set the user's role to admin
    const userId: Id<"users"> = await ctx.runMutation(
      internal.seed.setAdminRole,
      { email: args.email }
    );

    return { userId, email: args.email };
  },
});

/**
 * Promote an existing user to admin.
 * Requires IS_DEV=true environment variable.
 *
 * Usage:
 *   npx convex run seed:promoteAdmin '{"email":"user@example.com"}'
 */
export const promoteAdmin = internalAction({
  args: { email: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ userId: Id<"users">; email: string }> => {
    const isDev = process.env.IS_DEV;
    if (isDev !== "true") {
      throw new Error(
        "promoteAdmin is only available in dev environments. Set IS_DEV=true in your Convex environment variables."
      );
    }

    const userId: Id<"users"> = await ctx.runMutation(
      internal.seed.setAdminRole,
      { email: args.email }
    );

    return { userId, email: args.email };
  },
});
