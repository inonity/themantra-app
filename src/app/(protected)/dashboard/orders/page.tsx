"use client";

import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrdersTable } from "@/components/orders/orders-table";
import { OrderStatus } from "@/components/orders/order-status";

type Filter = OrderStatus | "all";

// "Paid" comes first: those are the orders waiting on HQ to ship.
const FILTERS: { value: Filter; label: string; short: string; empty: string }[] = [
  { value: "paid", label: "Paid — to ship", short: "To ship", empty: "Nothing to ship. All caught up." },
  { value: "awaiting_payment", label: "Awaiting payment", short: "Unpaid", empty: "No orders awaiting payment." },
  { value: "shipped", label: "Shipped", short: "Shipped", empty: "No orders in transit." },
  { value: "delivered", label: "Delivered", short: "Delivered", empty: "No delivered orders yet." },
  { value: "cancelled", label: "Cancelled", short: "Cancelled", empty: "No cancelled orders." },
  { value: "expired", label: "Expired", short: "Expired", empty: "No expired orders." },
  { value: "all", label: "All", short: "All", empty: "No online orders yet." },
];

function isFilter(value: string | null): value is Filter {
  return FILTERS.some((f) => f.value === value);
}

function OnlineOrdersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("status");
  const filter: Filter = isFilter(raw) ? raw : "paid";

  const orders = useQuery(api.orders.list, filter === "all" ? {} : { status: filter });
  const toShip = useQuery(api.orders.list, { status: "paid" });
  // Flagged orders can sit in any status (e.g. paid after being cancelled),
  // so they get their own banner rather than relying on the current tab.
  const flagged = useQuery(api.orders.listNeedingAttention, {}) ?? [];

  const current = FILTERS.find((f) => f.value === filter)!;

  function setFilter(next: Filter) {
    router.replace(next === "paid" ? "/dashboard/orders" : `/dashboard/orders?status=${next}`, {
      scroll: false,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Online Orders</h1>
        <p className="text-muted-foreground">
          Orders placed on the storefront. Ship paid orders and keep customers updated.
        </p>
      </div>

      {flagged.length > 0 && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
          <AlertTriangleIcon />
          <AlertTitle>
            {flagged.length === 1
              ? "1 order needs attention"
              : `${flagged.length} orders need attention`}
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {flagged.map((o) => (
                <Link
                  key={o._id}
                  href={`/dashboard/orders/${o._id}`}
                  className="font-mono text-destructive"
                >
                  {o.orderNumber}
                </Link>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <Tabs value={filter} onValueChange={(v) => isFilter(v) && setFilter(v)}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value}>
                  <span className="sm:hidden">{f.short}</span>
                  <span className="hidden sm:inline">{f.label}</span>
                  {f.value === "paid" && toShip && toShip.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-100 px-1 text-xs font-medium text-orange-700">
                      {toShip.length}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {orders === undefined ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <>
            {orders.length === 200 && (
              <p className="text-xs text-muted-foreground">
                Showing the 200 most recent orders.
              </p>
            )}
            <OrdersTable orders={orders} emptyMessage={current.empty} />
          </>
        )}
      </div>
    </div>
  );
}

export default function OnlineOrdersPage() {
  return (
    <RoleGuard allowed={["admin"]}>
      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <OnlineOrdersPageInner />
      </Suspense>
    </RoleGuard>
  );
}
