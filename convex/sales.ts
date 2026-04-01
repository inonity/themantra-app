import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuth, requireRole, isSellerRole } from "./helpers/auth";
import { resolveAgentPrice, resolveOfferHqPrice } from "./helpers/pricing";
import { addSaleToSettlement } from "./agentSettlements";

const stockModelValidator = v.union(
  v.literal("hold_paid"),
  v.literal("consignment"),
  v.literal("dropship")
);

const fulfillmentSourceValidator = v.union(
  v.literal("agent_stock"),
  v.literal("hq_transfer"),
  v.literal("pending_batch"),
  v.literal("future_release")
);

export const recordB2CSale = mutation({
  args: {
    // Legacy args (backward compat)
    items: v.optional(
      v.array(
        v.object({
          batchId: v.id("batches"),
          productId: v.id("products"),
          quantity: v.number(),
        })
      )
    ),
    pendingLineItems: v.optional(
      v.array(
        v.object({
          productId: v.id("products"),
          quantity: v.number(),
        })
      )
    ),
    fulfillmentStatus: v.optional(
      v.union(v.literal("fulfilled"), v.literal("pending_stock"))
    ),
    // New mixed-fulfillment args
    fulfilledItems: v.optional(
      v.array(
        v.object({
          batchId: v.id("batches"),
          productId: v.id("products"),
          quantity: v.number(),
        })
      )
    ),
    pendingItems: v.optional(
      v.array(
        v.object({
          productId: v.id("products"),
          quantity: v.number(),
          fulfillmentSource: fulfillmentSourceValidator,
        })
      )
    ),
    // Common args
    saleChannel: v.union(
      v.literal("direct"),
      v.literal("tiktok"),
      v.literal("shopee"),
      v.literal("other")
    ),
    customerDetail: v.object({
      name: v.string(),
      phone: v.string(),
      email: v.string(),
    }),
    stockModel: v.optional(stockModelValidator),
    paymentCollector: v.optional(v.union(v.literal("agent"), v.literal("hq"))),
    offerId: v.optional(v.id("offers")),
    notes: v.optional(v.string()),
    saleDate: v.optional(v.number()),
    interestId: v.optional(v.id("interests")),
    // Payment flow
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("qr"),
        v.literal("bank_transfer"),
        v.literal("online"),
        v.literal("other")
      )
    ),
    paymentProofStorageId: v.optional(v.id("_storage")),
    amountReceived: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Determine which arg style is being used
    const isNewStyle = !!(args.fulfilledItems || args.pendingItems);
    const isLegacyPending = !isNewStyle && args.fulfillmentStatus === "pending_stock";

    // Validate saleDate if provided
    if (args.saleDate) {
      const now = Date.now();
      if (args.saleDate > now + 60000) throw new Error("Sale date cannot be in the future");
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      if (now - args.saleDate > ninetyDaysMs) throw new Error("Sale date cannot be more than 90 days ago");
    }

    // Normalize into fulfilledItems + pendingItems
    let fulfilledItems: { batchId: Id<"batches">; productId: Id<"products">; quantity: number }[] = [];
    let pendingItems: { productId: Id<"products">; quantity: number; fulfillmentSource: "agent_stock" | "hq_transfer" | "pending_batch" | "future_release" }[] = [];

    if (isNewStyle) {
      fulfilledItems = args.fulfilledItems ?? [];
      pendingItems = args.pendingItems ?? [];
      if (fulfilledItems.length === 0 && pendingItems.length === 0) {
        throw new Error("No items in sale");
      }
    } else if (isLegacyPending) {
      if (!args.pendingLineItems || args.pendingLineItems.length === 0) {
        throw new Error("Line items required for pre-paid sales");
      }
      pendingItems = args.pendingLineItems.map((li) => ({
        ...li,
        fulfillmentSource: "pending_batch" as const,
      }));
    } else {
      if (!args.items || args.items.length === 0) throw new Error("No items in sale");
      fulfilledItems = args.items;
    }

    // Build unified pricing items list
    const allPricingItems: { productId: Id<"products">; quantity: number }[] = [
      ...fulfilledItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      ...pendingItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    ];
    const totalQuantity = allPricingItems.reduce((sum, item) => sum + item.quantity, 0);

    // Resolve stock model: use provided or agent default or "hold_paid"
    let stockModel = args.stockModel;
    if (!stockModel) {
      const profile = await ctx.db
        .query("agentProfiles")
        .withIndex("by_agentId", (q) => q.eq("agentId", userId))
        .unique();
      stockModel = profile?.defaultStockModel ?? "hold_paid";
    }

    // Look up product prices and names
    const productPrices = new Map<string, number>();
    const productNames = new Map<string, string>();
    for (const item of allPricingItems) {
      if (!productPrices.has(item.productId)) {
        const product = await ctx.db.get(item.productId);
        if (!product) throw new Error("Product not found");
        productPrices.set(item.productId, product.price);
        productNames.set(item.productId, product.name);
      }
    }

    // Calculate customer-facing pricing
    let totalSalePrice: number;
    let offerIdToStore: typeof args.offerId = undefined;
    let offerSnapshot: { name: string; minQuantity: number; bundlePrice: number; hqBundlePrice?: number } | undefined;

    if (args.offerId) {
      const offer = await ctx.db.get(args.offerId);
      if (!offer) throw new Error("Offer not found");
      if (!offer.isActive) throw new Error("Offer is not active");

      // Snapshot offer details at time of sale
      offerSnapshot = {
        name: offer.name,
        minQuantity: offer.minQuantity,
        bundlePrice: offer.bundlePrice,
      };

      const now = Date.now();
      if (offer.startDate && now < offer.startDate) throw new Error("Offer has not started");
      if (offer.endDate && now > offer.endDate) throw new Error("Offer has expired");

      if (offer.agentIds && offer.agentIds.length > 0) {
        if (!offer.agentIds.includes(userId)) {
          throw new Error("You are not eligible for this offer");
        }
      }

      // Split items into eligible vs non-eligible for this offer
      const eligibleItems: typeof allPricingItems = [];
      const nonEligibleItems: typeof allPricingItems = [];
      for (const item of allPricingItems) {
        let eligible = true;
        if (offer.productId) {
          eligible = item.productId === offer.productId;
        } else if (offer.productIds && offer.productIds.length > 0) {
          eligible = offer.productIds.includes(item.productId);
        } else if (offer.collection) {
          const product = await ctx.db.get(item.productId);
          eligible = !!product && product.collection === offer.collection;
        }
        if (eligible) {
          eligibleItems.push(item);
        } else {
          nonEligibleItems.push(item);
        }
      }

      const eligibleQty = eligibleItems.reduce((s, i) => s + i.quantity, 0);

      if (eligibleQty < offer.minQuantity) {
        throw new Error(`Minimum ${offer.minQuantity} eligible items required for this offer`);
      }

      const bundleCount = Math.floor(eligibleQty / offer.minQuantity);
      const eligibleRemainder = eligibleQty - bundleCount * offer.minQuantity;

      const eligibleDefaultTotal = eligibleItems.reduce(
        (sum, item) => sum + item.quantity * productPrices.get(item.productId)!,
        0
      );
      const avgEligiblePrice = eligibleDefaultTotal / eligibleQty;
      const eligibleTotal =
        bundleCount * offer.bundlePrice + eligibleRemainder * avgEligiblePrice;

      const nonEligibleTotal = nonEligibleItems.reduce(
        (sum, item) => sum + item.quantity * productPrices.get(item.productId)!,
        0
      );

      totalSalePrice = eligibleTotal + nonEligibleTotal;
      offerIdToStore = args.offerId;
    } else {
      totalSalePrice = allPricingItems.reduce(
        (sum, item) => sum + item.quantity * productPrices.get(item.productId)!,
        0
      );
    }

    // Calculate HQ pricing (what agent owes HQ)
    let totalHqPrice = 0;
    const hqPricePerProduct = new Map<string, number>();
    let usedOfferHqPricing = false;

    if (offerIdToStore) {
      const offer = await ctx.db.get(offerIdToStore);
      if (offer) {
        const bundleCount = Math.floor(totalQuantity / offer.minQuantity);
        const remainder = totalQuantity - bundleCount * offer.minQuantity;

        const offerHq = await resolveOfferHqPrice(
          ctx,
          userId,
          offerIdToStore,
          stockModel,
          offer.bundlePrice
        );

        // HQ bundle price: use offer-level pricing if configured, otherwise full bundle price
        const hqBundlePrice = offerHq ? offerHq.hqBundlePrice : offer.bundlePrice;
        usedOfferHqPricing = true;
        totalHqPrice = bundleCount * hqBundlePrice;
        if (offerSnapshot) {
          offerSnapshot.hqBundlePrice = hqBundlePrice;
        }

        if (remainder > 0) {
          for (const item of allPricingItems) {
            if (!hqPricePerProduct.has(item.productId)) {
              const resolved = await resolveAgentPrice(ctx, userId, item.productId, stockModel);
              hqPricePerProduct.set(item.productId, resolved.hqUnitPrice);
            }
          }
          totalHqPrice += remainder * (
            allPricingItems.reduce(
              (sum, item) => sum + item.quantity * hqPricePerProduct.get(item.productId)!,
              0
            ) / totalQuantity
          );
        }
      }
    }

    if (!usedOfferHqPricing) {
      for (const item of allPricingItems) {
        if (!hqPricePerProduct.has(item.productId)) {
          const resolved = await resolveAgentPrice(ctx, userId, item.productId, stockModel);
          hqPricePerProduct.set(item.productId, resolved.hqUnitPrice);
        }
        totalHqPrice += item.quantity * hqPricePerProduct.get(item.productId)!;
      }
    }

    totalHqPrice = Math.round(totalHqPrice * 100) / 100;
    const agentCommission = Math.round((totalSalePrice - totalHqPrice) * 100) / 100;

    // Determine payment collector — only relevant for consignment/dropship
    const paymentCollector = args.paymentCollector ?? "agent";
    const hqCollects =
      paymentCollector === "hq" &&
      (stockModel === "consignment" || stockModel === "dropship");

    const movedAt = Date.now();
    const saleDateValue = args.saleDate ?? movedAt;

    // Compute per-item offer-adjusted unit prices
    // When an offer applies, items in bundles get bundlePrice/minQuantity,
    // remainder items get their regular product price.
    const itemUnitPrices = new Map<string, number>(); // key = productId+index
    const allItems = [
      ...fulfilledItems.map((i, idx) => ({ ...i, _key: `f_${idx}` })),
      ...pendingItems.map((i, idx) => ({ ...i, _key: `p_${idx}` })),
    ];

    if (offerIdToStore) {
      const offer = await ctx.db.get(offerIdToStore);
      if (offer) {
        // Determine which items are eligible for the offer
        const eligibleKeys: string[] = [];
        const nonEligibleKeys: string[] = [];
        for (const item of allItems) {
          let eligible = true;
          if (offer.productId) {
            eligible = item.productId === offer.productId;
          } else if (offer.productIds && offer.productIds.length > 0) {
            eligible = offer.productIds.includes(item.productId);
          } else if (offer.collection) {
            const product = await ctx.db.get(item.productId);
            eligible = !!product && product.collection === offer.collection;
          }
          if (eligible) {
            eligibleKeys.push(item._key);
          } else {
            nonEligibleKeys.push(item._key);
          }
        }

        // Expand eligible items by quantity to assign bundle vs remainder
        const expandedEligible: { key: string; productId: Id<"products"> }[] = [];
        for (const item of allItems) {
          if (eligibleKeys.includes(item._key)) {
            for (let u = 0; u < item.quantity; u++) {
              expandedEligible.push({ key: item._key, productId: item.productId });
            }
          }
        }

        const bundledUnitCount = Math.floor(expandedEligible.length / offer.minQuantity) * offer.minQuantity;
        const bundleUnitPrice = Math.round((offer.bundlePrice / offer.minQuantity) * 100) / 100;

        // Count how many units of each item-key are bundled vs remainder
        const bundledPerKey = new Map<string, number>();
        const remainderPerKey = new Map<string, number>();
        for (let i = 0; i < expandedEligible.length; i++) {
          const { key } = expandedEligible[i];
          if (i < bundledUnitCount) {
            bundledPerKey.set(key, (bundledPerKey.get(key) ?? 0) + 1);
          } else {
            remainderPerKey.set(key, (remainderPerKey.get(key) ?? 0) + 1);
          }
        }

        // For each item, compute a blended unit price if it straddles bundle/remainder
        for (const item of allItems) {
          if (eligibleKeys.includes(item._key)) {
            const bundled = bundledPerKey.get(item._key) ?? 0;
            const remainder = remainderPerKey.get(item._key) ?? 0;
            const regularPrice = productPrices.get(item.productId) ?? 0;
            const totalForItem = bundled * bundleUnitPrice + remainder * regularPrice;
            itemUnitPrices.set(item._key, Math.round((totalForItem / item.quantity) * 100) / 100);
          } else {
            itemUnitPrices.set(item._key, productPrices.get(item.productId) ?? 0);
          }
        }
      }
    }

    // Fallback: regular product price for items without offer pricing
    for (const item of allItems) {
      if (!itemUnitPrices.has(item._key)) {
        itemUnitPrices.set(item._key, productPrices.get(item.productId) ?? 0);
      }
    }

    const avgUnitPrice = totalSalePrice / totalQuantity;

    // Ensure hqPricePerProduct is populated for all items (needed for lineItem snapshots)
    for (const item of allPricingItems) {
      if (!hqPricePerProduct.has(item.productId)) {
        const resolved = await resolveAgentPrice(ctx, userId, item.productId, stockModel);
        hqPricePerProduct.set(item.productId, resolved.hqUnitPrice);
      }
    }

    // Build enriched lineItems array
    const enrichedLineItems: {
      productId: Id<"products">;
      quantity: number;
      unitPrice: number;
      productName: string;
      productPrice: number;
      fulfillmentSource: "agent_stock" | "hq_transfer" | "pending_batch" | "future_release";
      fulfilledQuantity: number;
      batchId?: Id<"batches">;
      fulfilledAt?: number;
      hqUnitPrice: number;
    }[] = [];

    for (let idx = 0; idx < fulfilledItems.length; idx++) {
      const item = fulfilledItems[idx];
      const key = `f_${idx}`;
      enrichedLineItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: itemUnitPrices.get(key) ?? Math.round((productPrices.get(item.productId) ?? avgUnitPrice) * 100) / 100,
        productName: productNames.get(item.productId) ?? "Unknown",
        productPrice: productPrices.get(item.productId) ?? 0,
        fulfillmentSource: "agent_stock",
        fulfilledQuantity: item.quantity,
        batchId: item.batchId,
        fulfilledAt: movedAt,
        hqUnitPrice: Math.round((hqPricePerProduct.get(item.productId) ?? 0) * 100) / 100,
      });
    }

    for (let idx = 0; idx < pendingItems.length; idx++) {
      const item = pendingItems[idx];
      const key = `p_${idx}`;
      enrichedLineItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: itemUnitPrices.get(key) ?? Math.round((productPrices.get(item.productId) ?? avgUnitPrice) * 100) / 100,
        productName: productNames.get(item.productId) ?? "Unknown",
        productPrice: productPrices.get(item.productId) ?? 0,
        fulfillmentSource: item.fulfillmentSource,
        fulfilledQuantity: 0,
        hqUnitPrice: Math.round((hqPricePerProduct.get(item.productId) ?? 0) * 100) / 100,
      });
    }

    // Determine fulfillment status
    const hasFulfilled = fulfilledItems.length > 0;
    const hasPending = pendingItems.length > 0;
    const fulfillmentStatus = hasFulfilled && hasPending
      ? "partial" as const
      : hasPending
        ? "pending_stock" as const
        : "fulfilled" as const;

    // Payment fields
    const roundedTotal = Math.round(totalSalePrice * 100) / 100;
    const amountReceived = args.amountReceived != null
      ? Math.round(args.amountReceived * 100) / 100
      : roundedTotal;
    const overpaymentAmount = amountReceived > roundedTotal
      ? Math.round((amountReceived - roundedTotal) * 100) / 100
      : undefined;

    // Create the sale document
    const saleId = await ctx.db.insert("sales", {
      type: "b2c",
      sellerType: "agent",
      sellerId: userId,
      buyerType: "customer",
      customerDetail: args.customerDetail,
      saleChannel: args.saleChannel,
      offerId: offerIdToStore,
      offerSnapshot,
      notes: args.notes,
      totalAmount: roundedTotal,
      totalQuantity,
      paymentStatus: "paid",
      amountPaid: roundedTotal,
      paymentMethod: args.paymentMethod,
      paymentProofStorageId: args.paymentProofStorageId,
      amountReceived: amountReceived !== roundedTotal ? amountReceived : undefined,
      overpaymentAmount,
      paidAt: movedAt,
      saleDate: saleDateValue,
      recordedBy: userId,
      stockModel,
      hqPrice: totalHqPrice,
      agentCommission,
      hqSettled: hqCollects ? true : false,
      paymentCollector: hqCollects ? "hq" : "agent",
      fulfillmentStatus,
      fulfilledAt: fulfillmentStatus === "fulfilled" ? movedAt : undefined,
      interestId: args.interestId,
      lineItems: enrichedLineItems,
    });

    // Process fulfilled items — deduct from agent inventory + create stock movements
    if (fulfilledItems.length > 0) {
      for (const item of fulfilledItems) {
        if (!hqPricePerProduct.has(item.productId)) {
          const resolved = await resolveAgentPrice(ctx, userId, item.productId, stockModel);
          hqPricePerProduct.set(item.productId, resolved.hqUnitPrice);
        }
      }

      const inventoryStockModel =
        stockModel === "hold_paid" || stockModel === "consignment"
          ? stockModel
          : undefined;

      for (const item of fulfilledItems) {
        const agentInventory = await ctx.db
          .query("inventory")
          .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
            q
              .eq("batchId", item.batchId)
              .eq("heldByType", "agent")
              .eq("heldById", userId)
              .eq("stockModel", inventoryStockModel)
          )
          .unique();

        if (!agentInventory || agentInventory.quantity < item.quantity) {
          throw new Error("Insufficient inventory");
        }

        const newQty = agentInventory.quantity - item.quantity;
        if (newQty === 0) {
          await ctx.db.delete(agentInventory._id);
        } else {
          await ctx.db.patch(agentInventory._id, { quantity: newQty, updatedAt: Date.now() });
        }

        const key = `f_${fulfilledItems.indexOf(item)}`;
        const itemAdjustedUnitPrice = itemUnitPrices.get(key) ?? (productPrices.get(item.productId) ?? avgUnitPrice);
        const itemSalePrice = itemAdjustedUnitPrice * item.quantity;
        const hqUnitPrice = hqPricePerProduct.get(item.productId)!;

        await ctx.db.insert("stockMovements", {
          batchId: item.batchId,
          productId: item.productId,
          fromPartyType: "agent",
          fromPartyId: userId,
          toPartyType: "customer",
          quantity: item.quantity,
          movedAt,
          recordedBy: userId,
          salePrice: Math.round(itemSalePrice * 100) / 100,
          unitPrice: Math.round(itemAdjustedUnitPrice * 100) / 100,
          saleId,
          stockModel,
          hqUnitPrice: Math.round(hqUnitPrice * 100) / 100,
        });
      }
    }

    // Settlement logic depends on who collects payment
    if (hqCollects) {
      // HQ collected payment — HQ owes agent their commission
      if (agentCommission > 0) {
        await addSaleToSettlement(ctx, userId, saleId, agentCommission, "hq_to_agent");
      }
    } else {
      // Agent collected payment — agent owes HQ the hqPrice
      if (totalHqPrice > 0) {
        await addSaleToSettlement(ctx, userId, saleId, totalHqPrice, "agent_to_hq");
      }
    }

    return saleId;
  },
});

