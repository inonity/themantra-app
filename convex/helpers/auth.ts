import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";

type Role = "admin" | "agent" | "sales";

export function isSellerRole(role: string | undefined): boolean {
  return role === "agent" || role === "sales";
}

export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
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
