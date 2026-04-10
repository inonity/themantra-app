import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";

type Role = "admin" | "agent" | "sales";

export function isSellerRole(role: string | undefined): boolean {
  return role === "agent" || role === "sales";
}

/**
 * Returns the real authenticated user ID (ignores quick switch).
 * Use this for quick switch management and sensitive operations like password changes.
 */
export async function requireRealAuth(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

/**
 * Returns the effective user ID — the impersonated user if a quick switch
 * session is active, otherwise the real authenticated user.
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">> {
  const realUserId = await requireRealAuth(ctx);

  // Check for active quick switch session
  const session = await ctx.db
    .query("quickSwitchSessions")
    .withIndex("by_realUserId", (q) => q.eq("realUserId", realUserId))
    .first();

  if (session) {
    return session.actingAsUserId;
  }

  return realUserId;
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  role: Role
): Promise<Doc<"users">> {
  const userId = await requireAuth(ctx);
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User not found");
  }
  if (user.role !== role) {
    throw new Error(`Requires role: ${role}`);
  }
  return user;
}

export async function requireSeller(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const userId = await requireAuth(ctx);
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User not found");
  }
  if (!isSellerRole(user.role)) {
    throw new Error("Requires agent or sales role");
  }
  return user;
}
