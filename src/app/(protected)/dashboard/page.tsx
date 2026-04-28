"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  BanknoteIcon,
  ClockIcon,
  DollarSignIcon,
  HeartIcon,
  PlusCircleIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useCurrentUser } from "@/hooks/useStoreUserEffect";
import { SalesTable } from "@/components/sales/sales-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { StatCard } from "@/components/dashboard/stat-card";
import { SalesTimeseriesChart } from "@/components/dashboard/sales-timeseries-chart";
import { ProductRanking } from "@/components/dashboard/product-ranking";
import { AgentRanking } from "@/components/dashboard/agent-ranking";
import { ChannelBreakdown } from "@/components/dashboard/channel-breakdown";
import { FulfillmentHealth } from "@/components/dashboard/fulfillment-health";
import { BatchMaturationCard } from "@/components/dashboard/batch-maturation-card";
import { LowStockCard } from "@/components/dashboard/low-stock-card";
import { MiniMetricCard } from "@/components/dashboard/mini-metric-card";
import {
  DateRangePreset,
  DateRange,
  rangeForPreset,
} from "@/lib/date-range";

const fmtMoney = (n: number) => `RM${Math.round(n).toLocaleString()}`;

/* ------------------------------------------------------------------ */
/*  Filters bar                                                        */
/* ------------------------------------------------------------------ */

