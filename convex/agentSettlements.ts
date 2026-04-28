import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth, requireRole, isSellerRole } from "./helpers/auth";

// Helper: mark all linked sales as settled. For internal b2b sales
// (loss charges, self-use) the settlement payment IS the sale payment,
// so paymentStatus is also flipped to "paid". Regular b2c sales track
// customer→agent payment separately and aren't touched here.
async function markLinkedSalesSettled(
  ctx: MutationCtx,
  settlement: Doc<"agentSettlements">
) {
  for (const saleId of settlement.saleIds) {
    const sale = await ctx.db.get(saleId);
    if (!sale) continue;
    const isInternal = sale.saleChannel === "internal";
    await ctx.db.patch(saleId, {
      hqSettled: true,
      settlementId: settlement._id,
      ...(isInternal
        ? {
            paymentStatus: "paid" as const,
            amountPaid: sale.totalAmount,
          }
        : {}),
    });
  }
}

// Helper: find or create the current pending settlement for an agent,
// then add a sale to it. Called internally from sales mutations.
export async function addSaleToSettlement(
  ctx: MutationCtx,
  agentId: Id<"users">,
  saleId: Id<"sales">,
  amount: number,
  direction: "agent_to_hq" | "hq_to_agent" = "agent_to_hq"
) {
  // Look for an existing pending settlement for this agent with same direction
  const allPending = await ctx.db
    .query("agentSettlements")
    .withIndex("by_agentId_and_paymentStatus", (q) =>
      q.eq("agentId", agentId).eq("paymentStatus", "pending")
    )
    .collect();

  // Find one matching the direction (treat undefined as "agent_to_hq" for legacy data)
  const existing = allPending.find(
    (s) => (s.direction ?? "agent_to_hq") === direction
  ) ?? null;

  if (existing) {
    // Add sale to existing pending settlement (idempotent on saleIds — safe to call again
    // for overpayment adjustments after the original sale was already settled-in).
    const saleIds = existing.saleIds.includes(saleId)
      ? existing.saleIds
      : [...existing.saleIds, saleId];
    await ctx.db.patch(existing._id, {
      saleIds,
      totalAmount: Math.round((existing.totalAmount + amount) * 100) / 100,
    });
    // Link settlement to sale
    await ctx.db.patch(saleId, { settlementId: existing._id });
    return existing._id;
  }

  // Create a new pending settlement with reference ID
  const now = new Date();
  const dateStr =
    String(now.getFullYear()).slice(-2) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  // Count all settlements globally for a unique sequence number
  const allSettlements = await ctx.db
    .query("agentSettlements")
    .order("desc")
    .take(1000);

  const seq = String(allSettlements.length + 1).padStart(3, "0");
  const referenceId = `TM-${dateStr}-${seq}`;

  const settlementId = await ctx.db.insert("agentSettlements", {
    agentId,
    referenceId,
    saleIds: [saleId],
    totalAmount: Math.round(amount * 100) / 100,
    direction,
    paymentStatus: "pending",
    amountPaid: 0,
    createdAt: Date.now(),
  });

  // Link settlement to sale
  await ctx.db.patch(saleId, { settlementId });

  return settlementId;
}

// Agent: submit payment record (they've made a bank transfer)
export const submitPayment = mutation({
  args: {
    settlementId: v.id("agentSettlements"),
    paymentDate: v.number(), // timestamp of when agent transferred
    agentNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Settlement not found");
    if (settlement.agentId !== userId) throw new Error("Not authorized");
    if (settlement.paymentStatus !== "pending") {
      throw new Error("Settlement is not pending");
    }

    await ctx.db.patch(args.settlementId, {
      paymentStatus: "submitted",
      paymentDate: args.paymentDate,
      submittedAt: Date.now(),
      agentNotes: args.agentNotes,
    });
  },
});

