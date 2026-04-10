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

/**
 * Checks whether the caller has an active quick switch session.
 */
async function hasActiveQuickSwitch(
  ctx: QueryCtx | MutationCtx,
  realUserId: Id<"users">
): Promise<boolean> {
  const session = await ctx.db
    .query("quickSwitchSessions")
    .withIndex("by_realUserId", (q) => q.eq("realUserId", realUserId))
    .first();
  return session !== null;
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  role: Role
): Promise<Doc<"users">> {
  const realUserId = await requireRealAuth(ctx);
  const effectiveUserId = await requireAuth(ctx);
  const effectiveUser = await ctx.db.get(effectiveUserId);
  if (!effectiveUser) {
    throw new Error("User not found");
  }

  // During quick switch the real user (admin) is authorized for everything.
  // Skip the role check so queries don't throw during page transitions.
  if (realUserId !== effectiveUserId && await hasActiveQuickSwitch(ctx, realUserId)) {
    return effectiveUser;
  }

  if (effectiveUser.role !== role) {
    throw new Error(`Requires role: ${role}`);
  }
  return effectiveUser;
}

export async function requireSeller(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const realUserId = await requireRealAuth(ctx);
  const effectiveUserId = await requireAuth(ctx);
  const effectiveUser = await ctx.db.get(effectiveUserId);
  if (!effectiveUser) {
    throw new Error("User not found");
  }

  // During quick switch the real user (admin) is authorized for everything.
  if (realUserId !== effectiveUserId && await hasActiveQuickSwitch(ctx, realUserId)) {
    return effectiveUser;
  }

  if (!isSellerRole(effectiveUser.role)) {
    throw new Error("Requires agent or sales role");
  }
  return effectiveUser;
}
