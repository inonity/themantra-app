import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuth, requireRole } from "./helpers/auth";
import type { Doc, Id } from "./_generated/dataModel";

// Fix a sale line item that was attributed to the wrong batch.
// Re-attributes the entire fulfilled quantity from oldBatch -> newBatch:
// - +qty back to the wrong batch's inventory row
// - -qty from the correct batch's inventory row
// - patches stockMovement(s) and the sale's lineItem batchId
// - writes a saleCorrections audit row
//
// Same variant only, same stockModel, same holder.
// Caller must be admin or the seller themselves.
export const correctLineBatch = mutation({
  args: {
    saleId: v.id("sales"),
    lineItemIndex: v.number(),
    newBatchId: v.id("batches"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await requireAuth(ctx);
    const caller = await ctx.db.get(callerId);
    if (!caller) throw new ConvexError("Not authenticated");

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new ConvexError("Sale not found");

    if (caller.role !== "admin" && sale.sellerId !== callerId) {
      throw new ConvexError("Not authorized to correct this sale");
    }

    if (!sale.lineItems || args.lineItemIndex < 0 || args.lineItemIndex >= sale.lineItems.length) {
      throw new ConvexError("Invalid line item");
    }

    const lineItem = sale.lineItems[args.lineItemIndex];
    const fulfilledQty = lineItem.fulfilledQuantity ?? 0;
    if (fulfilledQty <= 0 || !lineItem.batchId) {
      throw new ConvexError("Line item is not fulfilled — nothing to correct");
    }

    const oldBatchId = lineItem.batchId;
    if (oldBatchId === args.newBatchId) {
      throw new ConvexError("New batch is the same as the current batch");
    }

    const oldBatch = await ctx.db.get(oldBatchId);
    if (!oldBatch) throw new ConvexError("Original batch not found");
    const newBatch = await ctx.db.get(args.newBatchId);
    if (!newBatch) throw new ConvexError("New batch not found");

    if (newBatch.status !== "available" && newBatch.status !== "partial") {
      throw new ConvexError(
        `New batch ${newBatch.batchCode} is not available (status: ${newBatch.status})`
      );
    }

    if (newBatch.productId !== lineItem.productId) {
      throw new ConvexError("New batch is not the same product");
    }
    const lineVariantId = lineItem.variantId ?? oldBatch.variantId;
    const newVariantId = newBatch.variantId;
    if (lineVariantId && newVariantId && lineVariantId !== newVariantId) {
      throw new ConvexError("New batch is a different variant");
    }
    // If either side is missing variantId we permit (legacy data) but still require productId match.

    // Determine holder: agent's b2c sale → agent inventory; salesperson sale → HQ business inventory.
    const sellerId = sale.sellerId;
    let seller: Doc<"users"> | null = null;
    if (sellerId) seller = await ctx.db.get(sellerId);

    const holderType: "agent" | "business" =
      seller?.role === "sales" ? "business" : "agent";

    const stockModelForInventory =
      holderType === "agent"
        ? sale.stockModel === "hold_paid" || sale.stockModel === "consignment"
          ? sale.stockModel
          : undefined
        : undefined;

    const qty = fulfilledQty;

    // 1. Add qty back to the wrong (old) batch inventory row
    if (holderType === "agent") {
      if (!sellerId) throw new ConvexError("Sale has no seller");
      const oldInv = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
          q
            .eq("batchId", oldBatchId)
            .eq("heldByType", "agent")
            .eq("heldById", sellerId)
            .eq("stockModel", stockModelForInventory)
        )
        .unique();
      if (oldInv) {
        await ctx.db.patch(oldInv._id, {
          quantity: oldInv.quantity + qty,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("inventory", {
          batchId: oldBatchId,
          productId: oldBatch.productId,
          variantId: oldBatch.variantId,
          heldByType: "agent",
          heldById: sellerId,
          quantity: qty,
          stockModel: stockModelForInventory,
        });
      }
    } else {
      const oldInv = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
          q.eq("batchId", oldBatchId).eq("heldByType", "business")
        )
        .first();
      if (oldInv) {
        await ctx.db.patch(oldInv._id, {
          quantity: oldInv.quantity + qty,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("inventory", {
          batchId: oldBatchId,
          productId: oldBatch.productId,
          variantId: oldBatch.variantId,
          heldByType: "business",
          heldById: undefined,
          quantity: qty,
        });
      }
    }

    // 2. Deduct qty from the correct (new) batch inventory row — must have enough
    if (holderType === "agent") {
      if (!sellerId) throw new ConvexError("Sale has no seller");
      const newInv = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
          q
            .eq("batchId", args.newBatchId)
            .eq("heldByType", "agent")
            .eq("heldById", sellerId)
            .eq("stockModel", stockModelForInventory)
        )
        .unique();
      if (!newInv || newInv.quantity < qty) {
        throw new ConvexError(
          `Not enough stock on batch ${newBatch.batchCode} (have ${newInv?.quantity ?? 0}, need ${qty})`
        );
      }
      const remaining = newInv.quantity - qty;
      if (remaining === 0) {
        await ctx.db.delete(newInv._id);
      } else {
        await ctx.db.patch(newInv._id, {
          quantity: remaining,
          updatedAt: Date.now(),
        });
      }
    } else {
      const newInv = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
          q.eq("batchId", args.newBatchId).eq("heldByType", "business")
        )
        .first();
      if (!newInv || newInv.quantity < qty) {
        throw new ConvexError(
          `Not enough HQ stock on batch ${newBatch.batchCode} (have ${newInv?.quantity ?? 0}, need ${qty})`
        );
      }
      const remaining = newInv.quantity - qty;
      if (remaining === 0) {
        await ctx.db.delete(newInv._id);
      } else {
        await ctx.db.patch(newInv._id, {
          quantity: remaining,
          updatedAt: Date.now(),
        });
      }
    }

    // 3. Patch existing stock movements for this sale line.
    //    Agent sale: 1 movement (the agent->customer one with this saleId + oldBatchId).
    //    Salesperson sale: 2 movements — also a business->agent companion with the
    //    same recordedBy + movedAt + oldBatchId but no saleId.
    const saleMovements = await ctx.db
      .query("stockMovements")
      .withIndex("by_saleId", (q) => q.eq("saleId", args.saleId))
      .collect();

    const targetSaleMovement = saleMovements.find(
      (m) =>
        m.batchId === oldBatchId &&
        m.productId === lineItem.productId &&
        m.fromPartyType === "agent" &&
        m.toPartyType === "customer" &&
        m.quantity === qty
    );

    if (targetSaleMovement) {
      await ctx.db.patch(targetSaleMovement._id, { batchId: args.newBatchId });

      if (holderType === "business") {
        // Find the business->agent companion (no saleId) by matching movedAt + recordedBy
        // on the same oldBatchId/product. Take the first match — for a single fulfill action
        // these are written within the same mutation, so timestamps align.
        const companions = await ctx.db
          .query("stockMovements")
          .withIndex("by_batchId", (q) => q.eq("batchId", oldBatchId))
          .collect();
        const companion = companions.find(
          (m) =>
            m.fromPartyType === "business" &&
            m.toPartyType === "agent" &&
            m.recordedBy === targetSaleMovement.recordedBy &&
            m.movedAt === targetSaleMovement.movedAt &&
            m.productId === lineItem.productId &&
            m.saleId === undefined &&
            m.quantity === qty
        );
        if (companion) {
          await ctx.db.patch(companion._id, { batchId: args.newBatchId });
        }
      }
    }

    // 4. Patch the sale's lineItems batchId
    const updatedLineItems = sale.lineItems.map((li, idx) =>
      idx === args.lineItemIndex ? { ...li, batchId: args.newBatchId } : li
    );
    await ctx.db.patch(args.saleId, { lineItems: updatedLineItems });

    // 5. Audit
    const correctionId = await ctx.db.insert("saleCorrections", {
      saleId: args.saleId,
      lineItemIndex: args.lineItemIndex,
      oldBatchId,
      newBatchId: args.newBatchId,
      quantity: qty,
      productId: lineItem.productId,
      variantId: lineItem.variantId ?? oldBatch.variantId,
      holderType,
      holderId: holderType === "agent" ? sellerId : undefined,
      stockModel: stockModelForInventory,
      reason: args.reason,
      correctedBy: callerId,
      correctedAt: Date.now(),
    });

    return { correctionId };
  },
});

// Candidate batches the seller (or HQ, for salesperson sales) can swap to
// for a given sale line item. Same product/variant only; only batches with
// available stock on the relevant inventory row; current batch excluded.
export const listCandidateBatches = query({
  args: {
    saleId: v.id("sales"),
    lineItemIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const callerId = await requireAuth(ctx);
    const caller = await ctx.db.get(callerId);
    if (!caller) throw new ConvexError("Not authenticated");

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new ConvexError("Sale not found");

    if (caller.role !== "admin" && sale.sellerId !== callerId) {
      throw new ConvexError("Not authorized");
    }
    if (
      !sale.lineItems ||
      args.lineItemIndex < 0 ||
      args.lineItemIndex >= sale.lineItems.length
    ) {
      throw new ConvexError("Invalid line item");
    }
    const lineItem = sale.lineItems[args.lineItemIndex];
    const fulfilledQty = lineItem.fulfilledQuantity ?? 0;
    if (fulfilledQty <= 0 || !lineItem.batchId) return [];

    const seller = sale.sellerId ? await ctx.db.get(sale.sellerId) : null;
    const holderType: "agent" | "business" =
      seller?.role === "sales" ? "business" : "agent";
    const stockModelForInventory =
      holderType === "agent"
        ? sale.stockModel === "hold_paid" || sale.stockModel === "consignment"
          ? sale.stockModel
          : undefined
        : undefined;

    const batches = await ctx.db
      .query("batches")
      .withIndex("by_productId", (q) => q.eq("productId", lineItem.productId))
      .collect();

    const lineVariantId = lineItem.variantId;

    const results: {
      batchId: Id<"batches">;
      batchCode: string;
      manufacturedDate: string;
      status: "upcoming" | "partial" | "available" | "depleted" | "cancelled";
      availableQty: number;
    }[] = [];

    for (const batch of batches) {
      if (batch._id === lineItem.batchId) continue;
      if (batch.status !== "available" && batch.status !== "partial") continue;
      // Same variant
      if (lineVariantId && batch.variantId && batch.variantId !== lineVariantId) {
        continue;
      }

      let availableQty = 0;
      if (holderType === "agent" && sale.sellerId) {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
            q
              .eq("batchId", batch._id)
              .eq("heldByType", "agent")
              .eq("heldById", sale.sellerId!)
              .eq("stockModel", stockModelForInventory)
          )
          .unique();
        availableQty = inv?.quantity ?? 0;
      } else {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
            q.eq("batchId", batch._id).eq("heldByType", "business")
          )
          .first();
        availableQty = inv?.quantity ?? 0;
      }

      if (availableQty <= 0) continue;
      results.push({
        batchId: batch._id,
        batchCode: batch.batchCode,
        manufacturedDate: batch.manufacturedDate,
        status: batch.status,
        availableQty,
      });
    }

    results.sort((a, b) => a.manufacturedDate.localeCompare(b.manufacturedDate));
    return results;
  },
});