export const recordB2BPurchase = mutation({
  args: {
    agentId: v.id("users"),
    items: v.array(
      v.object({
        batchId: v.id("batches"),
        quantity: v.number(),
      })
    ),
    stockModel: stockModelValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");

    const agent = await ctx.db.get(args.agentId);
    if (!agent || !isSellerRole(agent.role)) throw new Error("Invalid agent");

    if (args.items.length === 0) throw new Error("No items in purchase");

    let totalQuantity = 0;
    let totalHqAmount = 0;
    const movedAt = Date.now();

    // Validate all items first and calculate totals using resolved pricing
    const itemDetails: {
      batchId: typeof args.items[0]["batchId"];
      productId: Id<"products">;
      quantity: number;
      retailPrice: number;
      hqUnitPrice: number;
    }[] = [];

    for (const item of args.items) {
      const batch = await ctx.db.get(item.batchId);
      if (!batch) throw new Error("Batch not found");
      if (batch.status !== "available") throw new Error("Batch is not available");

      const resolved = await resolveAgentPrice(
        ctx,
        args.agentId,
        batch.productId,
        args.stockModel
      );

      itemDetails.push({
        batchId: item.batchId,
        productId: batch.productId,
        quantity: item.quantity,
        retailPrice: resolved.retailPrice,
        hqUnitPrice: resolved.hqUnitPrice,
      });

      totalQuantity += item.quantity;
      totalHqAmount += item.quantity * resolved.hqUnitPrice;
    }

    totalHqAmount = Math.round(totalHqAmount * 100) / 100;

    // Create the sale document
    const saleId = await ctx.db.insert("sales", {
      type: "b2b",
      sellerType: "business",
      buyerType: "agent",
      buyerId: args.agentId,
      saleChannel: "agent",
      notes: args.notes,
      totalAmount: totalHqAmount,
      totalQuantity,
      paymentStatus: "paid",
      amountPaid: totalHqAmount,
      saleDate: movedAt,
      recordedBy: admin._id,
      stockModel: args.stockModel,
      hqPrice: totalHqAmount,
      hqSettled: false,
    });

    // Process each item: transfer inventory + create movement
    for (const detail of itemDetails) {
      // Dropship doesn't transfer physical inventory
      if (args.stockModel !== "dropship") {
        const businessInventory = await ctx.db
          .query("inventory")
          .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
            q.eq("batchId", detail.batchId).eq("heldByType", "business")
          )
          .unique();

        if (!businessInventory || businessInventory.quantity < detail.quantity) {
          throw new Error("Insufficient business inventory");
        }

        const newBusinessQty = businessInventory.quantity - detail.quantity;
        if (newBusinessQty === 0) {
          await ctx.db.delete(businessInventory._id);
        } else {
          await ctx.db.patch(businessInventory._id, {
            quantity: newBusinessQty,
            updatedAt: Date.now(),
          });
        }

        const inventoryStockModel =
          args.stockModel === "hold_paid" || args.stockModel === "consignment"
            ? args.stockModel
            : undefined;

        const agentInventory = await ctx.db
          .query("inventory")
          .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
            q
              .eq("batchId", detail.batchId)
              .eq("heldByType", "agent")
              .eq("heldById", args.agentId)
              .eq("stockModel", inventoryStockModel)
          )
          .unique();

        if (agentInventory) {
          await ctx.db.patch(agentInventory._id, {
            quantity: agentInventory.quantity + detail.quantity,
            updatedAt: Date.now(),
          });
        } else {
          await ctx.db.insert("inventory", {
            batchId: detail.batchId,
            productId: detail.productId,
            heldByType: "agent",
            heldById: args.agentId,
            quantity: detail.quantity,
            stockModel: inventoryStockModel,
          });
        }
      }

      await ctx.db.insert("stockMovements", {
        batchId: detail.batchId,
        productId: detail.productId,
        fromPartyType: "business",
        toPartyType: "agent",
        toPartyId: args.agentId,
        quantity: detail.quantity,
        movedAt,
        notes: args.notes,
        recordedBy: admin._id,
        saleId,
        salePrice: Math.round(detail.quantity * detail.hqUnitPrice * 100) / 100,
        unitPrice: Math.round(detail.hqUnitPrice * 100) / 100,
        stockModel: args.stockModel,
        hqUnitPrice: Math.round(detail.hqUnitPrice * 100) / 100,
      });
    }

    return saleId;
  },
});

