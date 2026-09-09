/**
 * Helpers shared by the MCP read and write tools.
 *
 * Scoping rule: an admin sees the whole business, an agent or sales user sees
 * only their own sales, stock and settlements. This mirrors what the dashboard
 * queries already enforce — see `resolveSellerScope` in `dashboard.ts`.
 */

import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { MY_OFFSET_MS } from "../helpers/dates";
import { isSellerRole } from "../helpers/auth";
import { McpRole } from "./auth";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const SALES_SCAN_CAP = 5000;
export const INVENTORY_SCAN_CAP = 5000;
export const LOW_STOCK_THRESHOLD = 10;

export type AnyCtx = QueryCtx | MutationCtx;

export type Scope = {
  user: Doc<"users">;
  role: McpRole;
  isAdmin: boolean;
  /** null = every seller (admin); otherwise restricted to this user. */
  sellerId: Id<"users"> | null;
};

export async function getScope(ctx: AnyCtx, userId: Id<"users">): Promise<Scope> {
  const user = await ctx.db.get(userId);
  if (!user?.role) throw new Error("This token's user no longer has a role");
  const isAdmin = user.role === "admin";
  return {
    user,
    role: user.role,
    isAdmin,
    sellerId: isAdmin ? null : user._id,
  };
}

/* ------------------------------ time ranges ------------------------------ */

export type Period =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "90d"
  | "mtd"
  | "ytd"
  | "all";

export type Range = { from: number; to: number; label: string };

function startOfDayMY(ts: number): number {
  return Math.floor((ts + MY_OFFSET_MS) / DAY_MS) * DAY_MS - MY_OFFSET_MS;
}

function parseDateMY(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return parsed - MY_OFFSET_MS;
}

/**
 * Turn a period keyword — or an explicit from/to pair of YYYY-MM-DD dates in
 * Malaysia time — into an absolute range. `now` is passed in rather than read
 * from the clock, because queries are not re-run just because time advanced.
 */
export function resolveRange(
  now: number,
  period: string | undefined,
  from?: string,
  to?: string
): Range {
  if (from || to) {
    const start = from ? parseDateMY(from) : null;
    const end = to ? parseDateMY(to) : null;
    if (from && start === null) throw new Error(`Invalid 'from' date: ${from}`);
    if (to && end === null) throw new Error(`Invalid 'to' date: ${to}`);
    const rangeFrom = start ?? 0;
    const rangeTo = end === null ? now : end + DAY_MS - 1;
    if (rangeFrom > rangeTo) throw new Error("'from' is after 'to'");
    return {
      from: rangeFrom,
      to: rangeTo,
      label: `${from ?? "start"} to ${to ?? "now"}`,
    };
  }

  const today = startOfDayMY(now);
  const p = (period ?? "30d") as Period;
  switch (p) {
    case "today":
      return { from: today, to: now, label: "today" };
    case "yesterday":
      return { from: today - DAY_MS, to: today - 1, label: "yesterday" };
    case "7d":
      return { from: today - 6 * DAY_MS, to: now, label: "last 7 days" };
    case "90d":
      return { from: today - 89 * DAY_MS, to: now, label: "last 90 days" };
    case "mtd": {
      const d = new Date(now + MY_OFFSET_MS);
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - MY_OFFSET_MS;
      return { from: start, to: now, label: "month to date" };
    }
    case "ytd": {
      const d = new Date(now + MY_OFFSET_MS);
      const start = Date.UTC(d.getUTCFullYear(), 0, 1) - MY_OFFSET_MS;
      return { from: start, to: now, label: "year to date" };
    }
    case "all":
      return { from: 0, to: now, label: "all time" };
    case "30d":
    default:
      return { from: today - 29 * DAY_MS, to: now, label: "last 30 days" };
  }
}

/* -------------------------------- sales --------------------------------- */

export async function fetchSales(
  ctx: AnyCtx,
  range: Range,
  sellerId: Id<"users"> | null,
  includeCancelled = false
): Promise<Doc<"sales">[]> {
  const rows = sellerId
    ? await ctx.db
        .query("sales")
        .withIndex("by_sellerId_and_saleDate", (q) =>
          q.eq("sellerId", sellerId).gte("saleDate", range.from).lte("saleDate", range.to)
        )
        .take(SALES_SCAN_CAP)
    : await ctx.db
        .query("sales")
        .withIndex("by_saleDate", (q) =>
          q.gte("saleDate", range.from).lte("saleDate", range.to)
        )
        .take(SALES_SCAN_CAP);
  return includeCancelled ? rows : rows.filter((s) => s.cancelledAt === undefined);
}

/* ------------------------------- catalogue ------------------------------- */

export type Catalog = {
  products: Doc<"products">[];
  variants: Doc<"productVariants">[];
  productById: Map<Id<"products">, Doc<"products">>;
  variantById: Map<Id<"productVariants">, Doc<"productVariants">>;
  variantsByProduct: Map<Id<"products">, Doc<"productVariants">[]>;
};

