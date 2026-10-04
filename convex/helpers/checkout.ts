import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Pricing and validation for storefront orders. The storefront shows what
 * `checkout:quote` returns and `checkout:placeOrder` charges the same numbers,
 * so nothing the browser sends about money is ever trusted.
 */

// ⚠ Confirm these before taking real orders — they are promises to customers.
export const SHIPPING = {
  west: 8, // RM, Peninsular Malaysia
  east: 15, // RM, Sabah, Sarawak and Labuan
  freeOver: 200, // RM spent on goods (after any offer) at or above which shipping is free
};

export const MAX_LINES = 20;
export const MAX_QUANTITY = 10;
/** How long an unpaid order holds before it lapses. */
export const ORDER_TTL_MS = 25 * 60 * 60 * 1000; // ToyyibPay bills live 1 day

export const STATES = {
  Johor: "west",
  Kedah: "west",
  Kelantan: "west",
  Melaka: "west",
  "Negeri Sembilan": "west",
  Pahang: "west",
  Perak: "west",
  Perlis: "west",
  "Pulau Pinang": "west",
  Selangor: "west",
  Terengganu: "west",
  "Kuala Lumpur": "west",
  Putrajaya: "west",
  Sabah: "east",
  Sarawak: "east",
  Labuan: "east",
} as const;

export type MalaysianState = keyof typeof STATES;
export type ShippingZone = "west" | "east";

export function zoneFor(state: string): ShippingZone | null {
  return state in STATES ? STATES[state as MalaysianState] : null;
}

/** Money is kept in sen while adding up, so RM 0.1 + 0.2 stays 0.30. */
const toSen = (rm: number) => Math.round(rm * 100);
const toRm = (sen: number) => sen / 100;

export function shippingFee(subtotal: number, zone: ShippingZone): number {
  if (toSen(subtotal) >= toSen(SHIPPING.freeOver)) return 0;
  return SHIPPING[zone];
}

export type CartItem = { variantId: Id<"productVariants">; quantity: number };

export type PricedLine = Doc<"orders">["lines"][number];

export type Unavailable = { variantId: Id<"productVariants">; reason: string };

/** The deal taken off an order, snapshotted onto it. */
export type AppliedOffer = NonNullable<Doc<"orders">["discount"]>;

/** "Add 1 more for 3 for RM100" — what the cart is short of a bundle. */
export type OfferHint = { name: string; minQuantity: number; bundlePrice: number; needed: number };

export type PricedCart = {
  lines: PricedLine[];
  unavailable: Unavailable[];
  /** Before any offer. */
  subtotal: number;
  discount: AppliedOffer | null;
  /** What the goods cost after the offer; shipping is worked out on this. */
  merchandise: number;
  offerHint: OfferHint | null;
};

/**
 * Prices a cart against the live catalog. Lines for the same variant are
 * merged; anything that can't be sold right now is returned separately
 * rather than silently dropped. The best offer a shopper is entitled to is
 * applied automatically.
 */
export async function priceCart(ctx: QueryCtx, items: CartItem[]): Promise<PricedCart> {
  if (items.length > MAX_LINES) {
    throw new ConvexError(`A cart can hold at most ${MAX_LINES} different items.`);
  }

  const merged = new Map<Id<"productVariants">, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new ConvexError("Quantities must be whole numbers of at least 1.");
    }
    merged.set(item.variantId, (merged.get(item.variantId) ?? 0) + item.quantity);
  }

  const lines: PricedLine[] = [];
  const unavailable: Unavailable[] = [];
  const collections = new Map<Id<"products">, string | undefined>();
  let subtotalSen = 0;

  for (const [variantId, quantity] of merged) {
    const variant = await ctx.db.get(variantId);
    // Agent-only sizes (testers, refills) are never sold to shoppers.
    if (!variant || variant.status !== "active" || variant.forWho === "agents") {
      unavailable.push({ variantId, reason: "This size is no longer sold." });
      continue;
    }
    const product = await ctx.db.get(variant.productId);
    if (!product || product.status !== "active") {
      unavailable.push({
        variantId,
        reason:
          product?.status === "future_release"
            ? `${product.name} isn't on sale yet.`
            : "This scent is no longer sold.",
      });
      continue;
    }
    if (quantity > MAX_QUANTITY) {
      throw new ConvexError(
        `You can order up to ${MAX_QUANTITY} of ${product.name} ${variant.name} at once. Message us for larger orders.`
      );
    }

    collections.set(product._id, product.collection);
    lines.push({
      productId: product._id,
      variantId: variant._id,
      productName: product.name,
      variantName: variant.name,
      sizeMl: variant.sizeMl,
      unitPrice: toRm(toSen(variant.price)),
      quantity,
    });
    subtotalSen += toSen(variant.price) * quantity;
  }

  const offers = await shopperOffers(ctx);
  const { discount, offerHint } = applyBestOffer(offers, lines, collections);
  const merchandiseSen = subtotalSen - (discount ? toSen(discount.amount) : 0);

  return {
    lines,
    unavailable,
    subtotal: toRm(subtotalSen),
    discount,
    merchandise: toRm(merchandiseSen),
    offerHint,
  };
}