// Admin: confirm agent payment
export const confirmPayment = mutation({
  args: {
    settlementId: v.id("agentSettlements"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Settlement not found");
    if (settlement.paymentStatus !== "submitted") {
      throw new Error("Settlement has not been submitted by agent");
    }

    await ctx.db.patch(args.settlementId, {
      paymentStatus: "paid",
      amountPaid: settlement.totalAmount,
      paymentMethod: "bank_transfer",
      paidAt: Date.now(),
      confirmedAt: Date.now(),
      notes: args.notes,
    });

    await markLinkedSalesSettled(ctx, settlement);
  },
});

// Admin: mark commission as paid to agent (for hq_to_agent settlements)
export const markCommissionPaid = mutation({
  args: {
    settlementId: v.id("agentSettlements"),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("online"),
      v.literal("other")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Settlement not found");
    if ((settlement.direction ?? "agent_to_hq") !== "hq_to_agent") {
      throw new Error("This settlement is not an HQ-to-agent commission");
    }
    if (settlement.paymentStatus === "paid") {
      throw new Error("Commission already paid");
    }

    await ctx.db.patch(args.settlementId, {
      paymentStatus: "paid",
      amountPaid: settlement.totalAmount,
      paymentMethod: args.paymentMethod,
      paidAt: Date.now(),
      confirmedAt: Date.now(),
      notes: args.notes,
    });
  },
});

// Admin: list pending commissions (hq_to_agent settlements that need paying out)
export const listPendingCommissions = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const agents = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "agent"))
      .take(200);
    const salesStaff = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "sales"))
      .take(200);
    const allSellers = [...agents, ...salesStaff];

    const pending: (Doc<"agentSettlements"> & { agentName: string })[] = [];

    for (const agent of allSellers) {
      const settlements = await ctx.db
        .query("agentSettlements")
        .withIndex("by_agentId_and_paymentStatus", (q) =>
          q.eq("agentId", agent._id).eq("paymentStatus", "pending")
        )
        .collect();

      for (const s of settlements) {
        if (s.direction === "hq_to_agent") {
          pending.push({
            ...s,
            agentName: agent.nickname ?? agent.name ?? agent.email ?? "Agent",
          });
        }
      }
    }

    return pending.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Keep generate for admin manual use (e.g. for existing unsettled sales without settlements)
export const generate = mutation({
  args: {
    agentId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const agent = await ctx.db.get(args.agentId);
    if (!agent || !isSellerRole(agent.role)) throw new Error("Invalid agent");

    // Find all unsettled B2C sales by this agent that don't already have a settlement
    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_sellerId_and_saleDate", (q) => q.eq("sellerId", args.agentId))
      .order("desc")
      .take(500);

    const unsettledSales = allSales.filter(
      (s) =>
        s.type === "b2c" &&
        s.hqSettled !== true &&
        s.hqPrice !== undefined &&
        s.hqPrice > 0 &&
        !s.settlementId
    );

    if (unsettledSales.length === 0) {
      throw new Error("No unsettled sales found for this agent");
    }

    const totalAmount =
      Math.round(
        unsettledSales.reduce((sum, s) => sum + (s.hqPrice ?? 0), 0) * 100
      ) / 100;

    const now = new Date();
    const dateStr =
      String(now.getFullYear()).slice(-2) +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");

    // Count all settlements globally for a unique sequence number
    const allSettlements = await ctx.db
      .query("agentSettlements")
      .order("desc")
      .take(1000);

    const seq = String(allSettlements.length + 1).padStart(3, "0");
    const referenceId = `TM-${dateStr}-${seq}`;

    const settlementId = await ctx.db.insert("agentSettlements", {
      agentId: args.agentId,
      referenceId,
      saleIds: unsettledSales.map((s) => s._id),
      totalAmount,
      direction: "agent_to_hq",
      paymentStatus: "pending",
      amountPaid: 0,
      createdAt: Date.now(),
    });

    // Link all sales to this settlement
    for (const sale of unsettledSales) {
      await ctx.db.patch(sale._id, { settlementId });
    }

    return { settlementId, referenceId, totalAmount };
  },
});

// Keep markPaid for backward compat / admin override
export const markPaid = mutation({
  args: {
    settlementId: v.id("agentSettlements"),
    amountPaid: v.number(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("online"),
      v.literal("other")
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Settlement not found");

    const newAmountPaid = settlement.amountPaid + args.amountPaid;
    const paymentStatus =
      newAmountPaid >= settlement.totalAmount
        ? ("paid" as const)
        : ("submitted" as const);

    await ctx.db.patch(args.settlementId, {
      amountPaid: Math.round(newAmountPaid * 100) / 100,
      paymentStatus,
      paymentMethod: args.paymentMethod,
      paidAt: paymentStatus === "paid" ? Date.now() : undefined,
      confirmedAt: paymentStatus === "paid" ? Date.now() : undefined,
    });

    // When fully paid, mark all linked sales as settled
    if (paymentStatus === "paid") {
      await markLinkedSalesSettled(ctx, settlement);
    }
  },
});

// Agent: get active pending settlements (both directions)
export const getActiveSettlement = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const allPending = await ctx.db
      .query("agentSettlements")
      .withIndex("by_agentId_and_paymentStatus", (q) =>
        q.eq("agentId", userId).eq("paymentStatus", "pending")
      )
      .collect();

    // Split by direction (treat undefined as "agent_to_hq" for legacy data)
    const agentToHq = allPending.find(
      (s) => (s.direction ?? "agent_to_hq") === "agent_to_hq"
    ) ?? null;
    // Return the agent_to_hq one for backward compat (legacy callers expect single object)
    return agentToHq;
  },
});

