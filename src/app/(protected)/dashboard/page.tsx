"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import Link from "next/link";
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
  PlusCircleIcon,
  HeartIcon,
  DollarSignIcon,
  AlertCircleIcon,
  ClockIcon,
  TrendingUpIcon,
  ShoppingCartIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Admin Dashboard                                                    */
/* ------------------------------------------------------------------ */

function AdminDashboard() {
  const sales = useQuery(api.sales.list);
  const pendingFulfillment = useQuery(api.sales.listPendingFulfillment);
  const products = useQuery(api.products.list);
  const batches = useQuery(api.batches.listAll);
  const agents = useQuery(api.users.listAgents);
  const offers = useQuery(api.offers.list);

  const isLoading =
    sales === undefined ||
    products === undefined ||
    batches === undefined ||
    agents === undefined ||
    offers === undefined;

  const stats = useMemo(() => {
    if (!sales) return null;
    const totalSales = sales.length;
    const totalUnits = sales.reduce((sum, s) => sum + s.totalQuantity, 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const avgRevenue = totalSales > 0 ? totalRevenue / totalSales : 0;
    const unpaidCount = sales.filter(
      (s) => s.paymentStatus === "unpaid" || s.paymentStatus === "partial"
    ).length;
    const pendingStock = sales.filter(
      (s) => s.fulfillmentStatus === "pending_stock"
    ).length;
    return { totalSales, totalUnits, totalRevenue, avgRevenue, unpaidCount, pendingStock };
  }, [sales]);

  const recentSales = useMemo(() => {
    if (!sales) return [];
    return sales.slice(0, 4);
  }, [sales]);

  // Oldest first — so the longest-waiting sales show up first
  const oldestPending = useMemo(() => {
    if (!pendingFulfillment) return [];
    return [...pendingFulfillment].reverse().slice(0, 4);
  }, [pendingFulfillment]);

  if (isLoading) {
    return <div className="text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <>
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">RM{stats!.totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              RM{stats!.avgRevenue.toFixed(2)} avg per sale
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats!.totalSales}</div>
            <p className="text-xs text-muted-foreground">
              {stats!.totalUnits} units sold
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unpaid</CardTitle>
            <AlertCircleIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats!.unpaidCount}</div>
            <p className="text-xs text-muted-foreground">
              {stats!.unpaidCount === 0 ? "All settled" : "pending payment"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Stock</CardTitle>
            <ClockIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats!.pendingStock}</div>
            <p className="text-xs text-muted-foreground">
              {stats!.pendingStock === 0 ? "All fulfilled" : "awaiting delivery"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent sales table in a card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>Latest 4 sales across all agents</CardDescription>
          </div>
          <Link href="/dashboard/sales" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {recentSales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No sales recorded yet.
            </p>
          ) : (
            <SalesTable
              sales={recentSales}
              products={products!}
              batches={batches!}
              agents={agents!}
              offers={offers!}
              showAgent
            />
          )}
        </CardContent>
      </Card>

      {/* Pending fulfillment card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pending Fulfillment</CardTitle>
            <CardDescription>Oldest pending sales first</CardDescription>
          </div>
          <Link href="/dashboard/sales" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Manage
          </Link>
        </CardHeader>
        <CardContent>
          {oldestPending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No sales pending fulfillment. All caught up!
            </p>
          ) : (
            <SalesTable
              sales={oldestPending}
              products={products!}
              batches={batches!}
              agents={agents!}
              offers={offers!}
              showAgent
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
  const sales = useQuery(api.sales.listByAgent);
  const products = useQuery(api.products.list);
  const batches = useQuery(api.batches.listAll);

  const offerIds = useMemo(() => {
    if (!sales) return [];
    const ids = new Set<Id<"offers">>();
    for (const s of sales) {
      if (s.offerId) ids.add(s.offerId);
    }
    return [...ids];
  }, [sales]);

  const offers = useQuery(
    api.offers.getByIds,
    offerIds.length > 0 ? { ids: offerIds } : "skip"
  );

  const isLoading =
    sales === undefined ||
    products === undefined ||
    batches === undefined ||
    (offerIds.length > 0 && offers === undefined);

  const stats = useMemo(() => {
    if (!sales) return null;
    const totalSales = sales.length;
    const totalUnits = sales.reduce((sum, s) => sum + s.totalQuantity, 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalEarnings = sales.reduce(
      (sum, s) => sum + (s.agentCommission ?? 0),
      0
    );
    let pendingUnits = 0;
    for (const s of sales) {
      if (
        s.fulfillmentStatus === "pending_stock" ||
        s.fulfillmentStatus === "partial"
      ) {
        if (s.lineItems) {
          for (const li of s.lineItems) {
            const fulfilled = li.fulfilledQuantity ?? 0;
            const remaining = li.quantity - fulfilled;
            if (remaining > 0) pendingUnits += remaining;
          }
        } else {
          pendingUnits += s.totalQuantity;
        }
      }
    }
    return { totalSales, totalUnits, totalRevenue, totalEarnings, pendingUnits };
  }, [sales]);

  const recentSales = useMemo(() => {
    if (!sales) return [];
    return sales.slice(0, 4);
  }, [sales]);

  // Oldest first — longest-waiting sales surface first
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

  return (
    <>
      {/* Quick actions */}
      <div className="flex gap-3">
        <Link href="/dashboard/record-sale" className={buttonVariants({ variant: "default", size: "lg" })}>
          <PlusCircleIcon className="h-4 w-4" />
          Add Sale
        </Link>
        <Link href="/dashboard/record-interest" className={`${buttonVariants({ variant: "outline", size: "lg" })} border-border!`}>
          <HeartIcon className="h-4 w-4" />
          Record Interest
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">My Sales</CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats?.totalSales ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.totalUnits ?? 0} units sold
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              RM{(stats?.totalRevenue ?? 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              across {stats?.totalSales ?? 0} sales
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">My Earnings</CardTitle>
            <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              RM{(stats?.totalEarnings ?? 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              total commission earned
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Fulfillment</CardTitle>
            <ClockIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats?.pendingUnits ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {(stats?.pendingUnits ?? 0) === 0 ? "All fulfilled" : "units awaiting delivery"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent sales table in a card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>Your latest 4 sales</CardDescription>
          </div>
          <Link href="/dashboard/my-sales" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : recentSales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No sales yet. Create your first sale order to get started!
            </p>
          ) : (
            <SalesTable
              sales={recentSales}
              products={products!}
              batches={batches!}
              offers={offers ?? []}
            />
          )}
        </CardContent>
      </Card>

      {/* Pending fulfillment table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pending Fulfillment</CardTitle>
            <CardDescription>Oldest pending sales first</CardDescription>
          </div>
          <Link href="/dashboard/my-sales" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : oldestPending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No sales pending fulfillment. All caught up!
            </p>
          ) : (
            <SalesTable
              sales={oldestPending}
              products={products!}
              batches={batches!}
              offers={offers ?? []}
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
        <p className="text-muted-foreground">
          Welcome back{user?.email ? `, ${user.email}` : ""}.
        </p>
      </div>

      {user?.role === "admin" && <AdminDashboard />}
      {(user?.role === "agent" || user?.role === "sales") && <AgentSalesDashboard />}
    </div>
  );
}