/* --------------------------------- Offers --------------------------------- */
/*
 * Shoppers get the same bundle deals HQ sets up under Offers in the admin —
 * the ones meant for customers. An order takes at most one offer, as a sale
 * does; when several apply, the shopper gets whichever saves the most.
 */

/** Offers open to anonymous shoppers: active, in date, not agent-only. */
export async function shopperOffers(ctx: QueryCtx): Promise<Doc<"offers">[]> {
  const now = Date.now();
  const active = await ctx.db
    .query("offers")
    .withIndex("by_isActive", (q) => q.eq("isActive", true))
    .take(100);
  return active.filter(
    (o) =>
      o.forWho !== "agents" &&
      !(o.agentIds && o.agentIds.length > 0) &&
      (!o.startDate || now >= o.startDate) &&
      (!o.endDate || now <= o.endDate) &&
      o.minQuantity >= 2 &&
      o.bundlePrice > 0
  );
}

/** Which lines an offer covers. Same scoping rules as recording a sale. */
function covers(
  offer: Doc<"offers">,
  line: PricedLine,
  collections: Map<Id<"products">, string | undefined>
): boolean {
  let ok = true;
  if (offer.variantId) ok = line.variantId === offer.variantId;
  else if (offer.variantIds && offer.variantIds.length > 0) ok = offer.variantIds.includes(line.variantId);
  else if (offer.productId) ok = line.productId === offer.productId;
  else if (offer.productIds && offer.productIds.length > 0) ok = offer.productIds.includes(line.productId);
  else if (offer.collection) ok = collections.get(line.productId) === offer.collection;
  // Legacy variant-scoped offers already pin a size.
  const variantScoped = !!offer.variantId || !!(offer.variantIds && offer.variantIds.length > 0);
  if (ok && offer.sizeMl != null && !variantScoped) ok = line.sizeMl === offer.sizeMl;
  return ok;
}

export function applyBestOffer(
  offers: Doc<"offers">[],
  lines: PricedLine[],
  collections: Map<Id<"products">, string | undefined>
): { discount: AppliedOffer | null; offerHint: OfferHint | null } {
  let discount: AppliedOffer | null = null;
  let offerHint: OfferHint | null = null;
  const hints = new Map<Id<"offers">, OfferHint>();

  for (const offer of offers) {
    // One entry per bottle the offer covers, dearest first, so the bundle
    // takes the bottles it saves most on. (With equal prices — the usual
    // case — this is exactly how a recorded sale prices it.)
    const units = lines
      .filter((line) => covers(offer, line, collections))
      .flatMap((line) => Array<number>(line.quantity).fill(toSen(line.unitPrice)))
      .sort((a, b) => b - a);
    if (units.length === 0) continue;

    const bundles = Math.floor(units.length / offer.minQuantity);
    const bundledSen = units.slice(0, bundles * offer.minQuantity).reduce((sum, p) => sum + p, 0);
    const savingSen = bundledSen - bundles * toSen(offer.bundlePrice);
    if (bundles > 0 && savingSen > 0 && savingSen > toSen(discount?.amount ?? 0)) {
      discount = {
        offerId: offer._id,
        name: offer.name,
        minQuantity: offer.minQuantity,
        bundlePrice: offer.bundlePrice,
        amount: toRm(savingSen),
      };
    }

    const short = units.length % offer.minQuantity;
    if (short > 0) {
      const hint = { name: offer.name, minQuantity: offer.minQuantity, bundlePrice: offer.bundlePrice, needed: offer.minQuantity - short };
      hints.set(offer._id, hint);
      if (!offerHint || hint.needed < offerHint.needed) offerHint = hint;
    }
  }

  // Once a deal applies, only nudge towards more of that same deal.
  if (discount) offerHint = hints.get(discount.offerId) ?? null;

  return { discount, offerHint };
}

