"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangleIcon, XIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminOrder,
  OrderStatusBadge,
  formatRM,
  summarizeLines,
  totalUnits,
} from "./order-status";

export function OrdersTable({
  orders,
  emptyMessage,
}: {
  orders: AdminOrder[];
  emptyMessage: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result = term
      ? orders.filter(
          (o) =>
            o.orderNumber.toLowerCase().includes(term) ||
            o.customer.name.toLowerCase().includes(term) ||
            o.customer.email.toLowerCase().includes(term) ||
            o.customer.phone.includes(term)
        )
      : orders;
    return [...result].sort((a, b) => b._creationTime - a._creationTime);
  }, [orders, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search order, customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[180px] lg:w-[260px]"
        />
        {search !== "" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            onClick={() => setSearch("")}
          >
            Reset
            <XIcon className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {orders.length}
        </span>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Order</TableHead>
              <TableHead className="hidden sm:table-cell">Placed</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  {orders.length === 0 ? emptyMessage : "No orders match your search."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((order) => {
                const href = `/dashboard/orders/${order._id}`;
                const units = totalUnits(order.lines);
                return (
                  <TableRow
                    key={order._id}
                    className="cursor-pointer"
                    onClick={() => router.push(href)}
                  >
                    <TableCell>
                      <Link
                        href={href}
                        className="font-mono font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {order.orderNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {format(order._creationTime, "d MMM, h:mm a")}
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      <div>{format(order._creationTime, "d MMM yyyy")}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(order._creationTime, "h:mm a")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{order.customer.name}</div>
                      <div className="text-xs text-muted-foreground md:hidden">
                        {units === 1 ? "1 unit" : `${units} units`}
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-[280px] md:table-cell">
                      <div className="truncate text-sm">{summarizeLines(order.lines)}</div>
                      <div className="text-xs text-muted-foreground">
                        {units === 1 ? "1 unit" : `${units} units`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <OrderStatusBadge status={order.status} />
                        {order.needsAttention && (
                          <Badge variant="destructive">
                            <AlertTriangleIcon data-icon="inline-start" />
                            Needs attention
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">
                      {formatRM(order.total)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