// Agent: get active pending settlement where HQ owes agent commission
export const getActiveCommission = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const allPending = await ctx.db
      .query("agentSettlements")
      .withIndex("by_agentId_and_paymentStatus", (q) =>
        q.eq("agentId", userId).eq("paymentStatus", "pending")
      )
      .collect();

    return allPending.find((s) => s.direction === "hq_to_agent") ?? null;
  },
});

export const getUnsettledTotal = query({
  args: { agentId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (user.role !== "admin" && userId !== args.agentId) {
      throw new Error("Not authorized");
    }

    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_sellerId_and_saleDate", (q) => q.eq("sellerId", args.agentId))
      .order("desc")
      .take(500);

    const unsettledSales = allSales.filter(
      (s) => s.type === "b2c" && s.hqSettled !== true && s.hqPrice !== undefined && s.hqPrice > 0
    );

    const total =
      Math.round(
        unsettledSales.reduce((sum, s) => sum + (s.hqPrice ?? 0), 0) * 100
      ) / 100;

    return { total, salesCount: unsettledSales.length, sales: unsettledSales };
  },
});

export const listByAgent = query({
  args: { agentId: v.id("users") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    return await ctx.db
      .query("agentSettlements")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(100);
  },
});

export const listMy = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("agentSettlements")
      .withIndex("by_agentId", (q) => q.eq("agentId", userId))
      .order("desc")
      .take(100);
  },
});

// Admin: one-shot repair — flip paymentStatus on internal b2b sales
// linked to already-paid settlements. Safe to call repeatedly.
export const repairPaidInternalSales = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const paidSettlements = await ctx.db
      .query("agentSettlements")
      .filter((q) => q.eq(q.field("paymentStatus"), "paid"))
      .collect();

    let fixed = 0;
    for (const s of paidSettlements) {
      for (const saleId of s.saleIds) {
        const sale = await ctx.db.get(saleId);
        if (!sale) continue;
        if (sale.saleChannel !== "internal") continue;
        if (sale.paymentStatus === "paid") continue;
        await ctx.db.patch(saleId, {
          paymentStatus: "paid",
          amountPaid: sale.totalAmount,
          hqSettled: true,
        });
        fixed += 1;
      }
    }
    return { fixed };
  },
});

// Admin: list all submitted settlements awaiting confirmation
export const listSubmitted = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    // Get all agents and sales staff
    const agents = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "agent"))
      .take(200);
    const salesStaff = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "sales"))
      .take(200);
    const allSellers = [...agents, ...salesStaff];

    const submitted = [];
    for (const agent of allSellers) {
      const settlement = await ctx.db
        .query("agentSettlements")
        .withIndex("by_agentId_and_paymentStatus", (q) =>
          q.eq("agentId", agent._id).eq("paymentStatus", "submitted")
        )
        .take(10);

      for (const s of settlement) {
        submitted.push({ ...s, agentName: agent.nickname ?? agent.name ?? agent.email ?? "Agent" });
      }
    }

    return submitted.sort((a, b) => (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt));
  },
});

