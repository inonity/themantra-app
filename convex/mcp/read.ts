/**
 * Read-only MCP tools. Every handler returns a compact text block; see
 * `format.ts` for why the output is text rather than JSON.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  dateMY,
  dateTimeMY,
  heading,
  num,
  pct,
  rm,
  sections,
  table,
  truncate,
} from "./format";
import {
  AnyCtx,
  DAY_MS,
  INVENTORY_SCAN_CAP,
  LOW_STOCK_THRESHOLD,
  Range,
  Scope,
  TRANSFER_SCAN_CAP,
  UserIndex,
  fetchSales,
  getScope,
  loadCatalog,
  loadUsers,
  matchUsers,
  resolveRange,
  userLabel,
} from "./shared";

/* ----------------------------- argument coercion ----------------------------- */

type Input = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function int(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/* --------------------------------- shared -------------------------------- */

function scopeNote(scope: Scope): string {
  return scope.isAdmin
    ? "Scope: whole business."
    : "Scope: your own records only.";
}

async function fetchInventory(ctx: AnyCtx, scope: Scope): Promise<Doc<"inventory">[]> {
  const rows = scope.sellerId
    ? await ctx.db
        .query("inventory")
        .withIndex("by_heldByType_and_heldById", (q) =>
          q.eq("heldByType", "agent").eq("heldById", scope.sellerId!)
        )
        .take(INVENTORY_SCAN_CAP)
    : await ctx.db.query("inventory").take(INVENTORY_SCAN_CAP);
  return rows.filter((row) => row.quantity > 0);
}

async function fetchByPaymentStatus(
  ctx: AnyCtx,
  scope: Scope,
  statuses: ("unpaid" | "partial")[]
): Promise<Doc<"sales">[]> {
  const out: Doc<"sales">[] = [];
  for (const status of statuses) {
    const rows = await ctx.db
      .query("sales")
      .withIndex("by_paymentStatus_and_saleDate", (q) =>
        q.eq("paymentStatus", status)
      )
      .order("desc")
      .take(1000);
    out.push(...rows);
  }
  return out.filter(
    (s) =>
      s.cancelledAt === undefined &&
      (scope.sellerId === null || s.sellerId === scope.sellerId)
  );
}

type Totals = {
  orders: number;
  units: number;
  revenue: number;
  hqRevenue: number;
  commission: number;
};

function aggregate(sales: Doc<"sales">[]): Totals {
  const totals: Totals = {
    orders: 0,
    units: 0,
    revenue: 0,
    hqRevenue: 0,
    commission: 0,
  };
  for (const sale of sales) {
    totals.orders += 1;
    totals.units += sale.totalQuantity ?? 0;
    totals.revenue += sale.totalAmount ?? 0;
    totals.hqRevenue += sale.hqPrice ?? sale.totalAmount ?? 0;
    totals.commission += sale.agentCommission ?? 0;
  }
  return totals;
}

function delta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "—" : "new";
  return pct(((current - previous) / previous) * 100);
}

function owed(sale: Doc<"sales">): number {
  return Math.max(0, (sale.totalAmount ?? 0) - (sale.amountPaid ?? 0));
}

/** Resolve an agent-name argument to one user id, or explain the failure. */
function resolveAgentArg(
  users: UserIndex,
  scope: Scope,
  term: string
): { id: Id<"users"> } | { error: string } {
  if (!scope.isAdmin) {
    return { error: "Only admins can filter by agent." };
  }
  const matches = matchUsers(users.sellers, term);
  if (matches.length === 1) return { id: matches[0]._id };
  if (matches.length === 0) return { error: `No agent matches "${term}".` };
  return {
    error: `"${term}" matches ${matches.length} people: ${matches
      .map((u) => u.nickname ?? u.name ?? u.email)
      .join(", ")}.`,
  };
}

/* --------------------------------- tools --------------------------------- */

async function whoami(scope: Scope, now: number): Promise<string> {
  const roleWord =
    scope.role === "admin"
      ? "admin — full visibility across the business"
      : `${scope.role} — you see only your own sales, stock and settlements`;

  return [
    heading("Identity"),
    `User: ${scope.user.nickname ?? scope.user.name ?? scope.user.email ?? "Unknown"}`,
    `Role: ${roleWord}`,
    `Today (Malaysia, UTC+8): ${dateMY(now)}`,
    scope.isAdmin
      ? "Writes available: none (admins record stock requests and interests in the app)."
      : "Writes available: create_stock_request, record_interest.",
  ].join("\n");
}

