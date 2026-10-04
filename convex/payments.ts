import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { findOrder } from "./checkout";
import { orderPageUrl } from "./helpers/checkout";
import { PROVIDERS, type LookupResult, type ProviderId } from "./helpers/payments";

/*
 * Taking payment for storefront orders.
 *
 *   shopper ──start──▶ provider page ──pays──▶ provider
 *                                                 │ callback (a hint only)
 *   order page ◀──return── provider               ▼
 *        │ refresh                            reconcile ──lookup──▶ provider
 *        └──────────────────────────────────────▶ applyResult (the only writer
 *                                                 that marks anything paid)
 *
 * `start` and `refresh` are PUBLIC and take the order's accessKey.
 */

const providerArg = v.literal("toyyibpay");
const MAX_ATTEMPTS = 10;
/** Reuse an unpaid bill rather than open a new one, while it's still live. */
const REUSE_WINDOW_MS = 20 * 60 * 60 * 1000;

const lookupResult = v.union(
  v.object({
    status: v.literal("paid"),
    amountReceived: v.number(),
    transactionId: v.optional(v.string()),
    channel: v.optional(v.string()),
  }),
  v.object({ status: v.literal("pending") }),
  v.object({ status: v.literal("failed"), reason: v.optional(v.string()) })
);

/* --------------------------------- Public --------------------------------- */

/** Sends the shopper to pay. Returns the provider's payment page. */
export const start = action({
  args: { orderNumber: v.string(), accessKey: v.string(), provider: providerArg },
  handler: async (ctx, args): Promise<{ redirectUrl: string }> => {
    const provider = PROVIDERS[args.provider];
    if (!provider.configured()) {
      throw new ConvexError("This payment method isn't available right now.");
    }

    const begun = await ctx.runMutation(internal.payments.begin, args);
    if (begun.kind === "reuse") return { redirectUrl: begun.redirectUrl };

    const { order, paymentId } = begun;
    try {
      const { reference, redirectUrl } = await provider.create({
        orderNumber: order.orderNumber,
        amount: order.total,
        customer: order.customer,
        description: order.lines.map((l) => `${l.quantity} x ${l.productName} ${l.variantName}`).join(" "),
        returnUrl: orderPageUrl(order),
        callbackUrl: `${process.env.CONVEX_SITE_URL}/payments/${provider.id}/callback`,
      });
      await ctx.runMutation(internal.payments.attach, { paymentId, reference, redirectUrl });
      return { redirectUrl };
    } catch (error) {
      console.error(`Could not open a ${provider.id} payment for ${order.orderNumber}`, error);
      await ctx.runMutation(internal.payments.applyResult, {
        paymentId,
        result: { status: "failed", reason: "Could not reach the payment provider." },
      });
      throw new ConvexError("We couldn't reach the payment provider. Please try again in a moment.");
    }
  },
});

/**
 * Asks the provider how the shopper's payments went. The order page calls
 * this when the shopper lands back from the provider, so they see the result
 * even if the provider's callback is slow or never comes.
 */
export const refresh = action({
  args: { orderNumber: v.string(), accessKey: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const payments = await ctx.runQuery(internal.payments.listOpen, args);
    await Promise.all(payments.map((p) => check(ctx, p)));
    return null;
  },
});

/* -------------------------------- Internal -------------------------------- */

type OpenPayment = { _id: Id<"payments">; provider: ProviderId; reference: string };

async function check(ctx: ActionCtx, payment: OpenPayment) {
  let result: LookupResult;
  try {
    result = await PROVIDERS[payment.provider].lookup(payment.reference);
  } catch (error) {
    // Leave it open; the next callback, refresh or expiry sweep retries.
    console.error(`Lookup failed for ${payment.provider} ${payment.reference}`, error);
    return;
  }
  await ctx.runMutation(internal.payments.applyResult, { paymentId: payment._id, result });
}

/** Re-checks one payment with its provider. Callbacks and sweeps land here. */
export const reconcile = internalAction({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const payment = await ctx.runQuery(internal.payments.getOpen, args);
    if (payment) await check(ctx, payment);
  },
});