// Admin: list all settlements across all agents with agent names
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const agents = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "agent"))
      .take(200);
    const salesStaff = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "sales"))
      .take(200);
    const allSellers = [...agents, ...salesStaff];

    const results: (Doc<"agentSettlements"> & { agentName: string })[] = [];

    for (const agent of allSellers) {
      const settlements = await ctx.db
        .query("agentSettlements")
        .withIndex("by_agentId", (q) => q.eq("agentId", agent._id))
        .order("desc")
        .take(200);

      const agentName = agent.nickname ?? agent.name ?? agent.email ?? "Agent";
      for (const s of settlements) {
        results.push({ ...s, agentName });
      }
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getWithSales = query({
  args: { settlementId: v.id("agentSettlements") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Settlement not found");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (user.role !== "admin" && userId !== settlement.agentId) {
      throw new Error("Not authorized");
    }

    const sales = [];
    for (const saleId of settlement.saleIds) {
      const sale = await ctx.db.get(saleId);
      if (sale) {
        // Resolve product names and variant sizes from lineItems
        const lineItemsWithProducts = [];
        if (sale.lineItems) {
          for (const item of sale.lineItems) {
            let productName = item.productName;
            let retailPrice = item.productPrice;
            if (!productName) {
              const product = await ctx.db.get(item.productId);
              productName = product?.name ?? "Unknown Product";
              retailPrice = retailPrice ?? product?.price ?? 0;
            }
            let variantSizeMl: number | undefined;
            if (item.variantId) {
              const variant = await ctx.db.get(item.variantId);
              variantSizeMl = variant?.sizeMl ?? undefined;
            }
            lineItemsWithProducts.push({
              ...item,
              productName,
              retailPrice: retailPrice ?? 0,
              variantSizeMl,
            });
          }
        }

        // Use offerSnapshot if available, fall back to live offer for old sales
        let offerName: string | undefined;
        let offerBundlePrice: number | undefined;
        let offerMinQuantity: number | undefined;
        let offerHqBundlePrice: number | undefined;
        let offerSizeMl: number | undefined;
        if (sale.offerSnapshot) {
          offerName = sale.offerSnapshot.name;
          offerBundlePrice = sale.offerSnapshot.bundlePrice;
          offerMinQuantity = sale.offerSnapshot.minQuantity;
          offerHqBundlePrice = sale.offerSnapshot.hqBundlePrice;
        }
        // Always fetch live offer for sizeMl (not in snapshot)
        if (sale.offerId) {
          const offer = await ctx.db.get(sale.offerId);
          if (offer) {
            if (!offerName) {
              offerName = offer.name;
              offerBundlePrice = offer.bundlePrice;
              offerMinQuantity = offer.minQuantity;
            }
            offerSizeMl = offer.sizeMl;
          }
        }

        // Build per-variant hqUnitPrice map: keyed by variantId ?? productId
        // This handles multiple variants of the same product with different HQ prices
        let hqUnitPriceMap: Record<string, number> | undefined;
        if (sale.lineItems) {
          hqUnitPriceMap = {};

          // First try lineItem snapshots (available on newer sales)
          for (const item of sale.lineItems) {
            if (item.hqUnitPrice !== undefined) {
              const key = item.variantId ?? item.productId;
              hqUnitPriceMap[key] = item.hqUnitPrice;
            }
          }

          // Fall back to stockMovements for older sales without hqUnitPrice on lineItems
          if (Object.keys(hqUnitPriceMap).length === 0) {
            const movements = await ctx.db
              .query("stockMovements")
              .withIndex("by_saleId", (q) => q.eq("saleId", saleId))
              .take(50);

            for (const m of movements) {
              if (m.hqUnitPrice !== undefined) {
                const key = m.variantId ?? m.productId;
                hqUnitPriceMap[key] = m.hqUnitPrice;
              }
            }
          }
        }

        // Compute correct HQ price and commission from current rate/offer data
        let computedHqPrice: number | undefined;
        let computedCommission: number | undefined;
        if (lineItemsWithProducts.length > 0 && hqUnitPriceMap && Object.keys(hqUnitPriceMap).length > 0) {
          if (offerName && offerMinQuantity != null && offerBundlePrice != null) {
            // Offer sale: split eligible (matches sizeMl) vs ineligible
            type UnitRef = { variantId?: string; productId: string };
            const eligibleUnits: UnitRef[] = [];
            const nonEligibleUnits: UnitRef[] = [];
            for (const item of lineItemsWithProducts) {
              const isEligible = offerSizeMl == null || item.variantSizeMl == null || item.variantSizeMl === offerSizeMl;
              const unitRef: UnitRef = { variantId: item.variantId ?? undefined, productId: item.productId };
              for (let u = 0; u < item.quantity; u++) {
                if (isEligible) eligibleUnits.push(unitRef);
                else nonEligibleUnits.push(unitRef);
              }
            }
            const bundleCount = Math.floor(eligibleUnits.length / offerMinQuantity);
            const bundledUnitCount = bundleCount * offerMinQuantity;
            const hqPerBundle = offerHqBundlePrice ?? offerBundlePrice;
            const bundledHqShare = bundleCount * hqPerBundle;
            const remainderUnits = [...eligibleUnits.slice(bundledUnitCount), ...nonEligibleUnits];
            const remainderHqShare = remainderUnits.reduce((sum, u) => {
              const key = u.variantId ?? u.productId;
              return sum + (hqUnitPriceMap![key] ?? 0);
            }, 0);
            computedHqPrice = Math.round((bundledHqShare + remainderHqShare) * 100) / 100;
          } else {
            // Non-offer sale: sum per-item HQ prices
            computedHqPrice = Math.round(lineItemsWithProducts.reduce((sum, item) => {
              const key = item.variantId ?? item.productId;
              return sum + item.quantity * (hqUnitPriceMap![key] ?? 0);
            }, 0) * 100) / 100;
          }
          computedCommission = Math.round((sale.totalAmount - computedHqPrice) * 100) / 100;
        }

        sales.push({
          ...sale,
          lineItemsWithProducts,
          hqUnitPriceMap,
          offerName,
          offerBundlePrice,
          offerMinQuantity,
          offerHqBundlePrice,
          offerSizeMl,
          computedHqPrice,
          computedCommission,
        });
      }
    }

    return { settlement, sales };
  },
});
