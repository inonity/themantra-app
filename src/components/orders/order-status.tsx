import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";

/** An order as HQ sees it — the shopper's access key is stripped server-side. */
export type AdminOrder = FunctionReturnType<typeof api.orders.list>[number];
export type OrderStatus = Doc<"orders">["status"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid — to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  expired: "Expired",
};

const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  awaiting_payment: "text-yellow-700 border-yellow-300",
  paid: "text-orange-600 border-orange-300",
  shipped: "text-blue-600 border-blue-300",
  delivered: "text-green-600 border-green-300",
  cancelled: "text-muted-foreground",
  expired: "text-muted-foreground",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={ORDER_STATUS_STYLES[status]}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export const PAYMENT_STATUS_LABELS: Record<Doc<"payments">["status"], string> = {
  created: "Created",
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  needs_review: "Needs review",
};

export const PAYMENT_PROVIDER_LABELS: Record<Doc<"payments">["provider"], string> = {
  toyyibpay: "ToyyibPay",
  manual: "Manual",
};

export function PaymentStatusBadge({ status }: { status: Doc<"payments">["status"] }) {
  const variant =
    status === "paid" ? "default" : status === "failed" || status === "needs_review" ? "destructive" : "outline";
  return <Badge variant={variant}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}

export function formatRM(amount: number) {
  return `RM${amount.toFixed(2)}`;
}

/** "Oud Royale 50ml ×2, +1 more" */
export function summarizeLines(lines: AdminOrder["lines"]) {
  if (lines.length === 0) return "—";
  const [first, ...rest] = lines;
  const label = `${lineLabel(first)} ×${first.quantity}`;
  return rest.length > 0 ? `${label}, +${rest.length} more` : label;
}

export function lineLabel(line: AdminOrder["lines"][number]) {
  return line.variantName ? `${line.productName} — ${line.variantName}` : line.productName;
}

export function totalUnits(lines: AdminOrder["lines"]) {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}