export const recordDropshipSale = mutation({
  args: {
    // Legacy: single items array (all fulfilled)
    items: v.optional(v.array(
      v.object({
        batchId: v.id("batches"),
        productId: v.id("products"),
        quantity: v.number(),
      })
    )),
    // New: split fulfilled + pending
    fulfilledItems: v.optional(v.array(
      v.object({
        batchId: v.id("batches"),
        productId: v.id("products"),
        quantity: v.number(),
        fulfillmentSource: v.optional(fulfillmentSourceValidator),
      })
    )),
    pendingItems: v.optional(v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
        fulfillmentSource: v.union(
          v.literal("agent_stock"),
          v.literal("hq_transfer"),
          v.literal("pending_batch"),
          v.literal("future_release")
        ),
      })
    )),
    saleChannel: v.union(
      v.literal("direct"),
      v.literal("tiktok"),
      v.literal("shopee"),
      v.literal("other")
    ),
    customerDetail: v.object({
      name: v.string(),
      phone: v.string(),
      email: v.string(),
    }),
    dropshipCollector: v.union(v.literal("agent"), v.literal("hq")),
    offerId: v.optional(v.id("offers")),
    notes: v.optional(v.string()),
    saleDate: v.optional(v.number()),
    interestId: v.optional(v.id("interests")),
    // Payment flow
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("qr"),
        v.literal("bank_transfer"),
        v.literal("online"),
        v.literal("other")
      )
    ),
    paymentProofStorageId: v.optional(v.id("_storage")),
    amountReceived: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Validate saleDate if provided
    if (args.saleDate) {
      const now = Date.now();
      if (args.saleDate > now + 60000) throw new Error("Sale date cannot be in the future");
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      if (now - args.saleDate > ninetyDaysMs) throw new Error("Sale date cannot be more than 90 days ago");
    }

    // Normalize into fulfilledItems + pendingItems (support legacy `items` arg)
    const fulfilledItems: { batchId: Id<"batches">; productId: Id<"products">; quantity: number; fulfillmentSource?: "agent_stock" | "hq_transfer" | "pending_batch" | "future_release" }[] =
      args.fulfilledItems ?? args.items?.map((i) => ({ ...i, fulfillmentSource: undefined })) ?? [];
    const pendingItems = args.pendingItems ?? [];

    if (fulfilledItems.length === 0 && pendingItems.length === 0) {
      throw new Error("No items in sale");
    }

    // Build unified pricing items list
    const allPricingItems: { productId: Id<"products">; quantity: number }[] = [
      ...fulfilledItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      ...pendingItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    ];
    const totalQuantity = allPricingItems.reduce((sum, item) => sum + item.quantity, 0);
    const stockModel = "dropship" as const;

    // Look up product prices and names
    const productPrices = new Map<string, number>();
    const productNames = new Map<string, string>();
    for (const item of allPricingItems) {
      if (!productPrices.has(item.productId)) {
        const product = await ctx.db.get(item.productId);
        if (!product) throw new Error("Product not found");
        productPrices.set(item.productId, product.price);
        productNames.set(item.productId, product.name);
      }
    }

    // Calculate customer-facing pricing (same offer logic)
    let totalSalePrice: number;
    let offerIdToStore: typeof args.offerId = undefined;
    let offerSnapshot: { name: string; minQuantity: number; bundlePrice: number; hqBundlePrice?: number } | undefined;

    if (args.offerId) {
      const offer = await ctx.db.get(args.offerId);
      if (!offer) throw new Error("Offer not found");
      if (!offer.isActive) throw new Error("Offer is not active");

      // Snapshot offer details at time of sale
      offerSnapshot = {
        name: offer.name,
        minQuantity: offer.minQuantity,
        bundlePrice: offer.bundlePrice,
      };

      const now = Date.now();
      if (offer.startDate && now < offer.startDate) throw new Error("Offer has not started");
      if (offer.endDate && now > offer.endDate) throw new Error("Offer has expired");

      if (offer.agentIds && offer.agentIds.length > 0) {
        if (!offer.agentIds.includes(userId)) {
          throw new Error("You are not eligible for this offer");
        }
      }

      // Split items into eligible vs non-eligible for this offer
      const eligibleItems: typeof allPricingItems = [];
      const nonEligibleItems: typeof allPricingItems = [];
      for (const item of allPricingItems) {
        let eligible = true;
        if (offer.productId) {
          eligible = item.productId === offer.productId;
        } else if (offer.productIds && offer.productIds.length > 0) {
          eligible = offer.productIds.includes(item.productId);
        } else if (offer.collection) {
          const product = await ctx.db.get(item.productId);
          eligible = !!product && product.collection === offer.collection;
        }
        if (eligible) {
          eligibleItems.push(item);
        } else {
          nonEligibleItems.push(item);
        }
      }

      const eligibleQty = eligibleItems.reduce((s, i) => s + i.quantity, 0);

      if (eligibleQty < offer.minQuantity) {
        throw new Error(`Minimum ${offer.minQuantity} eligible items required for this offer`);
      }

      const bundleCount = Math.floor(eligibleQty / offer.minQuantity);
      const eligibleRemainder = eligibleQty - bundleCount * offer.minQuantity;

      // Eligible: bundles at offer price, remainder at retail
      const eligibleDefaultTotal = eligibleItems.reduce(
        (sum, item) => sum + item.quantity * productPrices.get(item.productId)!,
        0
      );
      const avgEligiblePrice = eligibleDefaultTotal / eligibleQty;
      const eligibleTotal =
        bundleCount * offer.bundlePrice + eligibleRemainder * avgEligiblePrice;

      // Non-eligible at full retail
      const nonEligibleTotal = nonEligibleItems.reduce(
        (sum, item) => sum + item.quantity * productPrices.get(item.productId)!,
        0
      );

      totalSalePrice = eligibleTotal + nonEligibleTotal;
      offerIdToStore = args.offerId;
    } else {
      totalSalePrice = allPricingItems.reduce(
        (sum, item) => sum + item.quantity * productPrices.get(item.productId)!,
        0
      );
    }

    // Calculate HQ pricing
    let totalHqPrice = 0;
    const hqPricePerProduct = new Map<string, number>();
    let usedOfferHqPricing = false;

    if (offerIdToStore) {
      const offer = await ctx.db.get(offerIdToStore);
      if (offer) {
        const bundleCount = Math.floor(totalQuantity / offer.minQuantity);
        const remainder = totalQuantity - bundleCount * offer.minQuantity;

        const offerHq = await resolveOfferHqPrice(
          ctx,
          userId,
          offerIdToStore,
          stockModel,
          offer.bundlePrice
        );

        // HQ bundle price: use offer-level pricing if configured, otherwise full bundle price
        const hqBundlePrice = offerHq ? offerHq.hqBundlePrice : offer.bundlePrice;
        usedOfferHqPricing = true;
        totalHqPrice = bundleCount * hqBundlePrice;
        if (offerSnapshot) {
          offerSnapshot.hqBundlePrice = hqBundlePrice;
        }

        if (remainder > 0) {
          for (const item of allPricingItems) {
            if (!hqPricePerProduct.has(item.productId)) {
              const resolved = await resolveAgentPrice(ctx, userId, item.productId, stockModel);
              hqPricePerProduct.set(item.productId, resolved.hqUnitPrice);
            }
          }
          totalHqPrice += remainder * (
            allPricingItems.reduce(
              (sum, item) => sum + item.quantity * hqPricePerProduct.get(item.productId)!,
              0
            ) / totalQuantity
          );
        }
      }
    }

    if (!usedOfferHqPricing) {
      for (const item of allPricingItems) {
        if (!hqPricePerProduct.has(item.productId)) {
          const resolved = await resolveAgentPrice(ctx, userId, item.productId, stockModel);
          hqPricePerProduct.set(item.productId, resolved.hqUnitPrice);
        }
        totalHqPrice += item.quantity * hqPricePerProduct.get(item.productId)!;
      }
    }

    totalHqPrice = Math.round(totalHqPrice * 100) / 100;
    const agentCommission = Math.round((totalSalePrice - totalHqPrice) * 100) / 100;

    const unitPrice = totalSalePrice / totalQuantity;
    const movedAt = Date.now();

    // Ensure per-product HQ prices are resolved for stock movements
    for (const item of allPricingItems) {
      if (!hqPricePerProduct.has(item.productId)) {
        const resolved = await resolveAgentPrice(ctx, userId, item.productId, stockModel);
        hqPricePerProduct.set(item.productId, resolved.hqUnitPrice);
      }
    }

    const saleDateValue = args.saleDate ?? movedAt;

    const hqCollects = args.dropshipCollector === "hq";

    // Build enriched lineItems
    const enrichedLineItems: {
      productId: Id<"products">;
      quantity: number;
      unitPrice: number;
      productName: string;
      productPrice: number;
      fulfillmentSource: "agent_stock" | "hq_transfer" | "pending_batch" | "future_release";
      fulfilledQuantity: number;
      batchId?: Id<"batches">;
      fulfilledAt?: number;
      hqUnitPrice: number;
    }[] = [];

    for (const item of fulfilledItems) {
      const source = item.fulfillmentSource ?? "hq_transfer";
      enrichedLineItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Math.round(unitPrice * 100) / 100,
        productName: productNames.get(item.productId) ?? "Unknown",
        productPrice: productPrices.get(item.productId) ?? 0,
        fulfillmentSource: source === "agent_stock" ? "agent_stock" : "hq_transfer",
        fulfilledQuantity: item.quantity,
        batchId: item.batchId,
        fulfilledAt: movedAt,
        hqUnitPrice: Math.round((hqPricePerProduct.get(item.productId) ?? 0) * 100) / 100,
      });
    }

    for (const item of pendingItems) {
      enrichedLineItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Math.round(unitPrice * 100) / 100,
        productName: productNames.get(item.productId) ?? "Unknown",
        productPrice: productPrices.get(item.productId) ?? 0,
        fulfillmentSource: item.fulfillmentSource,
        fulfilledQuantity: 0,
        hqUnitPrice: Math.round((hqPricePerProduct.get(item.productId) ?? 0) * 100) / 100,
      });
    }

    // Determine fulfillment status
    const hasFulfilled = fulfilledItems.length > 0;
    const hasPending = pendingItems.length > 0;
    const fulfillmentStatus = hasFulfilled && hasPending
      ? "partial" as const
      : hasPending
        ? "pending_stock" as const
        : "fulfilled" as const;

    // Payment fields
    const roundedTotal = Math.round(totalSalePrice * 100) / 100;
    const dsAmountReceived = args.amountReceived != null
      ? Math.round(args.amountReceived * 100) / 100
      : roundedTotal;
    const dsOverpaymentAmount = dsAmountReceived > roundedTotal
      ? Math.round((dsAmountReceived - roundedTotal) * 100) / 100
      : undefined;

    // Create the sale document
    const saleId = await ctx.db.insert("sales", {
      type: "b2c",
      sellerType: "agent",
      sellerId: userId,
      buyerType: "customer",
      customerDetail: args.customerDetail,
      saleChannel: args.saleChannel,
      offerId: offerIdToStore,
      offerSnapshot,
      notes: args.notes,
      totalAmount: roundedTotal,
      totalQuantity,
      paymentStatus: "paid",
      amountPaid: roundedTotal,
      paymentMethod: args.paymentMethod,
      paymentProofStorageId: args.paymentProofStorageId,
      amountReceived: dsAmountReceived !== roundedTotal ? dsAmountReceived : undefined,
      overpaymentAmount: dsOverpaymentAmount,
      paidAt: movedAt,
      saleDate: saleDateValue,
      recordedBy: userId,
      stockModel,
      hqPrice: totalHqPrice,
      agentCommission,
      // HQ already has the money when they collect directly
      hqSettled: hqCollects ? true : false,
      dropshipCollector: args.dropshipCollector,
      paymentCollector: args.dropshipCollector,
      fulfillmentStatus,
      fulfilledAt: fulfillmentStatus === "fulfilled" ? movedAt : undefined,
      interestId: args.interestId,
      lineItems: enrichedLineItems,
    });

    // Deduct inventory for fulfilled items
    for (const item of fulfilledItems) {
      const isAgentStock = item.fulfillmentSource === "agent_stock";

      if (isAgentStock) {
        // Deduct from agent's own inventory
        const agentInvRecords = await ctx.db
          .query("inventory")
          .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
            q.eq("batchId", item.batchId).eq("heldByType", "agent").eq("heldById", userId)
          )
          .collect();

        const agentInv = agentInvRecords.find((inv) => inv.quantity >= item.quantity);
        if (!agentInv) {
          throw new Error("Insufficient agent inventory");
        }

        const newQty = agentInv.quantity - item.quantity;
        if (newQty === 0) {
          await ctx.db.delete(agentInv._id);
        } else {
          await ctx.db.patch(agentInv._id, { quantity: newQty, updatedAt: Date.now() });
        }
      } else {
        // Deduct from business inventory (original dropship behavior)
        const businessInventory = await ctx.db
          .query("inventory")
          .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
            q.eq("batchId", item.batchId).eq("heldByType", "business")
          )
          .unique();

        if (!businessInventory || businessInventory.quantity < item.quantity) {
          throw new Error("Insufficient business inventory");
        }

        const newQty = businessInventory.quantity - item.quantity;
        if (newQty === 0) {
          await ctx.db.delete(businessInventory._id);
        } else {
          await ctx.db.patch(businessInventory._id, {
            quantity: newQty,
            updatedAt: Date.now(),
          });
        }
      }

      const itemSalePrice = unitPrice * item.quantity;
      const hqUnitPrice = hqPricePerProduct.get(item.productId)!;

      await ctx.db.insert("stockMovements", {
        batchId: item.batchId,
        productId: item.productId,
        fromPartyType: isAgentStock ? "agent" : "business",
        fromPartyId: isAgentStock ? userId : undefined,
        toPartyType: "customer",
        quantity: item.quantity,
        movedAt,
        recordedBy: userId,
        salePrice: Math.round(itemSalePrice * 100) / 100,
        unitPrice: Math.round(unitPrice * 100) / 100,
        saleId,
        stockModel,
        hqUnitPrice: Math.round(hqUnitPrice * 100) / 100,
      });
    }

    // Settlement logic depends on who collects payment
    if (hqCollects) {
      // HQ collected payment — HQ owes agent their commission
      if (agentCommission > 0) {
        await addSaleToSettlement(ctx, userId, saleId, agentCommission, "hq_to_agent");
      }
    } else {
      // Agent collected payment — agent owes HQ the hqPrice
      if (totalHqPrice > 0) {
        await addSaleToSettlement(ctx, userId, saleId, totalHqPrice, "agent_to_hq");
      }
    }

    return saleId;
  },
});