function AgentFilter({
  value,
  onChange,
}: {
  value: Id<"users"> | undefined;
  onChange: (id: Id<"users"> | undefined) => void;
}) {
  const sellers = useQuery(api.users.listSellers);
  const selected = sellers?.find((s) => s._id === value);

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">View</Label>
      <Select
        value={value ?? "__all"}
        onValueChange={(v) =>
          onChange(v === "__all" ? undefined : (v as Id<"users">))
        }
      >
        <SelectTrigger className="min-w-44">
          <SelectValue>
            {selected
              ? selected.nickname || selected.name || selected.email || "Unnamed"
              : "All sellers"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="__all">All sellers (HQ view)</SelectItem>
            {(sellers ?? []).map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.nickname || s.name || s.email || "Unnamed"}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Admin Dashboard                                                    */
/* ------------------------------------------------------------------ */

function AdminDashboard() {
  const [preset, setPreset] = useState<DateRangePreset>("last30");
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("last30"));
  const [agentId, setAgentId] = useState<Id<"users"> | undefined>(undefined);
  const [groupByVariant, setGroupByVariant] = useState(true);

  const stats = useQuery(api.dashboard.getStats, {
    from: range.from,
    to: range.to,
    agentId,
  });
  const timeseries = useQuery(api.dashboard.getTimeseries, {
    from: range.from,
    to: range.to,
    agentId,
  });
  const products = useQuery(api.dashboard.getProductRanking, {
    from: range.from,
    to: range.to,
    agentId,
    groupByVariant,
  });
  const agentRanking = useQuery(api.dashboard.getAgentRanking, {
    from: range.from,
    to: range.to,
  });
  const batchAlerts = useQuery(api.dashboard.getBatchMaturationAlerts);
  const lowStock = useQuery(api.dashboard.getLowStockProducts, {});

  // Existing tables
  const allSales = useQuery(api.sales.list);
  const pendingFulfillment = useQuery(api.sales.listPendingFulfillment);
  const unpaidSales = useQuery(api.sales.listUnpaid);
  const allProducts = useQuery(api.products.list);
  const allBatches = useQuery(api.batches.listAll);
  const agents = useQuery(api.users.listAgents);
  const offers = useQuery(api.offers.list);

  const recentSales = useMemo(() => (allSales ?? []).slice(0, 4), [allSales]);
  const oldestPending = useMemo(
    () => [...(pendingFulfillment ?? [])].reverse().slice(0, 4),
    [pendingFulfillment]
  );

  // Pending customer payments — exclude internal sales (those are bookkeeping, not customer payments)
  const pendingPayments = useMemo(
    () => (unpaidSales ?? []).filter((s) => s.saleChannel !== "internal"),
    [unpaidSales]
  );
  const pendingPaymentsTotalOutstanding = useMemo(
    () =>
      pendingPayments.reduce(
        (sum, s) => sum + (s.totalAmount - s.amountPaid),
        0
      ),
    [pendingPayments]
  );
  const recentPendingPayments = useMemo(
    () => pendingPayments.slice(0, 4),
    [pendingPayments]
  );

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period</Label>
          <DateRangePicker
            preset={preset}
            range={range}
            onChange={(p, r) => {
              setPreset(p);
              setRange(r);
            }}
          />
        </div>
        <AgentFilter value={agentId} onChange={setAgentId} />
      </div>

      {/* Stat cards */}
      <div
        className={
          pendingPayments.length > 0
            ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
            : "grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        }
      >
        <StatCard
          title="Total Sales"
          icon={<ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />}
          value={String(stats?.current.sales ?? 0)}
          hint={`${stats?.current.units ?? 0} units sold`}
          delta={stats?.deltas.sales ?? null}
          spark={stats?.spark.sales}
        />
        <StatCard
          title="Total Revenue"
          icon={<DollarSignIcon className="h-4 w-4 text-muted-foreground" />}
          value={fmtMoney(stats?.current.revenue ?? 0)}
          hint={
            (stats?.current.sales ?? 0) > 0
              ? `${fmtMoney((stats!.current.revenue) / (stats!.current.sales))} avg`
              : "—"
          }
          delta={stats?.deltas.revenue ?? null}
          spark={stats?.spark.revenue}
        />
        <StatCard
          title="HQ Revenue"
          icon={<DollarSignIcon className="h-4 w-4 text-muted-foreground" />}
          value={fmtMoney(stats?.current.hqRevenue ?? 0)}
          hint="excluding agent commission"
          delta={stats?.deltas.hqRevenue ?? null}
          spark={stats?.spark.hqRevenue}
        />
        <StatCard
          title="Agent Commission"
          icon={<DollarSignIcon className="h-4 w-4 text-muted-foreground" />}
          value={fmtMoney(stats?.current.commission ?? 0)}
          hint="total agent earnings"
          delta={stats?.deltas.commission ?? null}
          spark={stats?.spark.commission}
        />
        <StatCard
          title="Pending Stock"
          icon={<ClockIcon className="h-4 w-4 text-muted-foreground" />}
          value={String(stats?.pendingStockCount ?? 0)}
          hint={(stats?.pendingStockCount ?? 0) === 0 ? "All fulfilled" : "awaiting delivery"}
        />
        {pendingPayments.length > 0 && (
          <StatCard
            title="Pending Payments"
            icon={<BanknoteIcon className="h-4 w-4 text-muted-foreground" />}
            value={fmtMoney(pendingPaymentsTotalOutstanding)}
            hint={`across ${pendingPayments.length} ${pendingPayments.length === 1 ? "sale" : "sales"}`}
          />
        )}
      </div>

      {/* Timeseries chart */}
      <SalesTimeseriesChart
        granularity={timeseries?.granularity ?? "day"}
        buckets={timeseries?.buckets ?? []}
        isLoading={timeseries === undefined}
      />

      {/* Rankings row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProductRanking
          rows={(products ?? []).map((r) => ({
            ...r,
            productId: r.productId as unknown as string,
            variantId: r.variantId as unknown as string | undefined,
          }))}
          groupByVariant={groupByVariant}
          onGroupByVariantChange={setGroupByVariant}
          isLoading={products === undefined}
        />
        <AgentRanking
          rows={(agentRanking ?? []).map((r) => ({
            ...r,
            agentId: r.agentId as unknown as string,
          }))}
          isLoading={agentRanking === undefined}
        />
      </div>

      {/* Channel + fulfillment row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChannelBreakdown rows={stats?.channelBreakdown ?? []} />
        <FulfillmentHealth
          avgDaysToFulfill={stats?.fulfillment.avgDaysToFulfill ?? null}
          pctOnTime={stats?.fulfillment.pctOnTime ?? null}
          pendingCount={stats?.fulfillment.pendingCount ?? 0}
          buckets={stats?.fulfillment.buckets ?? { "0-7": 0, "7-14": 0, "14+": 0 }}
        />
      </div>

      {/* Extra metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniMetricCard
          title="Interest → Sale"
          description="Conversion rate"
          icon={<HeartIcon className="h-4 w-4 text-muted-foreground" />}
          value={
            stats?.interestConversion.rate === null || stats === undefined
              ? "—"
              : `${Math.round(stats.interestConversion.rate ?? 0)}%`
          }
          hint={
            stats
              ? `${stats.interestConversion.converted} of ${stats.interestConversion.total}`
              : undefined
          }
        />
        <MiniMetricCard
          title="Repeat customers"
          description="Buyers with 2+ orders"
          icon={<UsersIcon className="h-4 w-4 text-muted-foreground" />}
          value={
            stats?.repeatCustomer.rate === null || stats === undefined
              ? "—"
              : `${Math.round(stats.repeatCustomer.rate ?? 0)}%`
          }
          hint={
            stats
              ? `${stats.repeatCustomer.repeatSales} of ${stats.repeatCustomer.totalSales}`
              : undefined
          }
        />
        <BatchMaturationCard
          alerts={(batchAlerts ?? []).map((a) => ({
            ...a,
            batchId: a.batchId as unknown as string,
          }))}
        />
        <LowStockCard
          rows={(lowStock ?? []).map((r) => ({
            ...r,
            productId: r.productId as unknown as string,
            variantId: r.variantId as unknown as string | undefined,
          }))}
          href="/dashboard/stock"
          linkLabel="Stock"
        />
      </div>

      {/* Pending customer payments — only when there are any */}
      {pendingPayments.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                <BanknoteIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Pending Customer Payments
                  <span className="inline-flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-amber-500/15 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {pendingPayments.length}
                  </span>
                </CardTitle>
                <CardDescription>
                  RM{pendingPaymentsTotalOutstanding.toFixed(2)} outstanding across{" "}
                  {pendingPayments.length} {pendingPayments.length === 1 ? "sale" : "sales"}
                </CardDescription>
              </div>
            </div>
            <Link
              href="/dashboard/sales?status=unpaid,partial"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <SalesTable
              sales={recentPendingPayments}
              products={allProducts ?? []}
              batches={allBatches ?? []}
              agents={agents ?? []}
              offers={offers ?? []}
              showAgent
              hideFilters
            />
          </CardContent>
        </Card>
      )}

      {/* Recent sales + pending fulfillment */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>Latest 4 sales across all agents</CardDescription>
          </div>
          <Link
            href="/dashboard/sales"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {allSales === undefined ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : recentSales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No sales recorded yet.
            </p>
          ) : (
            <SalesTable
              sales={recentSales}
              products={allProducts ?? []}
              batches={allBatches ?? []}
              agents={agents ?? []}
              offers={offers ?? []}
              showAgent
              hideFilters
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pending Fulfillment</CardTitle>
            <CardDescription>Oldest pending sales first</CardDescription>
          </div>
          <Link
            href="/dashboard/sales"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Manage
          </Link>
        </CardHeader>
        <CardContent>
          {pendingFulfillment === undefined ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : oldestPending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No sales pending fulfillment. All caught up!
            </p>
          ) : (
            <SalesTable
              sales={oldestPending}
              products={allProducts ?? []}
              batches={allBatches ?? []}
              agents={agents ?? []}
              offers={offers ?? []}
              showAgent
              hideFilters
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent / Sales Dashboard                                            */
/* ------------------------------------------------------------------ */

function AgentSalesDashboard() {
  const [preset, setPreset] = useState<DateRangePreset>("last30");
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("last30"));
  const [groupByVariant, setGroupByVariant] = useState(true);

  const stats = useQuery(api.dashboard.getStats, {
    from: range.from,
    to: range.to,
  });
  const timeseries = useQuery(api.dashboard.getTimeseries, {
    from: range.from,
    to: range.to,
  });
  const products = useQuery(api.dashboard.getProductRanking, {
    from: range.from,
    to: range.to,
    groupByVariant,
  });
  const lowStock = useQuery(api.dashboard.getLowStockProducts, {});

  // Existing tables
  const sales = useQuery(api.sales.listByAgent);
  const allProducts = useQuery(api.products.list);
  const allBatches = useQuery(api.batches.listAll);

  const offerIds = useMemo(() => {
    if (!sales) return [];
    const ids = new Set<Id<"offers">>();
    for (const s of sales) if (s.offerId) ids.add(s.offerId);
    return [...ids];
  }, [sales]);
  const offers = useQuery(
    api.offers.getByIds,
    offerIds.length > 0 ? { ids: offerIds } : "skip"
  );

  const recentSales = useMemo(() => (sales ?? []).slice(0, 4), [sales]);
  const oldestPending = useMemo(() => {
    if (!sales) return [];
    return sales
      .filter(
        (s) =>
          s.fulfillmentStatus === "pending_stock" ||
          s.fulfillmentStatus === "partial"
      )
      .reverse()
      .slice(0, 4);
  }, [sales]);

  // Pending customer payments (unpaid/partial), excluding internal bookkeeping sales
  const pendingPayments = useMemo(() => {
    if (!sales) return [];
    return sales.filter(
      (s) =>
        (s.paymentStatus === "unpaid" || s.paymentStatus === "partial") &&
        s.saleChannel !== "internal"
    );
  }, [sales]);
  const pendingPaymentsTotalOutstanding = useMemo(
    () =>
      pendingPayments.reduce(
        (sum, s) => sum + (s.totalAmount - s.amountPaid),
        0
      ),
    [pendingPayments]
  );
  const recentPendingPayments = useMemo(
    () => pendingPayments.slice(0, 4),
    [pendingPayments]
  );

  const hasEarnings = (stats?.current.commission ?? 0) > 0;

  return (
    <>
      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href="/dashboard/record-sale"
          className={buttonVariants({ variant: "default", size: "lg" })}
        >
          <PlusCircleIcon data-icon="inline-start" />
          Add Sale
        </Link>
        <Link
          href="/dashboard/record-interest"
          className={`${buttonVariants({ variant: "outline", size: "lg" })} border-border!`}
        >
          <HeartIcon data-icon="inline-start" />
          Record Interest
        </Link>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period</Label>
          <DateRangePicker
            preset={preset}
            range={range}
            onChange={(p, r) => {
              setPreset(p);
              setRange(r);
            }}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div
        className={
          3 + (hasEarnings ? 1 : 0) + (pendingPayments.length > 0 ? 1 : 0) >= 5
            ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        }
      >
        <StatCard
          title="My Sales"
          icon={<TrendingUpIcon className="h-4 w-4 text-muted-foreground" />}
          value={String(stats?.current.sales ?? 0)}
          hint={`${stats?.current.units ?? 0} units sold`}
          delta={stats?.deltas.sales ?? null}
          spark={stats?.spark.sales}
        />
        <StatCard
          title="Total Revenue"
          icon={<DollarSignIcon className="h-4 w-4 text-muted-foreground" />}
          value={fmtMoney(stats?.current.revenue ?? 0)}
          hint={`across ${stats?.current.sales ?? 0} sales`}
          delta={stats?.deltas.revenue ?? null}
          spark={stats?.spark.revenue}
        />
        {hasEarnings && (
          <StatCard
            title="My Earnings"
            icon={<DollarSignIcon className="h-4 w-4 text-muted-foreground" />}
            value={fmtMoney(stats?.current.commission ?? 0)}
            hint="total commission earned"
            delta={stats?.deltas.commission ?? null}
            spark={stats?.spark.commission}
          />
        )}
        <StatCard
          title="Pending Fulfillment"
          icon={<ClockIcon className="h-4 w-4 text-muted-foreground" />}
          value={String(stats?.pendingStockCount ?? 0)}
          hint={
            (stats?.pendingStockCount ?? 0) === 0
              ? "All fulfilled"
              : "awaiting delivery"
          }
        />
        {pendingPayments.length > 0 && (
          <StatCard
            title="Pending Payments"
            icon={<BanknoteIcon className="h-4 w-4 text-muted-foreground" />}
            value={fmtMoney(pendingPaymentsTotalOutstanding)}
            hint={`across ${pendingPayments.length} ${pendingPayments.length === 1 ? "sale" : "sales"}`}
          />
        )}
      </div>

      {/* Timeseries */}
      <SalesTimeseriesChart
        granularity={timeseries?.granularity ?? "day"}
        buckets={timeseries?.buckets ?? []}
        isLoading={timeseries === undefined}
      />

      {/* Rankings + Channel */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProductRanking
          rows={(products ?? []).map((r) => ({
            ...r,
            productId: r.productId as unknown as string,
            variantId: r.variantId as unknown as string | undefined,
          }))}
          groupByVariant={groupByVariant}
          onGroupByVariantChange={setGroupByVariant}
          isLoading={products === undefined}
        />
        <ChannelBreakdown rows={stats?.channelBreakdown ?? []} />
      </div>

      {/* Extras */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniMetricCard
          title="Interest → Sale"
          description="Your conversion rate"
          icon={<HeartIcon className="h-4 w-4 text-muted-foreground" />}
          value={
            stats?.interestConversion.rate === null || stats === undefined
              ? "—"
              : `${Math.round(stats.interestConversion.rate ?? 0)}%`
          }
          hint={
            stats
              ? `${stats.interestConversion.converted} of ${stats.interestConversion.total}`
              : undefined
          }
        />
        <MiniMetricCard
          title="Repeat customers"
          description="Your buyers with 2+ orders"
          icon={<UsersIcon className="h-4 w-4 text-muted-foreground" />}
          value={
            stats?.repeatCustomer.rate === null || stats === undefined
              ? "—"
              : `${Math.round(stats.repeatCustomer.rate ?? 0)}%`
          }
          hint={
            stats
              ? `${stats.repeatCustomer.repeatSales} of ${stats.repeatCustomer.totalSales}`
              : undefined
          }
        />
        <LowStockCard
          rows={(lowStock ?? []).map((r) => ({
            ...r,
            productId: r.productId as unknown as string,
            variantId: r.variantId as unknown as string | undefined,
          }))}
          description="Your inventory below threshold"
          href="/dashboard/inventory"
          linkLabel="Inventory"
        />
        <FulfillmentHealth
          avgDaysToFulfill={stats?.fulfillment.avgDaysToFulfill ?? null}
          pctOnTime={stats?.fulfillment.pctOnTime ?? null}
          pendingCount={stats?.fulfillment.pendingCount ?? 0}
          buckets={stats?.fulfillment.buckets ?? { "0-7": 0, "7-14": 0, "14+": 0 }}
        />
      </div>

      {/* Pending customer payments — only when there are any */}
      {pendingPayments.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                <BanknoteIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Pending Customer Payments
                  <span className="inline-flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-amber-500/15 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {pendingPayments.length}
                  </span>
                </CardTitle>
                <CardDescription>
                  RM{pendingPaymentsTotalOutstanding.toFixed(2)} outstanding across{" "}
                  {pendingPayments.length} {pendingPayments.length === 1 ? "sale" : "sales"}
                </CardDescription>
              </div>
            </div>
            <Link
              href="/dashboard/my-sales?status=unpaid,partial"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <SalesTable
              sales={recentPendingPayments}
              products={allProducts ?? []}
              batches={allBatches ?? []}
              offers={offers ?? []}
              hideFilters
            />
          </CardContent>
        </Card>
      )}

      {/* Recent sales + pending */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>Your latest 4 sales</CardDescription>
          </div>
          <Link
            href="/dashboard/my-sales"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {sales === undefined ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : recentSales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No sales yet. Create your first sale order to get started!
            </p>
          ) : (
            <SalesTable
              sales={recentSales}
              products={allProducts ?? []}
              batches={allBatches ?? []}
              offers={offers ?? []}
              hideFilters
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pending Fulfillment</CardTitle>
            <CardDescription>Oldest pending sales first</CardDescription>
          </div>
          <Link
            href="/dashboard/my-sales"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {sales === undefined ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : oldestPending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No sales pending fulfillment. All caught up!
            </p>
          ) : (
            <SalesTable
              sales={oldestPending}
              products={allProducts ?? []}
              batches={allBatches ?? []}
              offers={offers ?? []}
              hideFilters
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard Page                                                */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const user = useCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        {user?.name && (
          <p className="text-muted-foreground">Welcome back, {user.name}.</p>
        )}
      </div>

      {user?.role === "admin" && <AdminDashboard />}
      {(user?.role === "agent" || user?.role === "sales") && <AgentSalesDashboard />}
    </div>
  );
}