export const begin = internalMutation({
  args: { orderNumber: v.string(), accessKey: v.string(), provider: providerArg },
  handler: async (
    ctx,
    args
  ): Promise<
    | { kind: "reuse"; redirectUrl: string }
    | { kind: "new"; paymentId: Id<"payments">; order: Doc<"orders"> }
  > => {
    const order = await findOrder(ctx, args.orderNumber, args.accessKey);
    if (!order) throw new ConvexError("Order not found.");
    if (order.status !== "awaiting_payment") {
      throw new ConvexError(
        order.status === "expired"
          ? "This order has lapsed. Please place it again."
          : "This order is not awaiting payment."
      );
    }
    const now = Date.now();
    if (order.expiresAt <= now) throw new ConvexError("This order has lapsed. Please place it again.");

    const attempts = await ctx.db
      .query("payments")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .order("desc")
      .take(MAX_ATTEMPTS);

    const reusable = attempts.find(
      (p) =>
        p.provider === args.provider &&
        (p.status === "pending" || p.status === "failed") &&
        p.redirectUrl &&
        p.amount === order.total &&
        now - p.createdAt < REUSE_WINDOW_MS
    );
    if (reusable?.redirectUrl) return { kind: "reuse", redirectUrl: reusable.redirectUrl };

    if (attempts.length >= MAX_ATTEMPTS) {
      throw new ConvexError("Too many payment attempts on this order. Please message us.");
    }

    const paymentId = await ctx.db.insert("payments", {
      orderId: order._id,
      provider: args.provider,
      status: "created",
      amount: order.total,
      createdAt: now,
      updatedAt: now,
    });
    return { kind: "new", paymentId, order };
  },
});

export const attach = internalMutation({
  args: { paymentId: v.id("payments"), reference: v.string(), redirectUrl: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, {
      status: "pending",
      reference: args.reference,
      redirectUrl: args.redirectUrl,
      updatedAt: Date.now(),
    });
  },
});

/** Payments on an order that the provider could still settle. */
export const listOpen = internalQuery({
  args: { orderNumber: v.string(), accessKey: v.string() },
  handler: async (ctx, args): Promise<OpenPayment[]> => {
    const order = await findOrder(ctx, args.orderNumber, args.accessKey);
    if (!order) return [];
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .order("desc")
      .take(MAX_ATTEMPTS);
    return payments.flatMap((p) => (asOpen(p) ? [asOpen(p)!] : []));
  },
});

export const getOpen = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args): Promise<OpenPayment | null> => {
    const payment = await ctx.db.get(args.paymentId);
    return payment ? asOpen(payment) : null;
  },
});

export const findByReference = internalQuery({
  args: { provider: providerArg, reference: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_provider_and_reference", (q) =>
        q.eq("provider", args.provider).eq("reference", args.reference)
      )
      .first();
    return payment?._id ?? null;
  },
});

function asOpen(p: Doc<"payments">): OpenPayment | null {
  // A failed ToyyibPay bill can still be paid on a retry, so it stays open.
  if (p.provider === "manual" || !p.reference) return null;
  if (p.status !== "pending" && p.status !== "failed") return null;
  return { _id: p._id, provider: p.provider, reference: p.reference };
}

/**
 * The one place a provider's answer changes anything. Idempotent: callbacks,
 * refreshes and sweeps can all report the same payment.
 */
export const applyResult = internalMutation({
  args: { paymentId: v.id("payments"), result: lookupResult },
  handler: async (ctx, { paymentId, result }) => {
    const payment = await ctx.db.get(paymentId);
    if (!payment || payment.status === "paid" || payment.status === "needs_review") return;
    const now = Date.now();

    if (result.status === "pending") return;

    if (result.status === "failed") {
      if (payment.status !== "failed" || payment.failureReason !== result.reason) {
        await ctx.db.patch(paymentId, { status: "failed", failureReason: result.reason, updatedAt: now });
      }
      return;
    }

    const order = await ctx.db.get(payment.orderId);
    if (!order) throw new Error(`Payment ${paymentId} has no order`);

    const received = {
      amountReceived: result.amountReceived,
      providerTransactionId: result.transactionId,
      channel: result.channel,
      updatedAt: now,
    };

    if (Math.round(result.amountReceived * 100) !== Math.round(payment.amount * 100)) {
      await ctx.db.patch(paymentId, { ...received, status: "needs_review" });
      await flag(
        ctx,
        order,
        `${payment.provider} reported RM${result.amountReceived.toFixed(2)} on ${payment.reference}, expected RM${payment.amount.toFixed(2)}.`
      );
      return;
    }

    await ctx.db.patch(paymentId, { ...received, status: "paid", paidAt: now, failureReason: undefined });

    if (order.status === "awaiting_payment" || order.status === "expired") {
      // Money that arrives late still counts: a lapsed order is revived.
      await ctx.db.patch(order._id, { status: "paid", paidAt: now, updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.emails.sendOrderPaid, { orderId: order._id });
    } else if (order.status === "cancelled") {
      await flag(ctx, order, `Paid after it was cancelled (${payment.reference}). Refund or fulfil it.`);
    } else {
      await flag(ctx, order, `Paid twice — ${payment.reference} is a second payment. Refund one.`);
    }
  },
});

async function flag(
  ctx: MutationCtx,
  order: Doc<"orders">,
  message: string
) {
  const needsAttention = order.needsAttention ? `${order.needsAttention}\n${message}` : message;
  await ctx.db.patch(order._id, { needsAttention, updatedAt: Date.now() });
}