async function overview(
  ctx: AnyCtx,
  scope: Scope,
  input: Input,
  now: number
): Promise<string> {
  const range = resolveRange(now, str(input.period));
  const span = range.to - range.from;
  const previous: Range = {
    from: range.from - span - 1,
    to: range.from - 1,
    label: "previous",
  };

  const [current, prior, catalog, inventory] = await Promise.all([
    fetchSales(ctx, range, scope.sellerId),
    fetchSales(ctx, previous, scope.sellerId),
    loadCatalog(ctx),
    fetchInventory(ctx, scope),
  ]);

  const cur = aggregate(current);
  const prev = aggregate(prior);

  const headline = table(
    ["", "VALUE", "VS PREV"],
    [
      ["Revenue", rm(cur.revenue), delta(cur.revenue, prev.revenue)],
      ["Orders", num(cur.orders), delta(cur.orders, prev.orders)],
      ["Units", num(cur.units), delta(cur.units, prev.units)],
      ...(cur.commission > 0
        ? [["Commission", rm(cur.commission), delta(cur.commission, prev.commission)]]
        : []),
    ],
    ["l", "r", "r"]
  );

  // Channel split
  const byChannel = new Map<string, Totals>();
  for (const sale of current) {
    const key = sale.saleChannel;
    const bucket = byChannel.get(key) ?? {
      orders: 0,
      units: 0,
      revenue: 0,
      hqRevenue: 0,
      commission: 0,
    };
    bucket.orders += 1;
    bucket.units += sale.totalQuantity ?? 0;
    bucket.revenue += sale.totalAmount ?? 0;
    byChannel.set(key, bucket);
  }
  const channelRows = [...byChannel.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([channel, t]) => [channel, rm(t.revenue), num(t.orders)]);

  // Outstanding money and fulfilment
  const outstanding = await fetchByPaymentStatus(ctx, scope, ["unpaid", "partial"]);
  const owedTotal = outstanding.reduce((sum, s) => sum + owed(s), 0);

  const pendingFulfilment = (
    await ctx.db
      .query("sales")
      .withIndex("by_fulfillmentStatus_and_saleDate", (q) =>
        q.eq("fulfillmentStatus", "pending_stock")
      )
      .order("desc")
      .take(500)
  ).filter(
    (s) =>
      s.cancelledAt === undefined &&
      (scope.sellerId === null || s.sellerId === scope.sellerId)
  );

  // Stock attention
  const byVariant = new Map<string, number>();
  for (const row of inventory) {
    const key = `${row.productId}:${row.variantId ?? "none"}`;
    byVariant.set(key, (byVariant.get(key) ?? 0) + row.quantity);
  }
  const lowStock = [...byVariant.values()].filter(
    (qty) => qty <= LOW_STOCK_THRESHOLD
  ).length;

  const maturing = (
    await ctx.db.query("batches").take(500)
  ).filter((batch) => {
    if (batch.status !== "upcoming" && batch.status !== "partial") return false;
    if (!batch.expectedReadyDate) return false;
    const ready = Date.parse(`${batch.expectedReadyDate}T00:00:00Z`);
    return (
      !Number.isNaN(ready) && ready >= now - DAY_MS && ready <= now + 14 * DAY_MS
    );
  });

  const attention = table(
    ["", "COUNT", "VALUE"],
    [
      [
        "Unpaid / part-paid sales",
        num(outstanding.length),
        owedTotal > 0 ? `${rm(owedTotal)} owed` : "—",
      ],
      ["Sales awaiting stock", num(pendingFulfilment.length), "—"],
      [`Variants at or below ${LOW_STOCK_THRESHOLD} units`, num(lowStock), "—"],
      ["Batches maturing within 14 days", num(maturing.length), "—"],
    ],
    ["l", "r", "l"]
  );

  return sections(
    `${heading(`Overview — ${range.label}`)}\nAs of ${dateMY(now)}. ${scopeNote(scope)}`,
    headline,
    channelRows.length ? `Channels\n${table(["CHANNEL", "REVENUE", "ORDERS"], channelRows, ["l", "r", "r"])}` : null,
    `Needs attention\n${attention}`,
    catalog.products.length === 0 ? "No products defined yet." : null
  );
}