/**
 * The public face of an offer, for the storefront to advertise. `productIds`
 * is null when every scent counts.
 */
export async function offerSummary(ctx: QueryCtx, offer: Doc<"offers">) {
  let productIds: Id<"products">[] | null = null;
  if (offer.variantId || (offer.variantIds && offer.variantIds.length > 0)) {
    const ids = offer.variantIds && offer.variantIds.length > 0 ? offer.variantIds : [offer.variantId!];
    const variants = await Promise.all(ids.map((id) => ctx.db.get(id)));
    productIds = [...new Set(variants.filter((v) => v !== null).map((v) => v.productId))];
  } else if (offer.productId) {
    productIds = [offer.productId];
  } else if (offer.productIds && offer.productIds.length > 0) {
    productIds = offer.productIds;
  } else if (offer.collection) {
    const inCollection = await ctx.db
      .query("products")
      .withIndex("by_collection", (q) => q.eq("collection", offer.collection))
      .take(200);
    productIds = inCollection.map((p) => p._id);
  }
  return {
    name: offer.name,
    description: offer.description,
    minQuantity: offer.minQuantity,
    bundlePrice: offer.bundlePrice,
    sizeMl: offer.sizeMl ?? null,
    productIds,
  };
}

export function orderTotal(subtotal: number, fee: number): number {
  return toRm(toSen(subtotal) + toSen(fee));
}

/* ------------------------------- Validation ------------------------------- */

/** Trims, collapses runs of whitespace, and enforces a length. */
export function cleanText(
  value: string | undefined,
  field: string,
  { max, required = true }: { max: number; required?: boolean }
): string | undefined {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    if (required) throw new ConvexError(`${field} is required.`);
    return undefined;
  }
  if (cleaned.length > max) {
    throw new ConvexError(`${field} must be at most ${max} characters.`);
  }
  return cleaned;
}

export function cleanEmail(value: string): string {
  const email = cleanText(value, "Email", { max: 254 })!.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConvexError("Enter a valid email address.");
  }
  return email;
}

/** Normalises a Malaysian mobile or landline to "60…" without the plus. */
export function cleanPhone(value: string): string {
  const digits = value.replace(/[\s\-()+]/g, "");
  if (!/^\d+$/.test(digits)) throw new ConvexError("Enter a valid phone number.");
  const national = digits.startsWith("60") ? digits.slice(2) : digits.replace(/^0/, "");
  if (national.length < 8 || national.length > 10) {
    throw new ConvexError("Enter a valid Malaysian phone number.");
  }
  return `60${national}`;
}

export function cleanPostcode(value: string): string {
  const postcode = value.trim();
  if (!/^\d{5}$/.test(postcode)) throw new ConvexError("Postcode must be 5 digits.");
  return postcode;
}

/* --------------------------------- Codes ---------------------------------- */

// No 0/O, 1/I/L: order numbers get read out over WhatsApp.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newOrderNumber(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return `TM-${code}`;
}

export function newAccessKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Constant-time string comparison for secrets. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------------------------- Links --------------------------------- */

/** The shopper's order page. Also where payment providers send them back. */
export function orderPageUrl(order: { orderNumber: string; accessKey: string }): string {
  const base = process.env.STOREFRONT_URL;
  if (!base) throw new Error("STOREFRONT_URL is not set on this deployment");
  return `${base.replace(/\/$/, "")}/orders/${order.orderNumber}?key=${order.accessKey}`;
}