export const markPaid = mutation({
  args: {
    saleId: v.id("sales"),
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

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found");

    const newAmountPaid = sale.amountPaid + args.amountPaid;
    const paymentStatus =
      newAmountPaid >= sale.totalAmount ? "paid" as const :
      newAmountPaid > 0 ? "partial" as const :
      "unpaid" as const;

    await ctx.db.patch(args.saleId, {
      amountPaid: Math.round(newAmountPaid * 100) / 100,
      paymentStatus,
      paymentMethod: args.paymentMethod,
      paidAt: paymentStatus === "paid" ? Date.now() : undefined,
    });
  },
});

// Admin: list all sales
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db
      .query("sales")
      .withIndex("by_saleDate")
      .order("desc")
      .take(200);
  },
});

// Agent: list own sales
export const listByAgent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("sales")
      .withIndex("by_sellerId_and_saleDate", (q) => q.eq("sellerId", userId))
      .order("desc")
      .take(200);
  },
});

// Admin: list unpaid sales
export const listUnpaid = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const unpaid = await ctx.db
      .query("sales")
      .withIndex("by_paymentStatus_and_saleDate", (q) => q.eq("paymentStatus", "unpaid"))
      .order("desc")
      .take(100);
    const partial = await ctx.db
      .query("sales")
      .withIndex("by_paymentStatus_and_saleDate", (q) => q.eq("paymentStatus", "partial"))
      .order("desc")
      .take(100);
    return [...unpaid, ...partial].sort((a, b) => b.saleDate - a.saleDate);
  },
});