async function products(
  ctx: AnyCtx,
  scope: Scope,
  input: Input
): Promise<string> {
  const catalog = await loadCatalog(ctx);
  const search = str(input.search)?.toLowerCase();
  const collection = str(input.collection)?.toLowerCase();
  const status = str(input.status) ?? "active";
  const includeStock = bool(input.includeStock, true);

  let list = catalog.products;
  if (status !== "all") list = list.filter((p) => p.status === status);
  if (collection)
    list = list.filter((p) => p.collection?.toLowerCase().includes(collection));
  if (search)
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.shortCode?.toLowerCase() === search
    );

  if (list.length === 0) return "No products match those filters.";

  // Stock per variant, split by holder type.
  const hqQty = new Map<string, number>();
  const agentQty = new Map<string, number>();
  if (includeStock) {
    const inventory = await fetchInventory(ctx, scope);
    for (const row of inventory) {
      const key = `${row.productId}:${row.variantId ?? "none"}`;
      const target = row.heldByType === "business" ? hqQty : agentQty;
      target.set(key, (target.get(key) ?? 0) + row.quantity);
    }
  }

  const rows: string[][] = [];
  for (const product of list.sort((a, b) => a.name.localeCompare(b.name))) {
    const variants = (catalog.variantsByProduct.get(product._id) ?? []).filter(
      (variant) => status === "all" || variant.status === "active"
    );
    if (variants.length === 0) {
      rows.push([
        truncate(product.name, 26),
        product.shortCode ?? "—",
        "(no variants)",
        "—",
        ...(includeStock ? (scope.isAdmin ? ["—", "—"] : ["—"]) : []),
      ]);
      continue;
    }
    for (const variant of variants) {
      const key = `${product._id}:${variant._id}`;
      rows.push([
        truncate(product.name, 26),
        product.shortCode ?? "—",
        truncate(variant.name, 16),
        rm(variant.price),
        ...(includeStock
          ? scope.isAdmin
            ? [num(hqQty.get(key) ?? 0), num(agentQty.get(key) ?? 0)]
            : [num(agentQty.get(key) ?? 0)]
          : []),
      ]);
    }
  }

  const headers = [
    "PRODUCT",
    "CODE",
    "VARIANT",
    "PRICE",
    ...(includeStock ? (scope.isAdmin ? ["HQ", "AGENTS"] : ["YOURS"]) : []),
  ];
  const align: ("l" | "r")[] = [
    "l",
    "l",
    "l",
    "r",
    ...(includeStock ? (scope.isAdmin ? ["r" as const, "r" as const] : ["r" as const]) : []),
  ];

  const capped = rows.slice(0, 80);
  return sections(
    heading(`Products (${list.length}${status === "all" ? "" : `, ${status}`})`),
    table(headers, capped, align),
    rows.length > capped.length
      ? `(${rows.length - capped.length} more rows — narrow with search or collection)`
      : null
  );
}

async function inventory(
  ctx: AnyCtx,
  scope: Scope,
  input: Input
): Promise<string> {
  const catalog = await loadCatalog(ctx);
  const users = await loadUsers(ctx);
  const search = str(input.search)?.toLowerCase();
  const holder = str(input.holder) ?? "all";
  const groupBy = str(input.groupBy) ?? "variant";
  const lowStockOnly = bool(input.lowStockOnly, false);

  let agentFilter: Id<"users"> | null = null;
  const agentTerm = str(input.agent);
  if (agentTerm) {
    const resolved = resolveAgentArg(users, scope, agentTerm);
    if ("error" in resolved) return resolved.error;
    agentFilter = resolved.id;
  }

  let rows = await fetchInventory(ctx, scope);

  if (holder === "business") rows = rows.filter((r) => r.heldByType === "business");
  if (holder === "agents") rows = rows.filter((r) => r.heldByType === "agent");
  if (agentFilter)
    rows = rows.filter(
      (r) => r.heldByType === "agent" && r.heldById === agentFilter
    );
  if (search)
    rows = rows.filter((r) => {
      const product = catalog.productById.get(r.productId);
      return (
        product?.name.toLowerCase().includes(search) ||
        product?.shortCode?.toLowerCase() === search
      );
    });

  if (rows.length === 0) return "No stock matches those filters.";

  if (groupBy === "batch") {
    const batches = await ctx.db.query("batches").take(1000);
    const batchById = new Map(batches.map((b) => [b._id, b]));
    const out = rows
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 80)
      .map((row) => [
        truncate(catalog.productById.get(row.productId)?.name ?? "?", 22),
        truncate(
          row.variantId ? catalog.variantById.get(row.variantId)?.name ?? "?" : "—",
          14
        ),
        batchById.get(row.batchId)?.batchCode ?? "?",
        row.heldByType === "business" ? "HQ" : userLabel(users, row.heldById),
        num(row.quantity),
      ]);
    return sections(
      heading("Stock by batch"),
      table(["PRODUCT", "VARIANT", "BATCH", "HOLDER", "QTY"], out, [
        "l",
        "l",
        "l",
        "l",
        "r",
      ])
    );
  }

  // Group by product + variant, split HQ vs agents.
  type Cell = { hq: number; agents: number; product: string; variant: string };
  const grouped = new Map<string, Cell>();
  for (const row of rows) {
    const key = `${row.productId}:${row.variantId ?? "none"}`;
    const cell =
      grouped.get(key) ??
      {
        hq: 0,
        agents: 0,
        product: catalog.productById.get(row.productId)?.name ?? "?",
        variant: row.variantId
          ? catalog.variantById.get(row.variantId)?.name ?? "?"
          : "—",
      };
    if (row.heldByType === "business") cell.hq += row.quantity;
    else cell.agents += row.quantity;
    grouped.set(key, cell);
  }

  let cells = [...grouped.values()];
  if (lowStockOnly)
    cells = cells.filter((c) => c.hq + c.agents <= LOW_STOCK_THRESHOLD);
  if (cells.length === 0) return "No stock matches those filters.";

  cells.sort((a, b) => a.hq + a.agents - (b.hq + b.agents));

  const out = cells
    .slice(0, 80)
    .map((c) =>
      scope.isAdmin
        ? [
            truncate(c.product, 26),
            truncate(c.variant, 16),
            num(c.hq),
            num(c.agents),
            num(c.hq + c.agents),
          ]
        : [truncate(c.product, 26), truncate(c.variant, 16), num(c.agents)]
    );

  return sections(
    heading(
      `Stock on hand${lowStockOnly ? ` (at or below ${LOW_STOCK_THRESHOLD})` : ""}`
    ),
    scope.isAdmin
      ? table(["PRODUCT", "VARIANT", "HQ", "AGENTS", "TOTAL"], out, [
          "l",
          "l",
          "r",
          "r",
          "r",
        ])
      : table(["PRODUCT", "VARIANT", "QTY"], out, ["l", "l", "r"]),
    cells.length > out.length ? `(${cells.length - out.length} more rows)` : null
  );
}

