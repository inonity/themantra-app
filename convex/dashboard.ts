import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./helpers/auth";
import {
  bucketKeys,
  granularityFor,
  last7DayKeys,
  myDateKey,
  pickBucketKey,
} from "./helpers/dates";

const SALES_SCAN_CAP = 5000;
const REPEAT_SCAN_CAP = 10000;
const DAY_MS = 24 * 3600 * 1000;

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                    */
/* ------------------------------------------------------------------ */

// Resolve seller scope: admins may pass agentId (or null for HQ-wide);
// sellers are always forced to their own sales.
async function resolveSellerScope(
  ctx: QueryCtx,
  agentIdArg: Id<"users"> | undefined
): Promise<{ sellerId: Id<"users"> | null; isAdmin: boolean }> {
  const userId = await requireAuth(ctx);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Not authenticated");
  if (user.role === "admin") {
    return { sellerId: agentIdArg ?? null, isAdmin: true };
  }
  return { sellerId: userId, isAdmin: false };
}

async function fetchSalesInRange(
  ctx: QueryCtx,
  from: number,
  to: number,
  sellerId: Id<"users"> | null
): Promise<Doc<"sales">[]> {
  if (sellerId) {
    return await ctx.db
      .query("sales")
      .withIndex("by_sellerId_and_saleDate", (q) =>
        q.eq("sellerId", sellerId).gte("saleDate", from).lte("saleDate", to)
      )
      .take(SALES_SCAN_CAP);
  }
  return await ctx.db
    .query("sales")
    .withIndex("by_saleDate", (q) => q.gte("saleDate", from).lte("saleDate", to))
    .take(SALES_SCAN_CAP);
}

function customerKey(sale: Doc<"sales">): string | null {
  const c = sale.customerDetail;
  if (!c) return null;
  const email = c.email?.trim().toLowerCase();
  const phone = c.phone?.replace(/\s+/g, "");
  if (email) return `e:${email}`;
  if (phone) return `p:${phone}`;
  if (c.name) return `n:${c.name.trim().toLowerCase()}`;
  return null;
}