// Get a single sale with its line items (stock movements)
export const getWithLineItems = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found");

    const lineItems = await ctx.db
      .query("stockMovements")
      .withIndex("by_saleId", (q) => q.eq("saleId", args.saleId))
      .take(50);

    return { sale, lineItems };
  },
});

// Fulfill a pre-paid sale (stock was pending, now being delivered)
export const fulfillSale = mutation({
  args: {
    saleId: v.id("sales"),
    items: v.array(
      v.object({
        batchId: v.id("batches"),
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found");
    if (sale.fulfillmentStatus !== "pending_stock") {
      throw new Error("Sale is not pending stock");
    }
    // Only the seller or admin can fulfill
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "admin" && sale.sellerId !== userId) {
      throw new Error("Not authorized to fulfill this sale");
    }

    // Validate items match the sale's lineItems
    if (!sale.lineItems) throw new Error("Sale has no pending line items");

    const expectedByProduct = new Map<string, number>();
    for (const li of sale.lineItems) {
      expectedByProduct.set(
        li.productId,
        (expectedByProduct.get(li.productId) ?? 0) + li.quantity
      );
    }

    const providedByProduct = new Map<string, number>();
    for (const item of args.items) {
      providedByProduct.set(
        item.productId,
        (providedByProduct.get(item.productId) ?? 0) + item.quantity
      );
    }

    for (const [productId, expectedQty] of expectedByProduct) {
      const providedQty = providedByProduct.get(productId) ?? 0;
      if (providedQty !== expectedQty) {
        const product = await ctx.db.get(productId as Id<"products">);
        throw new Error(
          `Expected ${expectedQty} of ${product?.name ?? "Unknown"}, got ${providedQty}`
        );
      }
    }

    const movedAt = Date.now();
    const unitPrice = sale.totalAmount / sale.totalQuantity;
    const stockModel = sale.stockModel ?? "hold_paid";
    const inventoryStockModel =
      stockModel === "hold_paid" || stockModel === "consignment"
        ? stockModel
        : undefined;

    // Deduct from agent's inventory and create stock movements
    for (const item of args.items) {
      const agentInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
          q
            .eq("batchId", item.batchId)
            .eq("heldByType", "agent")
            .eq("heldById", sale.sellerId!)
            .eq("stockModel", inventoryStockModel)
        )
        .unique();

      if (!agentInventory || agentInventory.quantity < item.quantity) {
        throw new Error("Insufficient inventory for fulfillment");
      }

      const newQty = agentInventory.quantity - item.quantity;
      if (newQty === 0) {
        await ctx.db.delete(agentInventory._id);
      } else {
        await ctx.db.patch(agentInventory._id, {
          quantity: newQty,
          updatedAt: movedAt,
        });
      }

      const hqPricePerProduct = new Map<string, number>();
      if (!hqPricePerProduct.has(item.productId)) {
        const resolved = await resolveAgentPrice(
          ctx,
          sale.sellerId!,
          item.productId,
          stockModel
        );
        hqPricePerProduct.set(item.productId, resolved.hqUnitPrice);
      }

      await ctx.db.insert("stockMovements", {
        batchId: item.batchId,
        productId: item.productId,
        fromPartyType: "agent",
        fromPartyId: sale.sellerId,
        toPartyType: "customer",
        quantity: item.quantity,
        movedAt,
        recordedBy: userId,
        salePrice: Math.round(unitPrice * item.quantity * 100) / 100,
        unitPrice: Math.round(unitPrice * 100) / 100,
        saleId: args.saleId,
        stockModel,
        hqUnitPrice: Math.round(
          (hqPricePerProduct.get(item.productId) ?? unitPrice) * 100
        ) / 100,
      });
    }

    // Mark sale as fulfilled
    await ctx.db.patch(args.saleId, {
      fulfillmentStatus: "fulfilled",
      fulfilledAt: movedAt,
    });
  },
});

// Partial fulfillment: fulfill specific pending line items
export const fulfillLineItems = mutation({
  args: {
    saleId: v.id("sales"),
    items: v.array(
      v.object({
        lineItemIndex: v.number(),
        batchId: v.id("batches"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found");
    if (sale.fulfillmentStatus === "fulfilled") {
      throw new Error("Sale is already fully fulfilled");
    }
    if (user.role !== "admin" && sale.sellerId !== userId) {
      throw new Error("Not authorized to fulfill this sale");
    }
    if (!sale.lineItems) throw new Error("Sale has no line items");

    const movedAt = Date.now();
    const unitPrice = sale.totalAmount / sale.totalQuantity;
    const stockModel = sale.stockModel ?? "hold_paid";
    const sellerId = sale.sellerId!;
    const inventoryStockModel: "hold_paid" | "consignment" | "dropship" | undefined =
      stockModel === "hold_paid" || stockModel === "consignment" || stockModel === "dropship"
        ? stockModel
        : undefined;

    // Work on a copy of lineItems
    const updatedLineItems = [...sale.lineItems];

    for (const item of args.items) {
      if (item.lineItemIndex < 0 || item.lineItemIndex >= updatedLineItems.length) {
        throw new Error(`Invalid line item index: ${item.lineItemIndex}`);
      }
      const lineItem = updatedLineItems[item.lineItemIndex];
      const alreadyFulfilled = lineItem.fulfilledQuantity ?? 0;
      const remaining = lineItem.quantity - alreadyFulfilled;

      if (item.quantity > remaining) {
        throw new Error(`Cannot fulfill ${item.quantity}, only ${remaining} remaining for line item ${item.lineItemIndex}`);
      }

      // Deduct from agent's inventory
      const agentInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
          q.eq("batchId", item.batchId).eq("heldByType", "agent").eq("heldById", sellerId).eq("stockModel", inventoryStockModel)
        )
        .unique();

      if (!agentInventory || agentInventory.quantity < item.quantity) {
        throw new Error("Insufficient agent inventory for fulfillment");
      }

      const newQty = agentInventory.quantity - item.quantity;
      if (newQty === 0) {
        await ctx.db.delete(agentInventory._id);
      } else {
        await ctx.db.patch(agentInventory._id, { quantity: newQty, updatedAt: movedAt });
      }

      // Create stock movement
      const resolved = await resolveAgentPrice(ctx, sellerId, lineItem.productId, stockModel);
      await ctx.db.insert("stockMovements", {
        batchId: item.batchId,
        productId: lineItem.productId,
        fromPartyType: "agent",
        fromPartyId: sellerId,
        toPartyType: "customer",
        quantity: item.quantity,
        movedAt,
        recordedBy: userId,
        salePrice: Math.round(unitPrice * item.quantity * 100) / 100,
        unitPrice: Math.round(unitPrice * 100) / 100,
        saleId: args.saleId,
        stockModel,
        hqUnitPrice: Math.round(resolved.hqUnitPrice * 100) / 100,
      });

      // Update line item
      updatedLineItems[item.lineItemIndex] = {
        ...lineItem,
        fulfilledQuantity: alreadyFulfilled + item.quantity,
        batchId: item.batchId,
        fulfillmentSource: "agent_stock",
        fulfilledAt: movedAt,
      };
    }

    // Recalculate sale-level fulfillment status
    const allFulfilled = updatedLineItems.every(
      (li) => (li.fulfilledQuantity ?? 0) >= li.quantity
    );
    const anyFulfilled = updatedLineItems.some(
      (li) => (li.fulfilledQuantity ?? 0) > 0
    );

    const newStatus = allFulfilled
      ? "fulfilled" as const
      : anyFulfilled
        ? "partial" as const
        : "pending_stock" as const;

    await ctx.db.patch(args.saleId, {
      lineItems: updatedLineItems,
      fulfillmentStatus: newStatus,
      fulfilledAt: allFulfilled ? movedAt : undefined,
    });
  },
});

// Admin: transfer HQ stock to agent and immediately fulfill pending sale items
// Transfer HQ stock to agent (does NOT mark sale line items as fulfilled).
// Agent must fulfill from their inventory later using fulfillLineItems.
export const hqTransferToAgent = mutation({
  args: {
    agentId: v.id("users"),
    items: v.array(
      v.object({
        productId: v.id("products"),
        batchId: v.id("batches"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const movedAt = Date.now();

    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantity must be positive");

      const batch = await ctx.db.get(item.batchId);
      if (!batch) throw new Error("Batch not found");
      if (batch.productId !== item.productId) throw new Error("Batch/product mismatch");

      // 1. Deduct from business inventory
      const businessInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
          q.eq("batchId", item.batchId).eq("heldByType", "business")
        )
        .unique();

      if (!businessInventory || businessInventory.quantity < item.quantity) {
        throw new Error("Insufficient HQ inventory");
      }

      const newBizQty = businessInventory.quantity - item.quantity;
      if (newBizQty === 0) {
        await ctx.db.delete(businessInventory._id);
      } else {
        await ctx.db.patch(businessInventory._id, { quantity: newBizQty, updatedAt: movedAt });
      }

      // 2. Determine stock model from agent profile
      const agentProfile = await ctx.db
        .query("agentProfiles")
        .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
        .unique();
      const stockModel = agentProfile?.defaultStockModel ?? "hold_paid";
      const inventoryStockModel =
        stockModel === "hold_paid" || stockModel === "consignment"
          ? stockModel
          : undefined;

      // 3. Credit agent inventory (keyed by batch + agent + stockModel)
      const agentInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById_and_stockModel", (q) =>
          q.eq("batchId", item.batchId).eq("heldByType", "agent").eq("heldById", args.agentId).eq("stockModel", inventoryStockModel)
        )
        .unique();

      if (agentInventory) {
        await ctx.db.patch(agentInventory._id, {
          quantity: agentInventory.quantity + item.quantity,
          updatedAt: movedAt,
        });
      } else {
        await ctx.db.insert("inventory", {
          batchId: item.batchId,
          productId: item.productId,
          heldByType: "agent",
          heldById: args.agentId,
          quantity: item.quantity,
          stockModel: inventoryStockModel,
          updatedAt: movedAt,
        });
      }

      const resolved = await resolveAgentPrice(ctx, args.agentId, item.productId, stockModel);

      // 4. Create B2B stock movement (HQ → agent)
      await ctx.db.insert("stockMovements", {
        batchId: item.batchId,
        productId: item.productId,
        fromPartyType: "business",
        toPartyType: "agent",
        toPartyId: args.agentId,
        quantity: item.quantity,
        movedAt,
        recordedBy: admin._id,
        stockModel,
        hqUnitPrice: Math.round(resolved.hqUnitPrice * 100) / 100,
      });
    }
  },
});

// Keep backward compat alias
export const hqTransferAndFulfill = hqTransferToAgent;

// Agent: pull stock from HQ and fulfill pending sale line items in one step.
// Creates two stock movements per item: business→agent and agent→customer.
// Net inventory effect: business inventory decreases, agent inventory unchanged.
export const selfFulfillFromHQ = mutation({
  args: {
    saleId: v.id("sales"),
    items: v.array(
      v.object({
        lineItemIndex: v.number(),
        batchId: v.id("batches"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found");
    if (sale.fulfillmentStatus === "fulfilled") {
      throw new Error("Sale is already fully fulfilled");
    }
    // Only salespersons (HQ employees) can self-fulfill from HQ — not agents
    if (user.role !== "sales") {
      throw new Error("Only salespersons can pull stock directly from HQ");
    }
    if (sale.sellerId !== userId) {
      throw new Error("Not authorized — only the seller can self-fulfill from HQ");
    }
    if (!sale.lineItems) throw new Error("Sale has no line items");

    const movedAt = Date.now();
    const unitPrice = sale.totalAmount / sale.totalQuantity;
    const stockModel = sale.stockModel ?? "hold_paid";
    const sellerId = sale.sellerId!;

    // Get agent profile for stock model on the HQ→agent movement
    const agentProfile = await ctx.db
      .query("agentProfiles")
      .withIndex("by_agentId", (q) => q.eq("agentId", sellerId))
      .unique();
    const agentStockModel = agentProfile?.defaultStockModel ?? "hold_paid";

    const updatedLineItems = [...sale.lineItems];

    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantity must be positive");
      if (item.lineItemIndex < 0 || item.lineItemIndex >= updatedLineItems.length) {
        throw new Error(`Invalid line item index: ${item.lineItemIndex}`);
      }

      const lineItem = updatedLineItems[item.lineItemIndex];
      const alreadyFulfilled = lineItem.fulfilledQuantity ?? 0;
      const remaining = lineItem.quantity - alreadyFulfilled;
      if (item.quantity > remaining) {
        throw new Error(
          `Cannot fulfill ${item.quantity}, only ${remaining} remaining for line item ${item.lineItemIndex}`
        );
      }

      const batch = await ctx.db.get(item.batchId);
      if (!batch) throw new Error("Batch not found");
      if (batch.productId !== lineItem.productId) {
        throw new Error("Batch/product mismatch");
      }

      // 1. Deduct from business (HQ) inventory
      const businessInventory = await ctx.db
        .query("inventory")
        .withIndex("by_batchId_and_heldByType_and_heldById", (q) =>
          q.eq("batchId", item.batchId).eq("heldByType", "business")
        )
        .unique();

      if (!businessInventory || businessInventory.quantity < item.quantity) {
        throw new Error("Insufficient HQ inventory");
      }

      const newBizQty = businessInventory.quantity - item.quantity;
      if (newBizQty === 0) {
        await ctx.db.delete(businessInventory._id);
      } else {
        await ctx.db.patch(businessInventory._id, {
          quantity: newBizQty,
          updatedAt: movedAt,
        });
      }

      // Resolve pricing
      const resolved = await resolveAgentPrice(ctx, sellerId, lineItem.productId, stockModel);

      // 2. Stock movement: business → agent (the "pull" from HQ)
      await ctx.db.insert("stockMovements", {
        batchId: item.batchId,
        productId: lineItem.productId,
        fromPartyType: "business",
        toPartyType: "agent",
        toPartyId: sellerId,
        quantity: item.quantity,
        movedAt,
        recordedBy: userId,
        saleId: args.saleId,
        stockModel: agentStockModel,
        hqUnitPrice: Math.round(resolved.hqUnitPrice * 100) / 100,
      });

      // 3. Stock movement: agent → customer (the fulfillment)
      await ctx.db.insert("stockMovements", {
        batchId: item.batchId,
        productId: lineItem.productId,
        fromPartyType: "agent",
        fromPartyId: sellerId,
        toPartyType: "customer",
        quantity: item.quantity,
        movedAt,
        recordedBy: userId,
        salePrice: Math.round(unitPrice * item.quantity * 100) / 100,
        unitPrice: Math.round(unitPrice * 100) / 100,
        saleId: args.saleId,
        stockModel,
        hqUnitPrice: Math.round(resolved.hqUnitPrice * 100) / 100,
      });

      // 4. Update line item
      updatedLineItems[item.lineItemIndex] = {
        ...lineItem,
        fulfilledQuantity: alreadyFulfilled + item.quantity,
        batchId: item.batchId,
        fulfillmentSource: "agent_stock",
        fulfilledAt: movedAt,
      };
    }

    // Recalculate sale-level fulfillment status
    const allFulfilled = updatedLineItems.every(
      (li) => (li.fulfilledQuantity ?? 0) >= li.quantity
    );
    const anyFulfilled = updatedLineItems.some(
      (li) => (li.fulfilledQuantity ?? 0) > 0
    );
    const newStatus = allFulfilled
      ? "fulfilled" as const
      : anyFulfilled
        ? "partial" as const
        : "pending_stock" as const;

    await ctx.db.patch(args.saleId, {
      lineItems: updatedLineItems,
      fulfillmentStatus: newStatus,
      fulfilledAt: allFulfilled ? movedAt : undefined,
    });
  },
});

// Admin: list all pending fulfillment sales (includes partial)
export const listPendingFulfillment = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const pendingStock = await ctx.db
      .query("sales")
      .withIndex("by_fulfillmentStatus_and_saleDate", (q) =>
        q.eq("fulfillmentStatus", "pending_stock")
      )
      .order("desc")
      .take(100);
    const partial = await ctx.db
      .query("sales")
      .withIndex("by_fulfillmentStatus_and_saleDate", (q) =>
        q.eq("fulfillmentStatus", "partial")
      )
      .order("desc")
      .take(100);
    return [...pendingStock, ...partial].sort((a, b) => b.saleDate - a.saleDate);
  },
});

// Agent: list own pending fulfillment sales (includes partial)
export const listMyPendingFulfillment = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_sellerId_and_saleDate", (q) => q.eq("sellerId", userId))
      .order("desc")
      .take(200);
    return sales.filter(
      (s) => s.fulfillmentStatus === "pending_stock" || s.fulfillmentStatus === "partial"
    );
  },
});

// Admin: fulfillment dashboard data with enriched info
export const getPendingFulfillmentDashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const pendingStock = await ctx.db
      .query("sales")
      .withIndex("by_fulfillmentStatus_and_saleDate", (q) =>
        q.eq("fulfillmentStatus", "pending_stock")
      )
      .order("desc")
      .take(100);
    const partial = await ctx.db
      .query("sales")
      .withIndex("by_fulfillmentStatus_and_saleDate", (q) =>
        q.eq("fulfillmentStatus", "partial")
      )
      .order("desc")
      .take(100);

    const allPendingSales = [...pendingStock, ...partial].sort(
      (a, b) => b.saleDate - a.saleDate
    );

    // Collect all unique product IDs and seller IDs for enrichment
    const productIds = new Set<string>();
    const sellerIds = new Set<string>();
    for (const sale of allPendingSales) {
      if (sale.sellerId) sellerIds.add(sale.sellerId);
      if (sale.lineItems) {
        for (const li of sale.lineItems) {
          productIds.add(li.productId);
        }
      }
    }

    // Batch-fetch products and sellers
    const productMap = new Map<string, { name: string; status: string }>();
    for (const pid of productIds) {
      const product = await ctx.db.get(pid as Id<"products">);
      if (product) productMap.set(pid, { name: product.name, status: product.status });
    }
    const sellerMap = new Map<string, string>();
    for (const sid of sellerIds) {
      const seller = await ctx.db.get(sid as Id<"users">);
      if (seller) sellerMap.set(sid, seller.nickname ?? seller.name ?? seller.email ?? "Unknown");
    }

    // Check business inventory availability per product
    const businessInventoryByProduct = new Map<string, { batchId: Id<"batches">; batchCode: string; quantity: number }[]>();
    for (const pid of productIds) {
      const inventoryRecords = await ctx.db
        .query("inventory")
        .withIndex("by_productId", (q) => q.eq("productId", pid as Id<"products">))
        .take(50);
      const bizRecords = inventoryRecords.filter((r) => r.heldByType === "business" && r.quantity > 0);
      const enriched: { batchId: Id<"batches">; batchCode: string; quantity: number }[] = [];
      for (const rec of bizRecords) {
        const batch = await ctx.db.get(rec.batchId);
        if (batch && batch.status === "available") {
          enriched.push({ batchId: rec.batchId, batchCode: batch.batchCode, quantity: rec.quantity });
        }
      }
      if (enriched.length > 0) {
        businessInventoryByProduct.set(pid, enriched);
      }
    }

    // Build dashboard items
    type DashboardItem = {
      saleId: Id<"sales">;
      lineItemIndex: number;
      productId: Id<"products">;
      productName: string;
      quantity: number;
      fulfilledQuantity: number;
      fulfillmentSource: string;
      sellerId: Id<"users"> | undefined;
      sellerName: string;
      customerName: string;
      saleDate: number;
      stockModel: string;
      availableBatches: { batchId: Id<"batches">; batchCode: string; quantity: number }[];
      category: "ready" | "awaiting_stock" | "future_release";
    };

    const items: DashboardItem[] = [];
    for (const sale of allPendingSales) {
      if (!sale.lineItems) continue;
      for (let i = 0; i < sale.lineItems.length; i++) {
        const li = sale.lineItems[i];
        const fulfilled = li.fulfilledQuantity ?? 0;
        if (fulfilled >= li.quantity) continue; // already done

        const source = li.fulfillmentSource ?? "pending_batch";
        const product = productMap.get(li.productId);
        const available = businessInventoryByProduct.get(li.productId) ?? [];

        let category: "ready" | "awaiting_stock" | "future_release";
        if (source === "future_release" || product?.status === "future_release") {
          category = available.length > 0 ? "ready" : "future_release";
        } else if (available.length > 0) {
          category = "ready";
        } else {
          category = "awaiting_stock";
        }

        items.push({
          saleId: sale._id,
          lineItemIndex: i,
          productId: li.productId as Id<"products">,
          productName: product?.name ?? "Unknown",
          quantity: li.quantity,
          fulfilledQuantity: fulfilled,
          fulfillmentSource: source,
          sellerId: sale.sellerId,
          sellerName: sale.sellerId ? (sellerMap.get(sale.sellerId) ?? "Unknown") : "Unknown",
          customerName: sale.customerDetail?.name ?? "Unknown",
          saleDate: sale.saleDate,
          stockModel: sale.stockModel ?? "hold_paid",
          availableBatches: available,
          category,
        });
      }
    }

    return items;
  },
});

