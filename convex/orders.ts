import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireRole } from "./helpers/auth";
import { cleanText } from "./helpers/checkout";

/*
 * Storefront orders, from HQ's side. Every public function here is admin-only;
 * the shopper-facing ones live in checkout.ts and payments.ts.
 */

/** The access key is the shopper's secret; HQ never needs it. */
function withoutKey(order: Doc<"orders">): Omit<Doc<"orders">, "accessKey"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessKey: _accessKey, ...rest } = order;
  return rest;
}

const statusArg = v.union(
  v.literal("awaiting_payment"),
  v.literal("paid"),
  v.literal("shipped"),
  v.literal("delivered"),
  v.literal("cancelled"),
  v.literal("expired")
);

export const list = query({
  args: { status: v.optional(statusArg) },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const status = args.status;
    const orders = status
      ? await ctx.db
          .query("orders")
          .withIndex("by_status_and_expiresAt", (q) => q.eq("status", status))
          .order("desc")
          .take(200)
      : await ctx.db.query("orders").order("desc").take(200);
    return orders.map(withoutKey);
  },
});

export const get = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .order("desc")
      .take(20);
    return { ...withoutKey(order), payments };
  },
});

/** For payments that didn't go through a gateway: bank transfer, DuitNow… */
export const recordManualPayment = mutation({
  args: { orderId: v.id("orders"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (order.status !== "awaiting_payment" && order.status !== "expired") {
      throw new ConvexError("Only unpaid orders can be marked paid.");
    }
    const now = Date.now();
    await ctx.db.insert("payments", {
      orderId: order._id,
      provider: "manual",
      status: "paid",
      amount: order.total,
      amountReceived: order.total,
      reference: cleanText(args.note, "Note", { max: 120, required: false }),
      recordedBy: admin._id,
      createdAt: now,
      updatedAt: now,
      paidAt: now,
    });
    await ctx.db.patch(order._id, { status: "paid", paidAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.emails.sendOrderPaid, { orderId: order._id });
  },
});

export const markShipped = mutation({
  args: { orderId: v.id("orders"), courier: v.string(), trackingNumber: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (order.status !== "paid" && order.status !== "shipped") {
      throw new ConvexError("Only paid orders can be shipped.");
    }
    const now = Date.now();
    const resend = order.status === "shipped";
    await ctx.db.patch(order._id, {
      status: "shipped",
      courier: cleanText(args.courier, "Courier", { max: 60 }),
      trackingNumber: cleanText(args.trackingNumber, "Tracking number", { max: 60 }),
      shippedAt: order.shippedAt ?? now,
      updatedAt: now,
    });
    // Correcting a typo in the tracking number re-sends the email, on purpose.
    await ctx.scheduler.runAfter(0, internal.emails.sendOrderShipped, { orderId: order._id, resend });
  },
});

export const markDelivered = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (order.status !== "shipped") throw new ConvexError("Only shipped orders can be marked delivered.");
    const now = Date.now();
    await ctx.db.patch(order._id, { status: "delivered", deliveredAt: now, updatedAt: now });
  },
});

export const cancel = mutation({
  args: { orderId: v.id("orders"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (order.status === "shipped" || order.status === "delivered" || order.status === "cancelled") {
      throw new ConvexError(`A ${order.status} order can't be cancelled.`);
    }
    const now = Date.now();
    await ctx.db.patch(order._id, {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: admin._id,
      cancellationReason: cleanText(args.reason, "Reason", { max: 300 }),
      updatedAt: now,
    });
  },
});

/** Every flagged order, however old — the list views only reach back 200. */
export const listNeedingAttention = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    // Unset sorts before every string, so this skips unflagged orders.
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_needsAttention", (q) => q.gt("needsAttention", ""))
      .take(100);
    return orders.map(withoutKey);
  },
});

/** Clears the "needs attention" flag once someone has dealt with it. */
export const resolveAttention = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    await ctx.db.patch(order._id, { needsAttention: undefined, updatedAt: Date.now() });
  },
});

/**
 * Accepts a payment the provider reported with the wrong amount, once HQ has
 * checked it — e.g. the shopper paid the right total in two goes.
 */
export const acceptPayment = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new ConvexError("Payment not found");
    if (payment.status !== "needs_review") throw new ConvexError("Only payments under review can be accepted.");
    const order = await ctx.db.get(payment.orderId);
    if (!order) throw new ConvexError("Order not found");

    const now = Date.now();
    await ctx.db.patch(payment._id, { status: "paid", paidAt: now, updatedAt: now });
    if (order.status === "awaiting_payment" || order.status === "expired") {
      await ctx.db.patch(order._id, { status: "paid", paidAt: now, updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.emails.sendOrderPaid, { orderId: order._id });
    }
  },
});

/** Undoes a cancellation when the shopper paid anyway and HQ will ship. */
export const reinstate = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (order.status !== "cancelled") throw new ConvexError("Only cancelled orders can be reinstated.");

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .take(20);
    const paid = payments.find((p) => p.status === "paid");
    if (!paid) throw new ConvexError("This order has no confirmed payment, so there's nothing to ship.");

    await ctx.db.patch(order._id, {
      status: "paid",
      paidAt: order.paidAt ?? paid.paidAt ?? Date.now(),
      cancelledAt: undefined,
      cancelledBy: undefined,
      cancellationReason: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Links an order to the sale HQ recorded for it. */
export const linkSale = mutation({
  args: { orderId: v.id("orders"), saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const [order, sale] = await Promise.all([ctx.db.get(args.orderId), ctx.db.get(args.saleId)]);
    if (!order) throw new ConvexError("Order not found");
    if (!sale) throw new ConvexError("Sale not found");
    await ctx.db.patch(order._id, { saleId: sale._id, updatedAt: Date.now() });
  },
});

/* -------------------------------- Internal -------------------------------- */

export const getInternal = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => await ctx.db.get(args.orderId),
});

const SWEEP_BATCH = 50;

/**
 * Lapses unpaid orders past their expiry. Any bill still open gets one last
 * check with its provider — if the money did arrive, `applyResult` revives
 * the order.
 */
export const expireStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("orders")
      .withIndex("by_status_and_expiresAt", (q) =>
        q.eq("status", "awaiting_payment").lt("expiresAt", now)
      )
      .take(SWEEP_BATCH);

    for (const order of stale) {
      await ctx.db.patch(order._id, { status: "expired", updatedAt: now });
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(20);
      for (const p of payments) {
        if (p.reference && (p.status === "pending" || p.status === "failed")) {
          await ctx.scheduler.runAfter(0, internal.payments.reconcile, { paymentId: p._id });
        }
      }
    }

    if (stale.length === SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.orders.expireStale, {});
    }
  },
});
