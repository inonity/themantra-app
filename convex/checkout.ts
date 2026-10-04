import { query, mutation, type QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  MAX_LINES,
  MAX_QUANTITY,
  ORDER_TTL_MS,
  SHIPPING,
  STATES,
  cleanEmail,
  cleanPhone,
  cleanPostcode,
  cleanText,
  newAccessKey,
  newOrderNumber,
  offerSummary,
  orderTotal,
  priceCart,
  sameSecret,
  shippingFee,
  shopperOffers,
  zoneFor,
} from "./helpers/checkout";
import { PROVIDERS } from "./helpers/payments";

/*
 * Storefront checkout. These are deliberately PUBLIC — anonymous shoppers
 * call them from ../themantra-site. Nothing here trusts a price from the
 * browser, and nothing returns an order without its accessKey.
 */

const cartItems = v.array(
  v.object({ variantId: v.id("productVariants"), quantity: v.number() })
);

/** Everything the checkout page needs to know that isn't in the catalog. */
export const config = query({
  args: {},
  handler: async (ctx) => ({
    shipping: SHIPPING,
    states: Object.keys(STATES),
    maxLines: MAX_LINES,
    maxQuantity: MAX_QUANTITY,
    providers: Object.values(PROVIDERS)
      .filter((p) => p.configured())
      .map((p) => p.id),
    // Customer deals from Offers in the admin, for the storefront to show.
    offers: await Promise.all((await shopperOffers(ctx)).map((offer) => offerSummary(ctx, offer))),
  }),
});

/** Prices a cart. Pass `state` once the shopper has picked one. */
export const quote = query({
  args: { items: cartItems, state: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { lines, unavailable, subtotal, discount, merchandise, offerHint } = await priceCart(ctx, args.items);
    const zone = args.state ? zoneFor(args.state) : null;
    const fee = zone && lines.length > 0 ? shippingFee(merchandise, zone) : null;
    return {
      lines,
      unavailable,
      subtotal,
      discount: discount && { name: discount.name, amount: discount.amount },
      merchandise,
      offerHint,
      shippingFee: fee,
      total: fee === null ? null : orderTotal(merchandise, fee),
    };
  },
});

export const placeOrder = mutation({
  args: {
    items: cartItems,
    customer: v.object({ name: v.string(), email: v.string(), phone: v.string() }),
    shippingAddress: v.object({
      line1: v.string(),
      line2: v.optional(v.string()),
      city: v.string(),
      postcode: v.string(),
      state: v.string(),
    }),
    notes: v.optional(v.string()),
    // What the shopper saw. If the catalog moved underneath them, refuse
    // rather than charge a total they never agreed to.
    expectedTotal: v.number(),
  },
  handler: async (ctx, args) => {
    const zone = zoneFor(args.shippingAddress.state);
    if (!zone) throw new ConvexError("Choose a Malaysian state to ship to.");

    const { lines, unavailable, subtotal, discount, merchandise } = await priceCart(ctx, args.items);
    if (unavailable.length > 0) {
      throw new ConvexError("Some items in your bag are no longer available. Review your bag and try again.");
    }
    if (lines.length === 0) throw new ConvexError("Your bag is empty.");

    const fee = shippingFee(merchandise, zone);
    const total = orderTotal(merchandise, fee);
    if (Math.round(total * 100) !== Math.round(args.expectedTotal * 100)) {
      throw new ConvexError("Prices changed while you were checking out. Review the new total and try again.");
    }

    const customer = {
      name: cleanText(args.customer.name, "Name", { max: 80 })!,
      email: cleanEmail(args.customer.email),
      phone: cleanPhone(args.customer.phone),
    };
    const shippingAddress = {
      line1: cleanText(args.shippingAddress.line1, "Address", { max: 120 })!,
      line2: cleanText(args.shippingAddress.line2, "Address line 2", { max: 120, required: false }),
      city: cleanText(args.shippingAddress.city, "City", { max: 60 })!,
      postcode: cleanPostcode(args.shippingAddress.postcode),
      state: args.shippingAddress.state,
    };

    let orderNumber = newOrderNumber();
    // ~887M codes; a clash is unlikely, but never hand out a duplicate.
    for (let tries = 0; await findByNumber(ctx, orderNumber); tries++) {
      if (tries >= 5) throw new Error("Could not allocate an order number");
      orderNumber = newOrderNumber();
    }

    const now = Date.now();
    const accessKey = newAccessKey();
    await ctx.db.insert("orders", {
      orderNumber,
      accessKey,
      status: "awaiting_payment",
      customer,
      shippingAddress,
      shippingZone: zone,
      lines,
      subtotal,
      discount: discount ?? undefined,
      shippingFee: fee,
      total,
      notes: cleanText(args.notes, "Notes", { max: 500, required: false }),
      expiresAt: now + ORDER_TTL_MS,
      updatedAt: now,
    });

    return { orderNumber, accessKey };
  },
});

/** The shopper's view of their order: the confirmation and status page. */
export const getOrder = query({
  args: { orderNumber: v.string(), accessKey: v.string() },
  handler: async (ctx, args) => {
    const order = await findOrder(ctx, args.orderNumber, args.accessKey);
    if (!order) return null;

    const latest = await ctx.db
      .query("payments")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .order("desc")
      .first();

    // Projected: no internal ids beyond what the shopper already has.
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      placedAt: order._creationTime,
      expiresAt: order.expiresAt,
      customer: order.customer,
      shippingAddress: order.shippingAddress,
      lines: order.lines,
      subtotal: order.subtotal,
      discount: order.discount ? { name: order.discount.name, amount: order.discount.amount } : null,
      shippingFee: order.shippingFee,
      total: order.total,
      paidAt: order.paidAt,
      shippedAt: order.shippedAt,
      courier: order.courier,
      trackingNumber: order.trackingNumber,
      deliveredAt: order.deliveredAt,
      latestPayment: latest
        ? { provider: latest.provider, status: latest.status, failureReason: latest.failureReason }
        : null,
    };
  },
});

/* -------------------------------- Internals ------------------------------- */

async function findByNumber(ctx: QueryCtx, orderNumber: string): Promise<Doc<"orders"> | null> {
  return await ctx.db
    .query("orders")
    .withIndex("by_orderNumber", (q) => q.eq("orderNumber", orderNumber))
    .unique();
}

/** An order, but only for someone holding its key. */
export async function findOrder(
  ctx: QueryCtx,
  orderNumber: string,
  accessKey: string
): Promise<Doc<"orders"> | null> {
  const order = await findByNumber(ctx, orderNumber.trim().toUpperCase());
  if (!order || !sameSecret(order.accessKey, accessKey)) return null;
  return order;
}