// List corrections for a single sale (used on sale detail to show badges).
export const listBySale = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const corrections = await ctx.db
      .query("saleCorrections")
      .withIndex("by_saleId", (q) => q.eq("saleId", args.saleId))
      .collect();

    const batchIds = new Set<Id<"batches">>();
    const userIds = new Set<Id<"users">>();
    for (const c of corrections) {
      batchIds.add(c.oldBatchId);
      batchIds.add(c.newBatchId);
      userIds.add(c.correctedBy);
    }
    const [batches, users] = await Promise.all([
      Promise.all(Array.from(batchIds).map((id) => ctx.db.get(id))),
      Promise.all(Array.from(userIds).map((id) => ctx.db.get(id))),
    ]);
    const batchMap = new Map(
      batches
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map((b) => [b._id, b])
    );
    const userMap = new Map(
      users
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => [u._id, u])
    );

    return corrections.map((c) => ({
      ...c,
      oldBatchCode: batchMap.get(c.oldBatchId)?.batchCode ?? "—",
      newBatchCode: batchMap.get(c.newBatchId)?.batchCode ?? "—",
      correctedByName:
        userMap.get(c.correctedBy)?.nickname ||
        userMap.get(c.correctedBy)?.name ||
        userMap.get(c.correctedBy)?.email ||
        "Unknown",
    }));
  },
});

