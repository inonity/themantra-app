"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/orders/order-status";
import { OrderActions, OrderDetail } from "@/components/orders/order-detail";

// The query is admin-only, so it must not run until RoleGuard has let us in.
function OrderDetailPageInner({ orderId }: { orderId: Id<"orders"> }) {
  const order = useQuery(api.orders.get, { orderId });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to Online Orders
        </Link>

        {order === undefined ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : order === null ? (
          <div className="text-muted-foreground">Order not found.</div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-2xl sm:text-3xl font-semibold tracking-tight">
                  {order.orderNumber}
                </h1>
                <OrderStatusBadge status={order.status} />
                {order.needsAttention && (
                  <Badge variant="destructive">
                    <AlertTriangleIcon data-icon="inline-start" />
                    Needs attention
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1">
                Placed {format(order._creationTime, "d MMM yyyy, h:mm a")} by{" "}
                {order.customer.name}
              </p>
            </div>
            <OrderActions order={order} />
          </div>
        )}
      </div>

      {order && <OrderDetail order={order} />}
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.orderId as Id<"orders">;

  return (
    <RoleGuard allowed={["admin"]}>
      <OrderDetailPageInner orderId={orderId} />
    </RoleGuard>
  );
}
