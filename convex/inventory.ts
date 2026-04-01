import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./helpers/auth";

export const getBreakdown = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("inventory").take(500);
  },
});

export const getForAgent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("inventory")
      .withIndex("by_heldByType_and_heldById", (q) =>
        q.eq("heldByType", "agent").eq("heldById", userId)
      )
      .take(200);
  },
});

export const getBusinessInventory = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("inventory")
      .withIndex("by_heldByType_and_heldById", (q) =>
        q.eq("heldByType", "business")
      )
      .take(200);
  },
});

export const getByBatch = query({
  args: { batchId: v.id("batches") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
        q.eq("batchId", args.batchId)
      )
      .take(100);
  },
});