// Admin: list all corrections with enriched names — for the Corrections tab.
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const corrections = await ctx.db
      .query("saleCorrections")
      .withIndex("by_correctedAt")
      .order("desc")
      .take(300);

    const batchIds = new Set<Id<"batches">>();
    const userIds = new Set<Id<"users">>();
    const productIds = new Set<Id<"products">>();
    for (const c of corrections) {
      batchIds.add(c.oldBatchId);
      batchIds.add(c.newBatchId);
      userIds.add(c.correctedBy);
      if (c.holderId) userIds.add(c.holderId);
      productIds.add(c.productId);
    }
    const [batches, users, products] = await Promise.all([
      Promise.all(Array.from(batchIds).map((id) => ctx.db.get(id))),
      Promise.all(Array.from(userIds).map((id) => ctx.db.get(id))),
      Promise.all(Array.from(productIds).map((id) => ctx.db.get(id))),
    ]);
    const batchMap = new Map(
      batches
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map((b) => [b._id, b])
    );
    const userMap = new Map(
      users
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => [u._id, u])
    );
    const productMap = new Map(
      products
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => [p._id, p])
    );

    const userDisplay = (uid: Id<"users"> | undefined) => {
      if (!uid) return null;
      const u = userMap.get(uid);
      if (!u) return null;
      return u.nickname || u.name || u.email || "Unnamed";
    };

    return corrections.map((c) => ({
      ...c,
      oldBatchCode: batchMap.get(c.oldBatchId)?.batchCode ?? "—",
      newBatchCode: batchMap.get(c.newBatchId)?.batchCode ?? "—",
      productName: productMap.get(c.productId)?.name ?? "Unknown product",
      correctedByName: userDisplay(c.correctedBy) ?? "Unknown",
      holderName: userDisplay(c.holderId),
    }));
  },
});