// Get available stock info for a specific pending sale
export const getAvailableStockForPending = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found");
    if (!sale.lineItems) return [];

    const result: {
      lineItemIndex: number;
      productId: Id<"products">;
      productName: string;
      quantity: number;
      fulfilledQuantity: number;
      fulfillmentSource: string;
      availableBatches: { batchId: Id<"batches">; batchCode: string; quantity: number; holder: string }[];
    }[] = [];

    for (let i = 0; i < sale.lineItems.length; i++) {
      const li = sale.lineItems[i];
      const fulfilled = li.fulfilledQuantity ?? 0;
      if (fulfilled >= li.quantity) continue;

      const product = await ctx.db.get(li.productId);

      // Check business inventory
      const bizInventory = await ctx.db
        .query("inventory")
        .withIndex("by_productId", (q) => q.eq("productId", li.productId))
        .take(50);

      const batches: { batchId: Id<"batches">; batchCode: string; quantity: number; holder: string }[] = [];
      for (const inv of bizInventory) {
        if (inv.quantity <= 0) continue;
        const batch = await ctx.db.get(inv.batchId);
        if (!batch || batch.status !== "available") continue;
        batches.push({
          batchId: inv.batchId,
          batchCode: batch.batchCode,
          quantity: inv.quantity,
          holder: inv.heldByType === "business" ? "HQ" : "Agent",
        });
      }

      // If seller has agent inventory, include that too
      if (sale.sellerId) {
        const agentInv = await ctx.db
          .query("inventory")
          .withIndex("by_heldByType_and_heldById", (q) =>
            q.eq("heldByType", "agent").eq("heldById", sale.sellerId!)
          )
          .take(50);
        for (const inv of agentInv) {
          if (inv.productId !== li.productId || inv.quantity <= 0) continue;
          const batch = await ctx.db.get(inv.batchId);
          if (!batch || batch.status !== "available") continue;
          // Avoid duplicates
          if (!batches.some((b) => b.batchId === inv.batchId && b.holder === "Agent")) {
            batches.push({
              batchId: inv.batchId,
              batchCode: batch.batchCode,
              quantity: inv.quantity,
              holder: "Agent",
            });
          }
        }
      }

      result.push({
        lineItemIndex: i,
        productId: li.productId,
        productName: product?.name ?? "Unknown",
        quantity: li.quantity,
        fulfilledQuantity: fulfilled,
        fulfillmentSource: li.fulfillmentSource ?? "pending_batch",
        availableBatches: batches,
      });
    }

    return result;
  },
});
