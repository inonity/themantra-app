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
  freeOver: 200, // RM subtotal at or above which shipping is free
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

/**
 * Prices a cart against the live catalog. Lines for the same variant are
 * merged; anything that can't be sold right now is returned separately
 * rather than silently dropped.
 */
export async function priceCart(
  ctx: QueryCtx,
  items: CartItem[]
): Promise<{ lines: PricedLine[]; unavailable: Unavailable[]; subtotal: number }> {
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

  return { lines, unavailable, subtotal: toRm(subtotalSen) };
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
