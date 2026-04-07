import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireRole, isSellerRole } from "./helpers/auth";
import { resolveAgentPrice } from "./helpers/pricing";

export const transferToAgent = mutation({
  args: {
    batchId: v.id("batches"),
    agentId: v.id("users"),
    quantity: v.number(),
    stockModel: v.union(
      v.literal("hold_paid"),
      v.literal("consignment")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");

    // Validate batch
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new ConvexError("Batch not found");
    if (batch.status !== "available" && batch.status !== "partial") throw new ConvexError(`Batch ${batch.batchCode} is not yet available (status: ${batch.status})`);

    // Validate agent
    const agent = await ctx.db.get(args.agentId);
    if (!agent || !isSellerRole(agent.role)) throw new ConvexError("Invalid agent");

    // Resolve pricing (variant-aware)
    const resolved = await resolveAgentPrice(
      ctx,
      args.agentId,
      batch.productId,
      batch.variantId
    );

    // Find business inventory for this batch
    const businessInventory = await ctx.db
      .query("inventory")
      .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
        q.eq("batchId", args.batchId).eq("heldByType", "business")
      )
      .first();

    if (!businessInventory || businessInventory.quantity < args.quantity) {
      throw new Error("Insufficient business inventory");
    }

    // Decrement business inventory
    const newBusinessQty = businessInventory.quantity - args.quantity;
    if (newBusinessQty === 0) {
      await ctx.db.delete(businessInventory._id);
    } else {
      await ctx.db.patch(businessInventory._id, { quantity: newBusinessQty, updatedAt: Date.now() });
    }

    // Upsert agent inventory (keyed by batch + agent + stockModel)
    const agentInventory = await ctx.db
      .query("inventory")
      .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
        q
          .eq("batchId", args.batchId)
          .eq("heldByType", "agent")
          .eq("heldById", args.agentId)
          .eq("stockModel", args.stockModel)
      )
      .unique();

    if (agentInventory) {
      await ctx.db.patch(agentInventory._id, {
        quantity: agentInventory.quantity + args.quantity,
        stockModel: args.stockModel,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("inventory", {
        batchId: args.batchId,
        productId: batch.productId,
        variantId: batch.variantId,
        heldByType: "agent",
        heldById: args.agentId,
        quantity: args.quantity,
        stockModel: args.stockModel,
      });
    }

    // Record the movement
    await ctx.db.insert("stockMovements", {
      batchId: args.batchId,
      productId: batch.productId,
      variantId: batch.variantId,
      fromPartyType: "business",
      toPartyType: "agent",
      toPartyId: args.agentId,
      quantity: args.quantity,
      movedAt: Date.now(),
      notes: args.notes,
      recordedBy: user._id,
      stockModel: args.stockModel,
      hqUnitPrice: Math.round(resolved.hqUnitPrice * 100) / 100,
    });
  },
});

export const transferBulkToAgent = mutation({
  args: {
    agentId: v.id("users"),
    stockModel: v.union(v.literal("hold_paid"), v.literal("consignment"), v.literal("presell"), v.literal("dropship")),
    notes: v.optional(v.string()),
    movedAt: v.optional(v.number()),
    items: v.array(
      v.object({
        batchId: v.id("batches"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");

    if (args.items.length === 0) throw new ConvexError("No items to transfer");

    const movedAt = args.movedAt ?? Date.now();

    // Validate agent
    const agent = await ctx.db.get(args.agentId);
    if (!agent || !isSellerRole(agent.role)) throw new ConvexError("Invalid agent");

    for (const item of args.items) {
      if (item.quantity < 1) throw new ConvexError("Quantity must be at least 1");

      // Validate batch
      const batch = await ctx.db.get(item.batchId);
      if (!batch) throw new ConvexError("Batch not found");
      if (batch.status !== "available" && batch.status !== "partial") throw new ConvexError(`Batch ${batch.batchCode} is not yet available (status: ${batch.status})`);

      // Resolve pricing (variant-aware)
      const resolved = await resolveAgentPrice(
        ctx,
        args.agentId,
        batch.productId,
        batch.variantId
      );

      // Find business inventory
      const businessInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
          q.eq("batchId", item.batchId).eq("heldByType", "business")
        )
        .first();

      if (!businessInventory || businessInventory.quantity < item.quantity) {
        throw new ConvexError(`Insufficient stock for batch ${batch.batchCode}`);
      }

      // Decrement business inventory
      const newBusinessQty = businessInventory.quantity - item.quantity;
      if (newBusinessQty === 0) {
        await ctx.db.delete(businessInventory._id);
      } else {
        await ctx.db.patch(businessInventory._id, { quantity: newBusinessQty, updatedAt: Date.now() });
      }

      // Upsert agent inventory
      const agentInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
          q
            .eq("batchId", item.batchId)
            .eq("heldByType", "agent")
            .eq("heldById", args.agentId)
            .eq("stockModel", args.stockModel)
        )
        .unique();

      if (agentInventory) {
        await ctx.db.patch(agentInventory._id, {
          quantity: agentInventory.quantity + item.quantity,
          stockModel: args.stockModel,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("inventory", {
          batchId: item.batchId,
          productId: batch.productId,
          variantId: batch.variantId,
          heldByType: "agent",
          heldById: args.agentId,
          quantity: item.quantity,
          stockModel: args.stockModel,
        });
      }

      // Record the movement
      await ctx.db.insert("stockMovements", {
        batchId: item.batchId,
        productId: batch.productId,
        variantId: batch.variantId,
        fromPartyType: "business",
        toPartyType: "agent",
        toPartyId: args.agentId,
        quantity: item.quantity,
        movedAt,
        notes: args.notes,
        recordedBy: user._id,
        stockModel: args.stockModel,
        hqUnitPrice: Math.round(resolved.hqUnitPrice * 100) / 100,
      });
    }
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("stockMovements").order("desc").take(200);
  },
});
