import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./helpers/auth";

const batchStatusValidator = v.union(
  v.literal("upcoming"),
  v.literal("partial"),
  v.literal("available"),
  v.literal("depleted"),
  v.literal("cancelled")
);

type BatchStatus = "upcoming" | "partial" | "available" | "depleted" | "cancelled";

// Allowed status transitions (used by updateStatus and update mutations)
// Note: upcoming→partial is handled internally by releaseUnits, not via direct transition
const ALLOWED_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  upcoming: ["available", "cancelled"],
  partial: ["available", "cancelled"],
  available: ["depleted", "cancelled"],
  depleted: ["cancelled"],
  cancelled: [],
};

function validateTransition(from: BatchStatus, to: BatchStatus): string | null {
  if (from === to) return null; // no-op, allow silently
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    const allowed = ALLOWED_TRANSITIONS[from];
    if (allowed.length === 0) {
      return `Cannot change status from "${from}" — it is a terminal state.`;
    }
    return `Cannot change status from "${from}" to "${to}". Allowed: ${allowed.join(", ")}.`;
  }
  return null;
}

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("batches").take(500);
  },
});

export const listByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("batches")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .take(200);
  },
});

export const get = query({
  args: { id: v.id("batches") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getNextBatchNumber = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    const batches = await ctx.db
      .query("batches")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .take(500);

    // Find the highest number used for this product's short code
    const prefix = product.shortCode ?? "";
    if (!prefix) return null;

    let maxNum = 0;
    for (const batch of batches) {
      if (batch.batchCode.startsWith(prefix)) {
        const numPart = parseInt(batch.batchCode.slice(prefix.length));
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }

    return {
      shortCode: prefix,
      nextNumber: maxNum + 1,
      suggestedCode: `${prefix}${String(maxNum + 1).padStart(4, "0")}`,
    };
  },
});

export const checkBatchCodeUnique = query({
  args: { batchCode: v.string(), excludeBatchId: v.optional(v.id("batches")) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("batches")
      .withIndex("by_batchCode", (q) => q.eq("batchCode", args.batchCode))
      .take(1);

    if (existing.length === 0) return true;
    if (args.excludeBatchId && existing[0]._id === args.excludeBatchId) return true;
    return false;
  },
});

export const create = mutation({
  args: {
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    batchCode: v.string(),
    manufacturedDate: v.string(),
    expectedReadyDate: v.optional(v.string()),
    totalQuantity: v.number(),
    status: batchStatusValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    // Only upcoming and available are valid for new batches
    if (args.status !== "upcoming" && args.status !== "available") {
      throw new Error("New batches can only be created as upcoming or available.");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    // Validate variantId belongs to the same product
    if (args.variantId) {
      const variant = await ctx.db.get(args.variantId);
      if (!variant || variant.productId !== args.productId) {
        throw new Error("Variant does not belong to this product");
      }
    }

    // Check batch code uniqueness
    const existing = await ctx.db
      .query("batches")
      .withIndex("by_batchCode", (q) => q.eq("batchCode", args.batchCode))
      .take(1);
    if (existing.length > 0) {
      throw new Error(`Batch code "${args.batchCode}" is already in use`);
    }

    const batchId = await ctx.db.insert("batches", {
      ...args,
      originSource: undefined,
    });

    // Auto-create business inventory for this batch if status is available
    if (args.status === "available") {
      await ctx.db.insert("inventory", {
        batchId,
        productId: args.productId,
        variantId: args.variantId,
        heldByType: "business",
        quantity: args.totalQuantity,
      });
    }

    return batchId;
  },
});

export const update = mutation({
  args: {
    id: v.id("batches"),
    batchCode: v.string(),
    manufacturedDate: v.string(),
    expectedReadyDate: v.optional(v.string()),
    totalQuantity: v.number(),
    status: batchStatusValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const batch = await ctx.db.get(args.id);
    if (!batch) {
      throw new Error("Batch not found");
    }

    // Check batch code uniqueness (excluding self)
    const existing = await ctx.db
      .query("batches")
      .withIndex("by_batchCode", (q) => q.eq("batchCode", args.batchCode))
      .take(1);
    if (existing.length > 0 && existing[0]._id !== args.id) {
      throw new Error(`Batch code "${args.batchCode}" is already in use`);
    }

    // Quantity edit rules:
    // - upcoming: freely editable
    // - partial: editable but must be >= already-released amount
    // - available/depleted/cancelled: locked (use Adjust Stock for available)
    if (batch.status === "partial") {
      const released = batch.releasedQuantity ?? 0;
      if (args.totalQuantity < released) {
        throw new Error(
          `Cannot set quantity below ${released} — that many units have already been released.`
        );
      }
    } else if (
      batch.status !== "upcoming" &&
      args.totalQuantity !== batch.totalQuantity
    ) {
      throw new Error(
        "Cannot edit quantity for an active batch. Use stock adjustment instead."
      );
    }

    // Validate status transition
    const previousStatus = batch.status;
    if (previousStatus !== args.status) {
      const error = validateTransition(previousStatus, args.status);
      if (error) throw new Error(error);

      // Handle cancellation: clean up business inventory
      if (args.status === "cancelled") {
        await handleCancellation(ctx, args.id);
      }
    }

    const { id, ...fields } = args;

    // partial→available: release any remaining units to business inventory
    if (previousStatus === "partial" && args.status === "available") {
      const alreadyReleased = batch.releasedQuantity ?? 0;
      const remaining = args.totalQuantity - alreadyReleased;
      if (remaining > 0) {
        const existingInventory = await ctx.db
          .query("inventory")
          .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
            q.eq("batchId", id).eq("heldByType", "business")
          )
          .take(1);
        if (existingInventory.length > 0) {
          await ctx.db.patch(existingInventory[0]._id, {
            quantity: existingInventory[0].quantity + remaining,
            updatedAt: Date.now(),
          });
        } else {
          await ctx.db.insert("inventory", {
            batchId: id,
            productId: batch.productId,
            variantId: batch.variantId,
            heldByType: "business",
            quantity: remaining,
          });
        }
      }
      await ctx.db.patch(id, { ...fields, releasedQuantity: args.totalQuantity, updatedAt: Date.now() });
      return;
    }

    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });

    // upcoming→available: create full business inventory (only if none exists)
    if (previousStatus === "upcoming" && args.status === "available") {
      const existingInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
          q.eq("batchId", id).eq("heldByType", "business")
        )
        .take(1);

      if (existingInventory.length === 0) {
        await ctx.db.insert("inventory", {
          batchId: id,
          productId: batch.productId,
          variantId: batch.variantId,
          heldByType: "business",
          quantity: args.totalQuantity,
        });
      }
    }
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("batches"),
    status: batchStatusValidator,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const batch = await ctx.db.get(args.id);
    if (!batch) {
      throw new Error("Batch not found");
    }

    const previousStatus = batch.status;
    if (previousStatus === args.status) return; // no-op

    // Validate transition
    const error = validateTransition(previousStatus, args.status);
    if (error) throw new Error(error);

    // Handle cancellation: clean up business inventory
    if (args.status === "cancelled") {
      await handleCancellation(ctx, args.id);
      await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
      return;
    }

    // partial→available: release remaining units to business inventory
    if (previousStatus === "partial" && args.status === "available") {
      const alreadyReleased = batch.releasedQuantity ?? 0;
      const remaining = batch.totalQuantity - alreadyReleased;
      if (remaining > 0) {
        const existingInventory = await ctx.db
          .query("inventory")
          .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
            q.eq("batchId", args.id).eq("heldByType", "business")
          )
          .take(1);
        if (existingInventory.length > 0) {
          await ctx.db.patch(existingInventory[0]._id, {
            quantity: existingInventory[0].quantity + remaining,
            updatedAt: Date.now(),
          });
        } else {
          await ctx.db.insert("inventory", {
            batchId: args.id,
            productId: batch.productId,
            variantId: batch.variantId,
            heldByType: "business",
            quantity: remaining,
          });
        }
      }
      await ctx.db.patch(args.id, {
        status: "available",
        releasedQuantity: batch.totalQuantity,
        updatedAt: Date.now(),
      });
      return;
    }

    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });

    // upcoming→available: create full business inventory
    if (previousStatus === "upcoming" && args.status === "available") {
      const existingInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
          q.eq("batchId", args.id).eq("heldByType", "business")
        )
        .take(1);
      if (existingInventory.length === 0) {
        await ctx.db.insert("inventory", {
          batchId: args.id,
          productId: batch.productId,
          variantId: batch.variantId,
          heldByType: "business",
          quantity: batch.totalQuantity,
        });
      }
    }
  },
});