async function salesList(
  ctx: AnyCtx,
  scope: Scope,
  input: Input,
  now: number
): Promise<string> {
  const range = resolveRange(now, str(input.period), str(input.from), str(input.to));
  const users = await loadUsers(ctx);
  const limit = int(input.limit, 25, 200);

  let sellerId = scope.sellerId;
  const agentTerm = str(input.agent);
  if (agentTerm) {
    const resolved = resolveAgentArg(users, scope, agentTerm);
    if ("error" in resolved) return resolved.error;
    sellerId = resolved.id;
  }

  let rows = await fetchSales(
    ctx,
    range,
    sellerId,
    bool(input.includeCancelled, false)
  );

  const channel = str(input.channel);
  const paymentStatus = str(input.paymentStatus);
  const type = str(input.type);
  if (channel) rows = rows.filter((s) => s.saleChannel === channel);
  if (paymentStatus) rows = rows.filter((s) => s.paymentStatus === paymentStatus);
  if (type) rows = rows.filter((s) => s.type === type);

  if (rows.length === 0) return `No sales in ${range.label} matching those filters.`;

  rows.sort((a, b) => b.saleDate - a.saleDate);
  const totals = aggregate(rows);
  const page = rows.slice(0, limit);

  const body = page.map((sale) => {
    const buyer =
      sale.customerDetail?.name ??
      (sale.buyerId ? userLabel(users, sale.buyerId) : "—");
    return [
      dateMY(sale.saleDate),
      sale._id,
      truncate(userLabel(users, sale.sellerId), 14),
      truncate(buyer, 18),
      num(sale.totalQuantity ?? 0),
      rm(sale.totalAmount ?? 0),
      sale.paymentStatus,
      sale.saleChannel,
      sale.cancelledAt ? "CANCELLED" : "",
    ];
  });

  return sections(
    `${heading(`Sales — ${range.label}`)}\n${rows.length} sales, ${rm(totals.revenue)} revenue, ${num(totals.units)} units.`,
    table(
      ["DATE", "ID", "SELLER", "BUYER", "QTY", "AMOUNT", "PAY", "CHANNEL", ""],
      body,
      ["l", "l", "l", "l", "r", "r", "l", "l", "l"]
    ),
    rows.length > page.length
      ? `Showing ${page.length} of ${rows.length}. Raise \`limit\` or narrow the period for more.`
      : null
  );
}