export async function loadCatalog(ctx: AnyCtx): Promise<Catalog> {
  const [products, variants] = await Promise.all([
    ctx.db.query("products").take(500),
    ctx.db.query("productVariants").take(2000),
  ]);

  const productById = new Map(products.map((p) => [p._id, p]));
  const variantById = new Map(variants.map((v) => [v._id, v]));
  const variantsByProduct = new Map<Id<"products">, Doc<"productVariants">[]>();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.productId) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.productId, list);
  }
  for (const list of variantsByProduct.values()) {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  return { products, variants, productById, variantById, variantsByProduct };
}

export function productLabel(
  catalog: Catalog,
  productId: Id<"products"> | undefined
): string {
  if (!productId) return "—";
  return catalog.productById.get(productId)?.name ?? "(deleted product)";
}

export function variantLabel(
  catalog: Catalog,
  variantId: Id<"productVariants"> | undefined
): string {
  if (!variantId) return "—";
  return catalog.variantById.get(variantId)?.name ?? "(deleted variant)";
}

/* --------------------------------- users --------------------------------- */

export type UserIndex = {
  byId: Map<Id<"users">, Doc<"users">>;
  sellers: Doc<"users">[];
};

export async function loadUsers(ctx: AnyCtx): Promise<UserIndex> {
  const users = await ctx.db.query("users").take(500);
  return {
    byId: new Map(users.map((u) => [u._id, u])),
    sellers: users.filter((u) => isSellerRole(u.role)),
  };
}

export function userLabel(
  users: UserIndex,
  userId: Id<"users"> | undefined
): string {
  if (!userId) return "HQ";
  const user = users.byId.get(userId);
  return user?.nickname ?? user?.name ?? user?.email ?? "Unknown";
}

/**
 * Match a person by name, nickname or email. Returns the candidates so the
 * caller can report an ambiguous term rather than silently picking one.
 */
export function matchUsers(
  candidates: Doc<"users">[],
  term: string
): Doc<"users">[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  const haystack = (u: Doc<"users">) =>
    [u.nickname, u.name, u.email].filter(Boolean).map((s) => s!.toLowerCase());

  const exact = candidates.filter((u) => haystack(u).some((h) => h === needle));
  if (exact.length > 0) return exact;
  return candidates.filter((u) => haystack(u).some((h) => h.includes(needle)));
}

/* --------------------------- product resolution --------------------------- */

export type Resolution<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/** Resolve a free-text product term to exactly one product. */
export function resolveProduct(
  catalog: Catalog,
  term: string
): Resolution<Doc<"products">> {
  const needle = term.trim().toLowerCase();
  if (!needle) return { ok: false, message: "No product given." };

  const byCode = catalog.products.filter(
    (p) => p.shortCode?.toLowerCase() === needle
  );
  const byName = catalog.products.filter((p) => p.name.toLowerCase() === needle);
  const partial = catalog.products.filter((p) =>
    p.name.toLowerCase().includes(needle)
  );

  const matches = byCode.length ? byCode : byName.length ? byName : partial;

  if (matches.length === 1) return { ok: true, value: matches[0] };
  if (matches.length === 0) {
    return { ok: false, message: `No product matches "${term}".` };
  }
  return {
    ok: false,
    message: `"${term}" matches ${matches.length} products: ${matches
      .map((p) => p.name)
      .join(", ")}. Be more specific.`,
  };
}

/** Resolve a variant within a product; optional when the product has just one. */
export function resolveVariant(
  catalog: Catalog,
  product: Doc<"products">,
  term: string | undefined
): Resolution<Doc<"productVariants">> {
  const all = (catalog.variantsByProduct.get(product._id) ?? []).filter(
    (v) => v.status === "active"
  );

  if (all.length === 0) {
    return { ok: false, message: `${product.name} has no active variants.` };
  }

  if (!term) {
    if (all.length === 1) return { ok: true, value: all[0] };
    return {
      ok: false,
      message: `${product.name} has several variants: ${all
        .map((v) => v.name)
        .join(", ")}. Say which one.`,
    };
  }

  const needle = term.trim().toLowerCase();
  const exact = all.filter((v) => v.name.toLowerCase() === needle);
  const partial = all.filter((v) => v.name.toLowerCase().includes(needle));
  const matches = exact.length ? exact : partial;

  if (matches.length === 1) return { ok: true, value: matches[0] };
  if (matches.length === 0) {
    return {
      ok: false,
      message: `${product.name} has no variant matching "${term}". Available: ${all
        .map((v) => v.name)
        .join(", ")}.`,
    };
  }
  return {
    ok: false,
    message: `"${term}" matches several variants of ${product.name}: ${matches
      .map((v) => v.name)
      .join(", ")}.`,
  };
}