// Release a specific number of units from an upcoming or partial batch.
// Sets status to "partial" if not all units released, "available" if all released.
export const releaseUnits = mutation({
  args: {
    id: v.id("batches"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    if (args.quantity <= 0) throw new Error("Quantity must be positive.");

    const batch = await ctx.db.get(args.id);
    if (!batch) throw new Error("Batch not found");

    if (batch.status !== "upcoming" && batch.status !== "partial") {
      throw new Error("Can only release units from upcoming or partial batches.");
    }

    const alreadyReleased = batch.releasedQuantity ?? 0;
    const remaining = batch.totalQuantity - alreadyReleased;

    if (args.quantity > remaining) {
      throw new Error(
        `Cannot release ${args.quantity} — only ${remaining} unit${remaining !== 1 ? "s" : ""} remaining.`
      );
    }

    const newReleased = alreadyReleased + args.quantity;
    const newStatus: BatchStatus = newReleased >= batch.totalQuantity ? "available" : "partial";

    // Update or create business inventory
    const existingInventory = await ctx.db
      .query("inventory")
      .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
        q.eq("batchId", args.id).eq("heldByType", "business")
      )
      .take(1);

    if (existingInventory.length > 0) {
      await ctx.db.patch(existingInventory[0]._id, {
        quantity: existingInventory[0].quantity + args.quantity,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("inventory", {
        batchId: args.id,
        productId: batch.productId,
        variantId: batch.variantId,
        heldByType: "business",
        quantity: args.quantity,
      });
    }

    await ctx.db.patch(args.id, {
      releasedQuantity: newReleased,
      status: newStatus,
      updatedAt: Date.now(),
    });
  },
});

export const adjustStock = mutation({
  args: {
    id: v.id("batches"),
    adjustment: v.number(), // positive = add, negative = deduct
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    if (args.adjustment === 0) {
      throw new Error("Adjustment amount cannot be zero.");
    }

    const batch = await ctx.db.get(args.id);
    if (!batch) {
      throw new Error("Batch not found");
    }

    if (batch.status !== "available" && batch.status !== "partial") {
      throw new Error(
        "Stock adjustments can only be made on available or partial batches."
      );
    }

    const newTotal = batch.totalQuantity + args.adjustment;
    if (newTotal < 0) {
      throw new Error(
        `Cannot deduct ${Math.abs(args.adjustment)} — batch only has ${batch.totalQuantity} total.`
      );
    }

    // Update batch totalQuantity
    await ctx.db.patch(args.id, {
      totalQuantity: newTotal,
      updatedAt: Date.now(),
    });

    // Update business inventory to reflect the adjustment
    const businessInventory = await ctx.db
      .query("inventory")
      .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
        q.eq("batchId", args.id).eq("heldByType", "business")
      )
      .take(1);

    if (businessInventory.length > 0) {
      const inv = businessInventory[0];
      const newInvQty = inv.quantity + args.adjustment;
      if (newInvQty < 0) {
        throw new Error(
          `Cannot deduct ${Math.abs(args.adjustment)} — business only holds ${inv.quantity} units.`
        );
      }
      await ctx.db.patch(inv._id, {
        quantity: newInvQty,
        updatedAt: Date.now(),
      });
    } else {
      // No business inventory record — only allow positive adjustments
      if (args.adjustment < 0) {
        throw new Error("No business inventory found for this batch.");
      }
      await ctx.db.insert("inventory", {
        batchId: args.id,
        productId: batch.productId,
        variantId: batch.variantId,
        heldByType: "business",
        quantity: args.adjustment,
      });
    }
  },
});

// Helper: handle cancellation cleanup
import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

async function handleCancellation(ctx: MutationCtx, batchId: Id<"batches">) {
  // Check if any agents hold stock from this batch
  const agentInventory = await ctx.db
    .query("inventory")
    .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
      q.eq("batchId", batchId).eq("heldByType", "agent")
    )
    .take(1);

  if (agentInventory.length > 0) {
    throw new Error(
      "Cannot cancel this batch — agents still hold stock from it. Recall the stock first."
    );
  }

  // Delete all business inventory for this batch
  const businessInventory = await ctx.db
    .query("inventory")
    .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
      q.eq("batchId", batchId).eq("heldByType", "business")
    )
    .take(100);

  for (const inv of businessInventory) {
    await ctx.db.delete(inv._id);
  }
}