async function saleDetail(
  ctx: AnyCtx,
  scope: Scope,
  input: Input
): Promise<string> {
  const raw = str(input.saleId);
  if (!raw) return "Give a saleId (from the `sales` tool).";
  const saleId = ctx.db.normalizeId("sales", raw);
  if (!saleId) return `"${raw}" is not a valid sale id.`;

  const sale = await ctx.db.get(saleId);
  if (!sale) return "Sale not found.";
  if (
    scope.sellerId !== null &&
    sale.sellerId !== scope.sellerId &&
    sale.buyerId !== scope.sellerId
  ) {
    return "That sale belongs to someone else.";
  }

  const [catalog, users] = await Promise.all([loadCatalog(ctx), loadUsers(ctx)]);

  const facts: string[][] = [
    ["Date", dateTimeMY(sale.saleDate)],
    ["Type", `${sale.type} via ${sale.saleChannel}`],
    ["Seller", userLabel(users, sale.sellerId)],
    [
      "Buyer",
      sale.customerDetail?.name ??
        (sale.buyerId ? userLabel(users, sale.buyerId) : "—"),
    ],
    ["Total", rm(sale.totalAmount ?? 0)],
    [
      "Payment",
      `${sale.paymentStatus}${sale.paymentMethod ? ` (${sale.paymentMethod})` : ""} — paid ${rm(sale.amountPaid ?? 0)}${owed(sale) > 0 ? `, ${rm(owed(sale))} owing` : ""}`,
    ],
  ];
  if (sale.stockModel) facts.push(["Stock model", sale.stockModel]);
  if (sale.hqPrice !== undefined) facts.push(["HQ price", rm(sale.hqPrice)]);
  if (sale.agentCommission !== undefined)
    facts.push(["Commission", rm(sale.agentCommission)]);
  if (sale.fulfillmentStatus)
    facts.push(["Fulfilment", sale.fulfillmentStatus]);
  if (sale.customerDetail?.phone)
    facts.push(["Customer phone", sale.customerDetail.phone]);
  if (sale.notes) facts.push(["Notes", sale.notes]);
  if (sale.cancelledAt)
    facts.push([
      "Cancelled",
      `${dateMY(sale.cancelledAt)}${sale.cancellationReason ? ` — ${sale.cancellationReason}` : ""}`,
    ]);

  const batches = await ctx.db.query("batches").take(1000);
  const batchById = new Map(batches.map((b) => [b._id, b]));

  const items = (sale.lineItems ?? []).map((item) => [
    truncate(
      item.productName ?? catalog.productById.get(item.productId)?.name ?? "?",
      24
    ),
    truncate(
      item.variantName ??
        (item.variantId ? catalog.variantById.get(item.variantId)?.name ?? "—" : "—"),
      14
    ),
    num(item.quantity),
    item.unitPrice !== undefined ? rm(item.unitPrice) : "—",
    item.batchId ? batchById.get(item.batchId)?.batchCode ?? "?" : "—",
    item.fulfillmentSource ?? "—",
  ]);

  return sections(
    heading(`Sale ${sale._id}`),
    table(["", ""], facts, ["l", "l"]),
    items.length
      ? `Line items\n${table(
          ["PRODUCT", "VARIANT", "QTY", "UNIT", "BATCH", "SOURCE"],
          items,
          ["l", "l", "r", "r", "l", "l"]
        )}`
      : "No line items recorded."
  );
}

async function batchesList(
  ctx: AnyCtx,
  input: Input,
  now: number
): Promise<string> {
  const catalog = await loadCatalog(ctx);
  const search = str(input.search)?.toLowerCase();
  const status = str(input.status) ?? "all";
  const within = typeof input.maturingWithinDays === "number"
    ? input.maturingWithinDays
    : undefined;
  const limit = int(input.limit, 40, 200);

  let rows = await ctx.db.query("batches").take(1000);
  if (status !== "all") rows = rows.filter((b) => b.status === status);
  if (search)
    rows = rows.filter((b) => {
      const product = catalog.productById.get(b.productId);
      return (
        b.batchCode.toLowerCase().includes(search) ||
        product?.name.toLowerCase().includes(search)
      );
    });
  if (within !== undefined)
    rows = rows.filter((b) => {
      if (!b.expectedReadyDate) return false;
      const ready = Date.parse(`${b.expectedReadyDate}T00:00:00Z`);
      return !Number.isNaN(ready) && ready <= now + within * DAY_MS;
    });

  if (rows.length === 0) return "No batches match those filters.";

  rows.sort((a, b) => (b.manufacturedDate > a.manufacturedDate ? 1 : -1));

  const body = rows.slice(0, limit).map((batch) => {
    const released = batch.releasedQuantity ?? 0;
    return [
      batch.batchCode,
      truncate(catalog.productById.get(batch.productId)?.name ?? "?", 22),
      truncate(
        batch.variantId ? catalog.variantById.get(batch.variantId)?.name ?? "—" : "—",
        12
      ),
      batch.status,
      num(batch.totalQuantity),
      num(released),
      num(batch.totalQuantity - released),
      batch.manufacturedDate,
      batch.expectedReadyDate ?? "—",
    ];
  });

  return sections(
    heading(`Batches (${rows.length})`),
    table(
      [
        "BATCH",
        "PRODUCT",
        "VARIANT",
        "STATUS",
        "TOTAL",
        "RELEASED",
        "UNRELEASED",
        "MADE",
        "READY",
      ],
      body,
      ["l", "l", "l", "l", "r", "r", "r", "l", "l"]
    ),
    rows.length > body.length ? `(${rows.length - body.length} more)` : null
  );
}