function saleTotals(s: Doc<"sales">) {
  return {
    revenue: s.totalAmount ?? 0,
    hqRevenue: s.hqPrice ?? s.totalAmount ?? 0,
    commission: s.agentCommission ?? 0,
    units: s.totalQuantity ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/*  1. getStats — totals, deltas, sparks, channel, fulfillment, etc.  */
/* ------------------------------------------------------------------ */

export const getStats = query({
  args: {
    from: v.number(),
    to: v.number(),
    agentId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { sellerId } = await resolveSellerScope(ctx, args.agentId);

    const rangeLen = args.to - args.from + 1;
    const prevFrom = args.from - rangeLen;
    const prevTo = args.from - 1;

    const [current, previous] = await Promise.all([
      fetchSalesInRange(ctx, args.from, args.to, sellerId),
      fetchSalesInRange(ctx, prevFrom, prevTo, sellerId),
    ]);

    // 7-day spark window — always ends today
    const now = Date.now();
    const sparkStart = now - 6 * DAY_MS;
    const sparkEnd = now;
    const sparkSales = await fetchSalesInRange(ctx, sparkStart, sparkEnd, sellerId);

    const agg = (sales: Doc<"sales">[]) => {
      let sales_ = 0, units = 0, revenue = 0, hqRevenue = 0, commission = 0;
      for (const s of sales) {
        const t = saleTotals(s);
        sales_ += 1;
        units += t.units;
        revenue += t.revenue;
        hqRevenue += t.hqRevenue;
        commission += t.commission;
      }
      return { sales: sales_, units, revenue, hqRevenue, commission };
    };

    const cur = agg(current);
    const prev = agg(previous);

    const pct = (a: number, b: number) => {
      if (b === 0) return a === 0 ? 0 : null;
      return ((a - b) / b) * 100;
    };

    const deltas = {
      sales: pct(cur.sales, prev.sales),
      units: pct(cur.units, prev.units),
      revenue: pct(cur.revenue, prev.revenue),
      hqRevenue: pct(cur.hqRevenue, prev.hqRevenue),
      commission: pct(cur.commission, prev.commission),
    };

    // Sparklines — bucket last 7 days
    const sparkKeys = last7DayKeys(now);
    const sparkBuckets: Record<string, { sales: number; units: number; revenue: number; hqRevenue: number; commission: number }> = {};
    for (const k of sparkKeys) {
      sparkBuckets[k] = { sales: 0, units: 0, revenue: 0, hqRevenue: 0, commission: 0 };
    }
    for (const s of sparkSales) {
      const k = myDateKey(s.saleDate);
      const b = sparkBuckets[k];
      if (!b) continue;
      const t = saleTotals(s);
      b.sales += 1;
      b.units += t.units;
      b.revenue += t.revenue;
      b.hqRevenue += t.hqRevenue;
      b.commission += t.commission;
    }
    const spark = {
      sales: sparkKeys.map((k) => sparkBuckets[k].sales),
      units: sparkKeys.map((k) => sparkBuckets[k].units),
      revenue: sparkKeys.map((k) => sparkBuckets[k].revenue),
      hqRevenue: sparkKeys.map((k) => sparkBuckets[k].hqRevenue),
      commission: sparkKeys.map((k) => sparkBuckets[k].commission),
    };

    // Channel breakdown
    const channelMap: Record<string, { count: number; revenue: number }> = {};
    for (const s of current) {
      const ch = s.saleChannel;
      if (!channelMap[ch]) channelMap[ch] = { count: 0, revenue: 0 };
      channelMap[ch].count += 1;
      channelMap[ch].revenue += s.totalAmount ?? 0;
    }
    const channelBreakdown = Object.entries(channelMap).map(([channel, v]) => ({
      channel,
      count: v.count,
      revenue: v.revenue,
    }));

    // Fulfillment health
    let fulfilledCount = 0;
    let totalFulfillmentMs = 0;
    let onTimeCount = 0;
    const pendingBuckets = { "0-7": 0, "7-14": 0, "14+": 0 };
    let pendingCount = 0;
    for (const s of current) {
      if (s.fulfillmentStatus === "fulfilled" && s.fulfilledAt) {
        const delta = s.fulfilledAt - s.saleDate;
        if (delta >= 0) {
          fulfilledCount += 1;
          totalFulfillmentMs += delta;
          if (delta <= 7 * DAY_MS) onTimeCount += 1;
        }
      } else if (
        s.fulfillmentStatus === "pending_stock" ||
        s.fulfillmentStatus === "partial"
      ) {
        pendingCount += 1;
        const age = now - s.saleDate;
        if (age <= 7 * DAY_MS) pendingBuckets["0-7"] += 1;
        else if (age <= 14 * DAY_MS) pendingBuckets["7-14"] += 1;
        else pendingBuckets["14+"] += 1;
      }
    }
    const fulfillment = {
      avgDaysToFulfill:
        fulfilledCount > 0 ? totalFulfillmentMs / fulfilledCount / DAY_MS : null,
      pctOnTime: fulfilledCount > 0 ? (onTimeCount / fulfilledCount) * 100 : null,
      pendingCount,
      buckets: pendingBuckets,
    };

    // Interest conversion — count interests created in range
    let interests: Doc<"interests">[];
    if (sellerId) {
      interests = await ctx.db
        .query("interests")
        .withIndex("by_agentId_and_createdAt", (q) =>
          q.eq("agentId", sellerId).gte("createdAt", args.from).lte("createdAt", args.to)
        )
        .take(2000);
    } else {
      const all = await ctx.db.query("interests").take(REPEAT_SCAN_CAP);
      interests = all.filter(
        (i) => i.createdAt >= args.from && i.createdAt <= args.to
      );
    }
    const nonCancelled = interests.filter((i) => i.status !== "cancelled");
    const converted = interests.filter((i) => i.status === "converted").length;
    const interestConversion = {
      total: nonCancelled.length,
      converted,
      rate:
        nonCancelled.length > 0 ? (converted / nonCancelled.length) * 100 : null,
    };

    // Repeat customer rate — scan all sales up to `to` to build customer frequency map
    const historicalSales = await ctx.db
      .query("sales")
      .withIndex("by_saleDate", (q) => q.lte("saleDate", args.to))
      .take(REPEAT_SCAN_CAP);
    const keyCounts: Record<string, number> = {};
    for (const s of historicalSales) {
      if (sellerId && s.sellerId !== sellerId) continue;
      const k = customerKey(s);
      if (!k) continue;
      keyCounts[k] = (keyCounts[k] ?? 0) + 1;
    }
    let inRangeWithKey = 0;
    let repeatSales = 0;
    for (const s of current) {
      const k = customerKey(s);
      if (!k) continue;
      inRangeWithKey += 1;
      if ((keyCounts[k] ?? 0) >= 2) repeatSales += 1;
    }
    const repeatCustomer = {
      totalSales: inRangeWithKey,
      repeatSales,
      rate:
        inRangeWithKey > 0 ? (repeatSales / inRangeWithKey) * 100 : null,
    };

    return {
      current: cur,
      previous: prev,
      deltas,
      spark,
      sparkKeys,
      channelBreakdown,
      fulfillment,
      interestConversion,
      repeatCustomer,
      pendingStockCount: pendingCount,
    };
  },
});

/* ------------------------------------------------------------------ */
/*  2. getTimeseries                                                   */
/* ------------------------------------------------------------------ */

export const getTimeseries = query({
  args: {
    from: v.number(),
    to: v.number(),
    agentId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { sellerId } = await resolveSellerScope(ctx, args.agentId);
    const granularity = granularityFor(args.from, args.to);
    const keys = bucketKeys(args.from, args.to, granularity);
    const sales = await fetchSalesInRange(ctx, args.from, args.to, sellerId);

    const map: Record<string, { sales: number; units: number; revenue: number; hqRevenue: number; commission: number }> = {};
    for (const k of keys) map[k] = { sales: 0, units: 0, revenue: 0, hqRevenue: 0, commission: 0 };
    for (const s of sales) {
      const k = pickBucketKey(s.saleDate, granularity);
      const b = map[k];
      if (!b) continue;
      const t = saleTotals(s);
      b.sales += 1;
      b.units += t.units;
      b.revenue += t.revenue;
      b.hqRevenue += t.hqRevenue;
      b.commission += t.commission;
    }
    return {
      granularity,
      buckets: keys.map((k) => ({ key: k, ...map[k] })),
    };
  },
});

/* ------------------------------------------------------------------ */
/*  3. getProductRanking                                              */
/* ------------------------------------------------------------------ */

export const getProductRanking = query({
  args: {
    from: v.number(),
    to: v.number(),
    agentId: v.optional(v.id("users")),
    groupByVariant: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { sellerId } = await resolveSellerScope(ctx, args.agentId);
    const sales = await fetchSalesInRange(ctx, args.from, args.to, sellerId);

    type Row = { productId: Id<"products">; variantId?: Id<"productVariants">; units: number; revenue: number };
    const rows: Record<string, Row> = {};
    for (const s of sales) {
      if (!s.lineItems) continue;
      for (const li of s.lineItems) {
        const key = args.groupByVariant
          ? `${li.productId}|${li.variantId ?? ""}`
          : `${li.productId}`;
        if (!rows[key]) {
          rows[key] = {
            productId: li.productId,
            variantId: args.groupByVariant ? li.variantId : undefined,
            units: 0,
            revenue: 0,
          };
        }
        rows[key].units += li.quantity;
        const unitPrice = li.unitPrice ?? li.productPrice ?? 0;
        rows[key].revenue += unitPrice * li.quantity;
      }
    }

    const productIds = new Set<Id<"products">>();
    const variantIds = new Set<Id<"productVariants">>();
    for (const r of Object.values(rows)) {
      productIds.add(r.productId);
      if (r.variantId) variantIds.add(r.variantId);
    }
    const products: Record<string, Doc<"products">> = {};
    for (const id of productIds) {
      const p = await ctx.db.get(id);
      if (p) products[id] = p;
    }
    const variants: Record<string, Doc<"productVariants">> = {};
    for (const id of variantIds) {
      const variant = await ctx.db.get(id);
      if (variant) variants[id] = variant;
    }

    return Object.values(rows).map((r) => ({
      productId: r.productId,
      variantId: r.variantId,
      productName: products[r.productId]?.name ?? "Unknown",
      variantName: r.variantId ? variants[r.variantId]?.name ?? null : null,
      units: r.units,
      revenue: r.revenue,
    }));
  },
});

/* ------------------------------------------------------------------ */
/*  4. getAgentRanking (HQ only)                                       */
/* ------------------------------------------------------------------ */

export const getAgentRanking = query({
  args: {
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    const { isAdmin } = await resolveSellerScope(ctx, undefined);
    if (!isAdmin) return [];

    const sales = await fetchSalesInRange(ctx, args.from, args.to, null);

    type Row = { agentId: Id<"users">; sales: number; units: number; revenue: number; commission: number };
    const rows: Record<string, Row> = {};
    for (const s of sales) {
      if (!s.sellerId) continue;
      const key = s.sellerId as string;
      if (!rows[key]) {
        rows[key] = { agentId: s.sellerId, sales: 0, units: 0, revenue: 0, commission: 0 };
      }
      const t = saleTotals(s);
      rows[key].sales += 1;
      rows[key].units += t.units;
      rows[key].revenue += t.revenue;
      rows[key].commission += t.commission;
    }

    const users: Record<string, Doc<"users">> = {};
    for (const id of Object.keys(rows)) {
      const u = await ctx.db.get(id as Id<"users">);
      if (u) users[id] = u;
    }

    return Object.values(rows).map((r) => ({
      agentId: r.agentId,
      name: users[r.agentId]?.name ?? users[r.agentId]?.email ?? "Unknown",
      role: users[r.agentId]?.role ?? null,
      sales: r.sales,
      units: r.units,
      revenue: r.revenue,
      commission: r.commission,
    }));
  },
});

/* ------------------------------------------------------------------ */
/*  5. getBatchMaturationAlerts                                        */
/* ------------------------------------------------------------------ */

export const getBatchMaturationAlerts = query({
  args: {},
  handler: async (ctx) => {
    const { isAdmin } = await resolveSellerScope(ctx, undefined);
    if (!isAdmin) return [];

    const batches = await ctx.db.query("batches").take(500);
    const now = Date.now();
    const horizon = now + 7 * DAY_MS;

    const alerts = batches.filter((b) => {
      if (b.status !== "upcoming" && b.status !== "partial") return false;
      if (!b.expectedReadyDate) return false;
      const readyTs = new Date(b.expectedReadyDate).getTime();
      if (isNaN(readyTs)) return false;
      return readyTs <= horizon;
    });

    const productIds = new Set<Id<"products">>();
    for (const b of alerts) productIds.add(b.productId);
    const products: Record<string, Doc<"products">> = {};
    for (const id of productIds) {
      const p = await ctx.db.get(id);
      if (p) products[id] = p;
    }

    return alerts
      .map((b) => {
        const readyTs = new Date(b.expectedReadyDate!).getTime();
        const daysUntil = Math.round((readyTs - now) / DAY_MS);
        return {
          batchId: b._id,
          batchCode: b.batchCode,
          productName: products[b.productId]?.name ?? "Unknown",
          expectedReadyDate: b.expectedReadyDate!,
          status: b.status,
          daysUntil,
          totalQuantity: b.totalQuantity,
        };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  },
});

/* ------------------------------------------------------------------ */
/*  6. getLowStockProducts                                             */
/* ------------------------------------------------------------------ */

export const getLowStockProducts = query({
  args: { threshold: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { isAdmin } = await resolveSellerScope(ctx, undefined);
    if (!isAdmin) return [];

    const threshold = args.threshold ?? 10;
    const inv = await ctx.db
      .query("inventory")
      .withIndex("by_heldByType_and_heldById", (q) => q.eq("heldByType", "business"))
      .take(1000);

    type Row = { productId: Id<"products">; variantId?: Id<"productVariants">; quantity: number };
    const rows: Record<string, Row> = {};
    for (const i of inv) {
      const key = `${i.productId}|${i.variantId ?? ""}`;
      if (!rows[key]) {
        rows[key] = {
          productId: i.productId,
          variantId: i.variantId,
          quantity: 0,
        };
      }
      rows[key].quantity += i.quantity;
    }

    const low = Object.values(rows).filter((r) => r.quantity < threshold);

    const productIds = new Set<Id<"products">>();
    const variantIds = new Set<Id<"productVariants">>();
    for (const r of low) {
      productIds.add(r.productId);
      if (r.variantId) variantIds.add(r.variantId);
    }
    const products: Record<string, Doc<"products">> = {};
    for (const id of productIds) {
      const p = await ctx.db.get(id);
      if (p) products[id] = p;
    }
    const variants: Record<string, Doc<"productVariants">> = {};
    for (const id of variantIds) {
      const variant = await ctx.db.get(id);
      if (variant) variants[id] = variant;
    }

    return low
      .filter((r) => (products[r.productId]?.status ?? "active") !== "discontinued")
      .map((r) => ({
        productId: r.productId,
        variantId: r.variantId,
        productName: products[r.productId]?.name ?? "Unknown",
        variantName: r.variantId ? variants[r.variantId]?.name ?? null : null,
        quantity: r.quantity,
        threshold,
      }))
      .sort((a, b) => a.quantity - b.quantity);
  },
});
