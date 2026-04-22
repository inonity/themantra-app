import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuth, requireRole, isSellerRole } from "./helpers/auth";
import { resolveAgentPrice } from "./helpers/pricing";
import { addSaleToSettlement } from "./agentSettlements";
import type { Id } from "./_generated/dataModel";

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

export const returnBulkToBusiness = mutation({
  args: {
    agentId: v.id("users"),
    notes: v.optional(v.string()),
    movedAt: v.optional(v.number()),
    items: v.array(
      v.object({
        batchId: v.id("batches"),
        stockModel: v.union(v.literal("consignment"), v.literal("presell")),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");

    if (args.items.length === 0) throw new ConvexError("No items to return");

    const movedAt = args.movedAt ?? Date.now();

    const agent = await ctx.db.get(args.agentId);
    if (!agent || !isSellerRole(agent.role)) throw new ConvexError("Invalid agent");

    for (const item of args.items) {
      if (item.quantity < 1) throw new ConvexError("Quantity must be at least 1");

      const batch = await ctx.db.get(item.batchId);
      if (!batch) throw new ConvexError("Batch not found");

      const agentInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
          q
            .eq("batchId", item.batchId)
            .eq("heldByType", "agent")
            .eq("heldById", args.agentId)
            .eq("stockModel", item.stockModel)
        )
        .unique();

      if (!agentInventory || agentInventory.quantity < item.quantity) {
        throw new ConvexError(
          `Insufficient ${item.stockModel} stock for batch ${batch.batchCode}`
        );
      }

      const newAgentQty = agentInventory.quantity - item.quantity;
      if (newAgentQty === 0) {
        await ctx.db.delete(agentInventory._id);
      } else {
        await ctx.db.patch(agentInventory._id, {
          quantity: newAgentQty,
          updatedAt: Date.now(),
        });
      }

      const businessInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
          q.eq("batchId", item.batchId).eq("heldByType", "business")
        )
        .first();

      if (businessInventory) {
        await ctx.db.patch(businessInventory._id, {
          quantity: businessInventory.quantity + item.quantity,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("inventory", {
          batchId: item.batchId,
          productId: batch.productId,
          variantId: batch.variantId,
          heldByType: "business",
          heldById: undefined,
          quantity: item.quantity,
        });
      }

      await ctx.db.insert("stockMovements", {
        batchId: item.batchId,
        productId: batch.productId,
        variantId: batch.variantId,
        fromPartyType: "agent",
        fromPartyId: args.agentId,
        toPartyType: "business",
        quantity: item.quantity,
        movedAt,
        notes: args.notes,
        recordedBy: user._id,
        stockModel: item.stockModel,
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

// Admin: list all write-off movements (damage/lost/self-use/etc) with enriched info.
// Includes both agent-side losses (recordStockLoss) and HQ-side write-offs (adjustStock).
export const listStockLosses = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const movements = await ctx.db
      .query("stockMovements")
      .withIndex("by_toPartyType", (q) => q.eq("toPartyType", "writeoff"))
      .order("desc")
      .take(300);

    const userIds = new Set<Id<"users">>();
    const productIds = new Set<Id<"products">>();
    const variantIds = new Set<Id<"productVariants">>();
    const batchIds = new Set<Id<"batches">>();

    for (const m of movements) {
      if (m.fromPartyId) userIds.add(m.fromPartyId);
      if (m.attributedToUserId) userIds.add(m.attributedToUserId);
      productIds.add(m.productId);
      if (m.variantId) variantIds.add(m.variantId);
      batchIds.add(m.batchId);
    }

    const [users, products, variants, batches] = await Promise.all([
      Promise.all(Array.from(userIds).map((id) => ctx.db.get(id))),
      Promise.all(Array.from(productIds).map((id) => ctx.db.get(id))),
      Promise.all(Array.from(variantIds).map((id) => ctx.db.get(id))),
      Promise.all(Array.from(batchIds).map((id) => ctx.db.get(id))),
    ]);

    const userMap = new Map(
      users.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u])
    );
    const productMap = new Map(
      products
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => [p._id, p])
    );
    const variantMap = new Map(
      variants
        .filter((v): v is NonNullable<typeof v> => v !== null)
        .map((v) => [v._id, v])
    );
    const batchMap = new Map(
      batches
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map((b) => [b._id, b])
    );

    return movements.map((m) => {
      const attributedUserId = m.fromPartyId ?? m.attributedToUserId;
      const attributedUser = attributedUserId ? userMap.get(attributedUserId) : null;
      const product = productMap.get(m.productId);
      const variant = m.variantId ? variantMap.get(m.variantId) : null;
      const batch = batchMap.get(m.batchId);
      return {
        ...m,
        source: m.fromPartyType, // "agent" = filed by agent/sales; "business" = HQ-side adjustStock
        attributedUserId,
        attributedUserName: attributedUser
          ? attributedUser.nickname ||
            attributedUser.name ||
            attributedUser.email ||
            "Unnamed"
          : null,
        attributedUserRole: attributedUser?.role,
        productName: product?.name ?? "Unknown product",
        variantName: variant?.name,
        batchCode: batch?.batchCode ?? "—",
      };
    });
  },
});

const internalReasonValidator = v.union(
  v.literal("damage"),
  v.literal("self_use"),
  v.literal("lost")
);

const lossStockModelValidator = v.union(
  v.literal("hold_paid"),
  v.literal("consignment"),
  v.literal("presell")
);

// Report stock loss / self-use from an agent's inventory.
// Admin can file for any agent; agents/sales can file for themselves.
// hold_paid stock → inventory just decrements (agent already paid; it's their loss).
// consignment/presell/self_use → creates a b2b "internal" sale at HQ price; lands in settlement.
export const recordStockLoss = mutation({
  args: {
    agentId: v.optional(v.id("users")), // admin supplies this; agents leave undefined
    reason: internalReasonValidator,
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        batchId: v.id("batches"),
        stockModel: lossStockModelValidator,
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const callerId = await requireAuth(ctx);
    const caller = await ctx.db.get(callerId);
    if (!caller) throw new ConvexError("Not authenticated");

    // Resolve the subject agent
    let agentId: Id<"users">;
    if (caller.role === "admin") {
      if (!args.agentId) throw new ConvexError("Admin must specify agentId");
      agentId = args.agentId;
    } else if (isSellerRole(caller.role)) {
      // Agents can only file for themselves
      if (args.agentId && args.agentId !== callerId) {
        throw new ConvexError("Agents can only file losses for themselves");
      }
      agentId = callerId;
    } else {
      throw new ConvexError("Not authorized");
    }

    const agent = await ctx.db.get(agentId);
    if (!agent || !isSellerRole(agent.role)) throw new ConvexError("Invalid agent");

    // Sales staff (HQ employees) never purchase stock from HQ — losses from their
    // hands are always HQ write-offs (no charge), attributed to them.
    const subjectIsSales = agent.role === "sales";

    if (subjectIsSales && args.reason === "self_use") {
      throw new ConvexError("Salespersons cannot file self-use — they do not purchase from HQ");
    }

    if (args.items.length === 0) throw new ConvexError("No items to report");

    const movedAt = Date.now();
    const writeOffCategory =
      args.reason === "damage"
        ? ("damaged" as const)
        : args.reason === "self_use"
          ? ("self_use" as const)
          : ("lost" as const);

    // Validate and pre-resolve pricing for chargeable lines
    type LineDetail = {
      batchId: Id<"batches">;
      productId: Id<"products">;
      variantId: Id<"productVariants"> | undefined;
      stockModel: "hold_paid" | "consignment" | "presell";
      quantity: number;
      hqUnitPrice: number;
      retailPrice: number;
      chargeable: boolean;
    };

    const details: LineDetail[] = [];

    for (const item of args.items) {
      if (item.quantity < 1) throw new ConvexError("Quantity must be at least 1");

      const batch = await ctx.db.get(item.batchId);
      if (!batch) throw new ConvexError("Batch not found");

      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
          q
            .eq("batchId", item.batchId)
            .eq("heldByType", "agent")
            .eq("heldById", agentId)
            .eq("stockModel", item.stockModel)
        )
        .unique();

      if (!inv || inv.quantity < item.quantity) {
        throw new ConvexError(
          `Insufficient ${item.stockModel} stock for batch ${batch.batchCode}`
        );
      }

      // Sales staff never owe HQ. Only agent consignment/presell losses are chargeable.
      const chargeable = !subjectIsSales && item.stockModel !== "hold_paid";

      let hqUnitPrice = 0;
      let retailPrice = 0;
      if (chargeable) {
        const resolved = await resolveAgentPrice(
          ctx,
          agentId,
          batch.productId,
          batch.variantId
        );
        hqUnitPrice = Math.round(resolved.hqUnitPrice * 100) / 100;
        retailPrice = resolved.retailPrice;
      }

      details.push({
        batchId: item.batchId,
        productId: batch.productId,
        variantId: batch.variantId,
        stockModel: item.stockModel,
        quantity: item.quantity,
        hqUnitPrice,
        retailPrice,
        chargeable,
      });
    }

    const chargeable = details.filter((d) => d.chargeable);
    const totalChargeQuantity = chargeable.reduce((s, d) => s + d.quantity, 0);
    const totalChargeAmount =
      Math.round(
        chargeable.reduce((s, d) => s + d.quantity * d.hqUnitPrice, 0) * 100
      ) / 100;

    // Create one b2b internal sale if there's anything chargeable,
    // and push it into the agent's pending agent_to_hq settlement.
    let saleId: Id<"sales"> | undefined;
    if (chargeable.length > 0) {
      saleId = await ctx.db.insert("sales", {
        type: "b2b",
        sellerType: "business",
        buyerType: "agent",
        buyerId: agentId,
        saleChannel: "internal",
        internalReason: args.reason,
        notes: args.notes,
        totalAmount: totalChargeAmount,
        totalQuantity: totalChargeQuantity,
        paymentStatus: "unpaid",
        amountPaid: 0,
        saleDate: movedAt,
        recordedBy: callerId,
        hqPrice: totalChargeAmount,
        hqSettled: false,
        lineItems: chargeable.map((d) => ({
          productId: d.productId,
          variantId: d.variantId,
          quantity: d.quantity,
          unitPrice: d.hqUnitPrice,
          productPrice: d.retailPrice,
          batchId: d.batchId,
          fulfilledQuantity: d.quantity,
          fulfilledAt: movedAt,
          hqUnitPrice: d.hqUnitPrice,
        })),
      });

      await addSaleToSettlement(ctx, agentId, saleId, totalChargeAmount, "agent_to_hq");
    }

    // Decrement inventory + record audit movements for every line
    for (const d of details) {
      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
          q
            .eq("batchId", d.batchId)
            .eq("heldByType", "agent")
            .eq("heldById", agentId)
            .eq("stockModel", d.stockModel)
        )
        .unique();

      if (!inv || inv.quantity < d.quantity) {
        throw new ConvexError("Inventory changed during operation");
      }

      const newQty = inv.quantity - d.quantity;
      if (newQty === 0) {
        await ctx.db.delete(inv._id);
      } else {
        await ctx.db.patch(inv._id, {
          quantity: newQty,
          updatedAt: Date.now(),
        });
      }

      await ctx.db.insert("stockMovements", {
        batchId: d.batchId,
        productId: d.productId,
        variantId: d.variantId,
        fromPartyType: "agent",
        fromPartyId: agentId,
        toPartyType: "writeoff",
        quantity: d.quantity,
        movedAt,
        notes: args.notes,
        recordedBy: callerId,
        stockModel: d.stockModel,
        saleId: d.chargeable ? saleId : undefined,
        salePrice: d.chargeable
          ? Math.round(d.quantity * d.hqUnitPrice * 100) / 100
          : undefined,
        unitPrice: d.chargeable ? d.hqUnitPrice : undefined,
        hqUnitPrice: d.chargeable ? d.hqUnitPrice : undefined,
        writeOffCategory,
      });
    }

    return {
      saleId,
      totalChargeAmount,
      chargeLineCount: chargeable.length,
      freeLineCount: details.length - chargeable.length,
    };
  },
});

const hqWriteOffCategoryValidator = v.union(
  v.literal("damaged"),
  v.literal("expired"),
  v.literal("lost"),
  v.literal("sample"),
  v.literal("other")
);

// Admin: write off HQ-held stock across multiple batches in one go.
// Optional salesperson attribution when a specific person is responsible.
export const recordHQStockLoss = mutation({
  args: {
    category: hqWriteOffCategoryValidator,
    notes: v.optional(v.string()),
    attributedToUserId: v.optional(v.id("users")),
    items: v.array(
      v.object({
        batchId: v.id("batches"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    if (args.items.length === 0) throw new ConvexError("No items to report");

    if (args.attributedToUserId) {
      const attributed = await ctx.db.get(args.attributedToUserId);
      if (!attributed) throw new ConvexError("Attributed user not found");
    }

    const movedAt = Date.now();

    for (const item of args.items) {
      if (item.quantity < 1) throw new ConvexError("Quantity must be at least 1");

      const batch = await ctx.db.get(item.batchId);
      if (!batch) throw new ConvexError("Batch not found");

      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
          q.eq("batchId", item.batchId).eq("heldByType", "business")
        )
        .first();

      if (!inv || inv.quantity < item.quantity) {
        throw new ConvexError(
          `Insufficient HQ stock for batch ${batch.batchCode} (has ${inv?.quantity ?? 0}, need ${item.quantity})`
        );
      }

      const newQty = inv.quantity - item.quantity;
      if (newQty === 0) {
        await ctx.db.delete(inv._id);
      } else {
        await ctx.db.patch(inv._id, {
          quantity: newQty,
          updatedAt: movedAt,
        });
      }

      await ctx.db.patch(item.batchId, {
        totalQuantity: batch.totalQuantity - item.quantity,
        updatedAt: movedAt,
      });

      await ctx.db.insert("stockMovements", {
        batchId: item.batchId,
        productId: batch.productId,
        variantId: batch.variantId,
        fromPartyType: "business",
        toPartyType: "writeoff",
        quantity: item.quantity,
        movedAt,
        notes: args.notes,
        recordedBy: admin._id,
        writeOffCategory: args.category,
        attributedToUserId: args.attributedToUserId,
      });
    }

    return { lineCount: args.items.length };
  },
});