async function payments(
  ctx: AnyCtx,
  scope: Scope,
  input: Input
): Promise<string> {
  const users = await loadUsers(ctx);
  const kind = str(input.kind) ?? "all";

  let agentFilter: Id<"users"> | null = scope.sellerId;
  const agentTerm = str(input.agent);
  if (agentTerm) {
    const resolved = resolveAgentArg(users, scope, agentTerm);
    if ("error" in resolved) return resolved.error;
    agentFilter = resolved.id;
  }

  const parts: (string | null)[] = [];

  if (kind === "unpaid" || kind === "all") {
    let unpaid = await fetchByPaymentStatus(ctx, scope, ["unpaid", "partial"]);
    if (agentFilter) unpaid = unpaid.filter((s) => s.sellerId === agentFilter);
    unpaid.sort((a, b) => b.saleDate - a.saleDate);
    const total = unpaid.reduce((sum, s) => sum + owed(s), 0);
    const body = unpaid.slice(0, 40).map((sale) => [
      dateMY(sale.saleDate),
      sale._id,
      truncate(userLabel(users, sale.sellerId), 14),
      truncate(sale.customerDetail?.name ?? userLabel(users, sale.buyerId), 16),
      rm(sale.totalAmount ?? 0),
      rm(sale.amountPaid ?? 0),
      rm(owed(sale)),
    ]);
    parts.push(
      unpaid.length
        ? `Unpaid and part-paid sales — ${unpaid.length} sales, ${rm(total)} outstanding\n${table(
            ["DATE", "ID", "SELLER", "BUYER", "TOTAL", "PAID", "OWING"],
            body,
            ["l", "l", "l", "l", "r", "r", "r"]
          )}${unpaid.length > body.length ? `\n(${unpaid.length - body.length} more)` : ""}`
        : "Unpaid sales: none."
    );
  }

  if (kind === "settlements" || kind === "all") {
    let settlements = agentFilter
      ? await ctx.db
          .query("agentSettlements")
          .withIndex("by_agentId", (q) => q.eq("agentId", agentFilter!))
          .order("desc")
          .take(200)
      : await ctx.db.query("agentSettlements").order("desc").take(200);

    settlements = settlements.filter((s) => s.paymentStatus !== "paid");

    const agentOwesHq = settlements.filter((s) => s.direction !== "hq_to_agent");
    const hqOwesAgent = settlements.filter((s) => s.direction === "hq_to_agent");
    const sum = (list: typeof settlements) =>
      list.reduce((acc, s) => acc + (s.totalAmount - s.amountPaid), 0);

    const render = (list: typeof settlements, title: string) =>
      list.length
        ? `${title} — ${rm(sum(list))} across ${list.length}\n${table(
            ["REF", "AGENT", "SALES", "AMOUNT", "PAID", "STATUS"],
            list.slice(0, 30).map((s) => [
              s.referenceId,
              truncate(userLabel(users, s.agentId), 14),
              num(s.saleIds.length),
              rm(s.totalAmount),
              rm(s.amountPaid),
              s.paymentStatus,
            ]),
            ["l", "l", "r", "r", "r", "l"]
          )}`
        : `${title}: none.`;

    parts.push(render(agentOwesHq, "Agents owe HQ"));
    parts.push(render(hqOwesAgent, "HQ owes agents (commission)"));
  }

  return sections(heading("Outstanding money"), ...parts);
}

async function rankings(
  ctx: AnyCtx,
  scope: Scope,
  input: Input,
  now: number
): Promise<string> {
  const by = str(input.by) ?? "product";
  const range = resolveRange(now, str(input.period));
  const limit = int(input.limit, 10, 50);
  const [sales, catalog, users] = await Promise.all([
    fetchSales(ctx, range, scope.sellerId),
    loadCatalog(ctx),
    loadUsers(ctx),
  ]);

  if (sales.length === 0) return `No sales in ${range.label}.`;

  const buckets = new Map<string, { revenue: number; units: number; orders: number }>();
  const bump = (key: string, revenue: number, units: number, orders: number) => {
    const b = buckets.get(key) ?? { revenue: 0, units: 0, orders: 0 };
    b.revenue += revenue;
    b.units += units;
    b.orders += orders;
    buckets.set(key, b);
  };

  if (by === "product") {
    for (const sale of sales) {
      for (const item of sale.lineItems ?? []) {
        const name =
          item.productName ?? catalog.productById.get(item.productId)?.name ?? "?";
        const revenue = (item.unitPrice ?? 0) * item.quantity;
        bump(name, revenue, item.quantity, 0);
      }
    }
  } else if (by === "agent") {
    for (const sale of sales) {
      bump(
        userLabel(users, sale.sellerId),
        sale.totalAmount ?? 0,
        sale.totalQuantity ?? 0,
        1
      );
    }
  } else {
    for (const sale of sales) {
      bump(sale.saleChannel, sale.totalAmount ?? 0, sale.totalQuantity ?? 0, 1);
    }
  }

  const ordered = [...buckets.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, limit);

  const label = by === "product" ? "PRODUCT" : by === "agent" ? "SELLER" : "CHANNEL";
  const showOrders = by !== "product";

  return sections(
    heading(`Top ${by} — ${range.label}`),
    table(
      ["#", label, "REVENUE", "UNITS", ...(showOrders ? ["ORDERS"] : [])],
      ordered.map(([name, t], i) => [
        String(i + 1),
        truncate(name, 26),
        rm(t.revenue),
        num(t.units),
        ...(showOrders ? [num(t.orders)] : []),
      ]),
      ["r", "l", "r", "r", ...(showOrders ? ["r" as const] : [])]
    )
  );
}

async function transfers(
  ctx: AnyCtx,
  scope: Scope,
  input: Input,
  now: number
): Promise<string> {
  const range = resolveRange(
    now,
    str(input.period) ?? "all",
    str(input.from),
    str(input.to)
  );
  const direction = str(input.direction) ?? "all";
  const search = str(input.search)?.toLowerCase();
  const limit = int(input.limit, 25, 200);
  const [catalog, users] = await Promise.all([loadCatalog(ctx), loadUsers(ctx)]);

  let agentFilter: Id<"users"> | null = scope.sellerId;
  const agentTerm = str(input.agent);
  if (agentTerm) {
    const resolved = resolveAgentArg(users, scope, agentTerm);
    if ("error" in resolved) return resolved.error;
    agentFilter = resolved.id;
  }

  // No index covers movedAt, so read the newest movements into each side and
  // filter here. `toPartyType: "agent"` also holds cancellation reversals
  // (customer -> agent), and `"business"` holds batch releases; both are
  // dropped by the fromPartyType checks below.
  const scan = (to: "agent" | "business") =>
    ctx.db
      .query("stockMovements")
      .withIndex("by_toPartyType", (q) => q.eq("toPartyType", to))
      .order("desc")
      .take(TRANSFER_SCAN_CAP);

  const [toAgent, toHq] = await Promise.all([
    direction === "return" ? [] : scan("agent"),
    direction === "to_agent" ? [] : scan("business"),
  ]);

  type Row = { move: Doc<"stockMovements">; outbound: boolean; agentId: Id<"users"> | undefined };
  let rows: Row[] = [
    ...toAgent
      .filter((m) => m.fromPartyType === "business")
      .map((move) => ({ move, outbound: true, agentId: move.toPartyId })),
    ...toHq
      .filter((m) => m.fromPartyType === "agent")
      .map((move) => ({ move, outbound: false, agentId: move.fromPartyId })),
  ];

  rows = rows.filter(
    (r) => r.move.movedAt >= range.from && r.move.movedAt <= range.to
  );
  if (agentFilter) rows = rows.filter((r) => r.agentId === agentFilter);
  if (search)
    rows = rows.filter((r) => {
      const product = catalog.productById.get(r.move.productId);
      return (
        product?.name.toLowerCase().includes(search) ||
        product?.shortCode?.toLowerCase() === search
      );
    });

  const what =
    direction === "to_agent"
      ? "HQ-to-agent transfers"
      : direction === "return"
        ? "returns to HQ"
        : "transfers or returns";
  if (rows.length === 0) return `No ${what} in ${range.label} matching those filters.`;

  rows.sort((a, b) => b.move.movedAt - a.move.movedAt);

  // One bulk transfer writes a row per batch, all with the same movedAt.
  const shipmentKey = (r: Row) => `${r.outbound}:${r.agentId}:${r.move.movedAt}`;
  const shipments = new Set(rows.map(shipmentKey)).size;
  const unitsOut = rows
    .filter((r) => r.outbound)
    .reduce((sum, r) => sum + r.move.quantity, 0);
  const unitsBack = rows
    .filter((r) => !r.outbound)
    .reduce((sum, r) => sum + r.move.quantity, 0);

  // Never end the page partway through a shipment, or "the latest transfer"
  // with a small limit would read as fewer items than were sent.
  let end = Math.min(limit, rows.length);
  while (end < rows.length && shipmentKey(rows[end]) === shipmentKey(rows[end - 1])) end++;
  const page = rows.slice(0, end);
  const batchIds = [...new Set(page.map((r) => r.move.batchId))];
  const batchDocs = await Promise.all(batchIds.map((id) => ctx.db.get(id)));
  const batchCode = new Map(
    batchDocs
      .filter((b): b is Doc<"batches"> => b !== null)
      .map((b) => [b._id, b.batchCode])
  );

  const body = page.map(({ move, outbound, agentId }) => {
    const unit = move.hqUnitPrice ?? move.unitPrice;
    return [
      dateTimeMY(move.movedAt),
      outbound ? "to agent" : "return",
      truncate(userLabel(users, agentId), 14),
      truncate(catalog.productById.get(move.productId)?.name ?? "?", 22),
      truncate(
        move.variantId ? catalog.variantById.get(move.variantId)?.name ?? "?" : "—",
        12
      ),
      batchCode.get(move.batchId) ?? "?",
      num(move.quantity),
      move.stockModel ?? "—",
      unit !== undefined ? rm(unit) : "—",
      move.saleId ? `sale ${move.saleId}` : truncate(move.notes ?? "", 30),
    ];
  });

  const summary = [
    `${shipments} shipment${shipments === 1 ? "" : "s"}`,
    unitsOut > 0 ? `${num(unitsOut)} units to agents` : null,
    unitsBack > 0 ? `${num(unitsBack)} units returned` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return sections(
    `${heading(`Stock transfers — ${range.label}`)}\n${summary}. Times are Malaysia (UTC+8). ${scopeNote(scope)}`,
    table(
      ["WHEN", "DIR", "AGENT", "PRODUCT", "VARIANT", "BATCH", "QTY", "MODEL", "HQ UNIT", "NOTE"],
      body,
      ["l", "l", "l", "l", "l", "l", "r", "l", "r", "l"]
    ),
    rows.length > page.length
      ? `Showing ${page.length} of ${rows.length} rows. Raise \`limit\` or narrow the filters for more.`
      : null
  );
}

async function stockRequests(
  ctx: AnyCtx,
  scope: Scope,
  input: Input
): Promise<string> {
  const catalog = await loadCatalog(ctx);
  const users = await loadUsers(ctx);
  const status = str(input.status) ?? "pending";

  let rows: Doc<"stockRequests">[];
  if (scope.sellerId) {
    rows = await ctx.db
      .query("stockRequests")
      .withIndex("by_agentId_and_status", (q) => q.eq("agentId", scope.sellerId!))
      .order("desc")
      .take(200);
    if (status !== "all") rows = rows.filter((r) => r.status === status);
  } else if (status === "all") {
    rows = await ctx.db.query("stockRequests").order("desc").take(200);
  } else {
    rows = await ctx.db
      .query("stockRequests")
      .withIndex("by_status_and_createdAt", (q) =>
        q.eq("status", status as "pending" | "fulfilled" | "cancelled")
      )
      .order("desc")
      .take(200);
  }

  if (rows.length === 0) return `No ${status} stock requests.`;

  return sections(
    heading(`Stock requests (${status})`),
    table(
      ["DATE", "AGENT", "PRODUCT", "VARIANT", "QTY", "STATUS", "NOTES"],
      rows.slice(0, 60).map((r) => [
        dateMY(r.createdAt),
        truncate(userLabel(users, r.agentId), 14),
        truncate(catalog.productById.get(r.productId)?.name ?? "?", 22),
        truncate(
          r.variantId ? catalog.variantById.get(r.variantId)?.name ?? "—" : "—",
          12
        ),
        num(r.quantity),
        r.status,
        truncate(r.notes ?? "", 30),
      ]),
      ["l", "l", "l", "l", "r", "l", "l"]
    )
  );
}

/* -------------------------------- dispatch -------------------------------- */

export const runReadTool = internalQuery({
  args: {
    tool: v.string(),
    input: v.any(),
    userId: v.id("users"),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<string> => {
    const scope = await getScope(ctx, args.userId);
    const input = (args.input ?? {}) as Input;

    switch (args.tool) {
      case "whoami":
        return await whoami(scope, args.now);
      case "overview":
        return await overview(ctx, scope, input, args.now);
      case "products":
        return await products(ctx, scope, input);
      case "inventory":
        return await inventory(ctx, scope, input);
      case "sales":
        return await salesList(ctx, scope, input, args.now);
      case "sale_detail":
        return await saleDetail(ctx, scope, input);
      case "batches":
        return await batchesList(ctx, input, args.now);
      case "payments":
        return await payments(ctx, scope, input);
      case "rankings":
        return await rankings(ctx, scope, input, args.now);
      case "transfers":
        return await transfers(ctx, scope, input, args.now);
      case "stock_requests":
        return await stockRequests(ctx, scope, input);
      default:
        throw new Error(`Unknown read tool: ${args.tool}`);
    }
  },
});
