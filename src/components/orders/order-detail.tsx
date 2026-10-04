"use client";

import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
  AlertTriangleIcon,
  CheckIcon,
  MailIcon,
  RotateCcwIcon,
  MessageCircleIcon,
  PackageCheckIcon,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AdminOrder,
  PAYMENT_PROVIDER_LABELS,
  PaymentStatusBadge,
  formatRM,
} from "./order-status";
import {
  CancelOrderDialog,
  ConfirmActionDialog,
  RecordManualPaymentDialog,
  ShipOrderDialog,
} from "./order-action-dialogs";

export type OrderWithPayments = AdminOrder & { payments: Doc<"payments">[] };

const ZONE_LABELS: Record<AdminOrder["shippingZone"], string> = {
  west: "Peninsular Malaysia",
  east: "Sabah / Sarawak",
};

function formatDateTime(ts: number) {
  return format(ts, "d MMM yyyy, h:mm a");
}

function UserName({ userId }: { userId: Id<"users"> }) {
  const name = useQuery(api.users.getDisplayNameById, { userId });
  return <>{name ?? "…"}</>;
}

export function OrderActions({ order }: { order: OrderWithPayments }) {
  const markDelivered = useMutation(api.orders.markDelivered);
  const reinstate = useMutation(api.orders.reinstate);

  switch (order.status) {
    case "awaiting_payment":
    case "expired":
      return (
        <div className="flex flex-wrap gap-2">
          <RecordManualPaymentDialog
            order={order}
            hasPaymentUnderReview={order.payments.some((p) => p.status === "needs_review")}
          />
          <CancelOrderDialog order={order} />
        </div>
      );
    case "paid":
      return (
        <div className="flex flex-wrap gap-2">
          <ShipOrderDialog order={order} />
          <CancelOrderDialog order={order} />
        </div>
      );
    case "shipped":
      return (
        <div className="flex flex-wrap gap-2">
          <ConfirmActionDialog
            trigger={
              <Button size="sm">
                <PackageCheckIcon data-icon="inline-start" />
                Mark delivered
              </Button>
            }
            title={`Mark ${order.orderNumber} delivered?`}
            description="Do this once the courier shows the parcel as delivered. It cannot be undone."
            confirmLabel="Mark delivered"
            pendingLabel="Saving..."
            successMessage={`${order.orderNumber} marked as delivered`}
            errorMessage="Failed to mark delivered"
            onConfirm={() => markDelivered({ orderId: order._id })}
          />
          <ShipOrderDialog order={order} />
        </div>
      );
    case "cancelled":
      // Only worth undoing when money actually arrived.
      if (!order.payments.some((p) => p.status === "paid")) return null;
      return (
        <div className="flex flex-wrap gap-2">
          <ConfirmActionDialog
            trigger={
              <Button size="sm">
                <RotateCcwIcon data-icon="inline-start" />
                Reinstate order
              </Button>
            }
            title={`Reinstate ${order.orderNumber}?`}
            description="The customer paid for this order, so it will move back to Paid — to ship and the cancellation will be cleared. Do this if you're going to ship it rather than refund."
            confirmLabel="Reinstate order"
            pendingLabel="Reinstating..."
            successMessage={`${order.orderNumber} reinstated — ready to ship`}
            errorMessage="Failed to reinstate order"
            onConfirm={() => reinstate({ orderId: order._id })}
          />
        </div>
      );
    default:
      return null;
  }
}

function AttentionAlert({ order }: { order: AdminOrder }) {
  const resolveAttention = useMutation(api.orders.resolveAttention);
  if (!order.needsAttention) return null;
  return (
    <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
      <AlertTriangleIcon />
      <AlertTitle>This order needs attention</AlertTitle>
      <AlertDescription>
        <p className="whitespace-pre-line text-destructive">{order.needsAttention}</p>
        <div className="mt-3">
          <ConfirmActionDialog
            trigger={
              <Button size="sm" variant="outline">
                <CheckIcon data-icon="inline-start" />
                Mark resolved
              </Button>
            }
            title="Mark as resolved?"
            description="Only do this once the problem has been dealt with — e.g. the customer has been refunded. The note above will be cleared."
            confirmLabel="Mark resolved"
            pendingLabel="Saving..."
            successMessage="Marked as resolved"
            errorMessage="Failed to resolve"
            onConfirm={() => resolveAttention({ orderId: order._id })}
          />
        </div>
      </AlertDescription>
    </Alert>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words">{children}</div>
    </div>
  );
}

function Timeline({ order }: { order: AdminOrder }) {
  const events: { label: string; at: number; detail?: React.ReactNode; muted?: boolean }[] = [
    { label: "Placed", at: order._creationTime },
  ];
  if (order.paidAt) events.push({ label: "Paid", at: order.paidAt });
  if (order.shippedAt) {
    events.push({
      label: "Shipped",
      at: order.shippedAt,
      detail:
        order.courier || order.trackingNumber
          ? `${order.courier ?? ""} ${order.trackingNumber ?? ""}`.trim()
          : undefined,
    });
  }
  if (order.deliveredAt) events.push({ label: "Delivered", at: order.deliveredAt });
  if (order.cancelledAt) {
    events.push({
      label: "Cancelled",
      at: order.cancelledAt,
      detail: (
        <>
          {order.cancelledBy && (
            <>
              by <UserName userId={order.cancelledBy} />
            </>
          )}
          {order.cancellationReason && (
            <>
              {order.cancelledBy ? " — " : ""}
              {order.cancellationReason}
            </>
          )}
        </>
      ),
    });
  }
  if (order.status === "expired") events.push({ label: "Expired", at: order.expiresAt });
  if (order.status === "awaiting_payment") {
    events.push({ label: "Payment due by", at: order.expiresAt, muted: true });
  }

  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.label} className="flex gap-3">
          <span
            className={`mt-1.5 size-2 shrink-0 rounded-full ${
              e.muted ? "border border-muted-foreground" : "bg-foreground"
            }`}
          />
          <div className="min-w-0">
            <div className={e.muted ? "text-muted-foreground" : "font-medium"}>{e.label}</div>
            <div className="text-xs text-muted-foreground">{formatDateTime(e.at)}</div>
            {e.detail && <div className="mt-0.5 text-xs break-words">{e.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function AcceptPaymentButton({ payment }: { payment: Doc<"payments"> }) {
  const acceptPayment = useMutation(api.orders.acceptPayment);
  return (
    <ConfirmActionDialog
      trigger={
        <Button size="sm" variant="outline">
          <CheckIcon data-icon="inline-start" />
          Accept payment
        </Button>
      }
      title="Accept this payment?"
      description={
        <>
          {PAYMENT_PROVIDER_LABELS[payment.provider]} reported a different amount from the one
          asked for. Only accept it once you have checked the money arrived.
          <span className="mt-3 grid grid-cols-2 gap-1 rounded-md border bg-muted/30 p-3 text-foreground">
            <span className="text-muted-foreground">Asked for</span>
            <span className="text-right font-medium">{formatRM(payment.amount)}</span>
            <span className="text-muted-foreground">Received</span>
            <span className="text-right font-medium text-destructive">
              {payment.amountReceived != null ? formatRM(payment.amountReceived) : "Unknown"}
            </span>
          </span>
          <span className="mt-3 block">
            If the order is still unpaid it will be marked paid and the customer emailed a receipt.
          </span>
        </>
      }
      confirmLabel="Accept payment"
      pendingLabel="Accepting..."
      successMessage="Payment accepted"
      errorMessage="Failed to accept payment"
      onConfirm={() => acceptPayment({ paymentId: payment._id })}
    />
  );
}

function PaymentRow({ payment }: { payment: Doc<"payments"> }) {
  const amountMismatch =
    payment.amountReceived != null &&
    Math.round(payment.amountReceived * 100) !== Math.round(payment.amount * 100);
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{PAYMENT_PROVIDER_LABELS[payment.provider]}</span>
          <PaymentStatusBadge status={payment.status} />
          {payment.channel && <Badge variant="secondary">{payment.channel}</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(payment.createdAt)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Amount requested">{formatRM(payment.amount)}</Field>
        <Field label="Amount received">
          {payment.amountReceived != null ? (
            <span className={amountMismatch ? "font-medium text-destructive" : undefined}>
              {formatRM(payment.amountReceived)}
            </span>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Paid at">{payment.paidAt ? formatDateTime(payment.paidAt) : "—"}</Field>
        <Field label={payment.provider === "manual" ? "Note" : "Reference"}>
          <span className={payment.provider === "manual" ? undefined : "font-mono text-xs"}>
            {payment.reference ?? "—"}
          </span>
        </Field>
        {payment.providerTransactionId && (
          <Field label="Transaction ID">
            <span className="font-mono text-xs">{payment.providerTransactionId}</span>
          </Field>
        )}
        {payment.recordedBy && (
          <Field label="Recorded by">
            <UserName userId={payment.recordedBy} />
          </Field>
        )}
      </div>
      {payment.failureReason && (
        <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {payment.failureReason}
        </div>
      )}
      {payment.status === "needs_review" && <AcceptPaymentButton payment={payment} />}
    </div>
  );
}

export function OrderDetail({ order }: { order: OrderWithPayments }) {
  const phoneDigits = order.customer.phone.replace(/\D/g, "");
  const address = order.shippingAddress;

  return (
    <div className="space-y-6">
      <AttentionAlert order={order} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="divide-y">
                {order.lines.map((line, i) => (
                  <li
                    key={`${line.variantId}-${i}`}
                    className="flex items-start justify-between gap-4 py-2 first:pt-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{line.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {line.variantName}
                        {" · "}
                        {formatRM(line.unitPrice)} × {line.quantity}
                      </div>
                    </div>
                    <div className="shrink-0 font-medium">
                      {formatRM(line.unitPrice * line.quantity)}
                    </div>
                  </li>
                ))}
              </ul>
              <Separator />
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatRM(order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Shipping ({ZONE_LABELS[order.shippingZone]})
                  </span>
                  <span>{order.shippingFee === 0 ? "Free" : formatRM(order.shippingFee)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{formatRM(order.total)}</span>
                </div>
              </div>
              {order.notes && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <div className="mb-1 text-xs text-muted-foreground">Customer note</div>
                  <p className="whitespace-pre-line">{order.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.payments.length === 0 ? (
                <p className="text-muted-foreground">No payment attempts yet.</p>
              ) : (
                order.payments.map((p) => <PaymentRow key={p._id} payment={p} />)
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Name">{order.customer.name}</Field>
              <Field label="Email">
                <a
                  href={`mailto:${order.customer.email}`}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <MailIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="break-all">{order.customer.email}</span>
                </a>
              </Field>
              <Field label="Phone">
                <a
                  href={`https://wa.me/${phoneDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <MessageCircleIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  {`+${phoneDigits}`}
                </a>
              </Field>
            </CardContent>
          </Card>

          {/* Shipping */}
          <Card>
            <CardHeader>
              <CardTitle>Shipping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <address className="not-italic leading-relaxed">
                {address.line1}
                <br />
                {address.line2 && (
                  <>
                    {address.line2}
                    <br />
                  </>
                )}
                {address.postcode} {address.city}
                <br />
                {address.state}
              </address>
              {(order.courier || order.trackingNumber) && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Courier">{order.courier ?? "—"}</Field>
                    <Field label="Tracking number">
                      <span className="font-mono text-xs">{order.trackingNumber ?? "—"}</span>
                    </Field>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline order={order} />
              {order.saleId && (
                <p className="mt-4 text-xs text-muted-foreground">Linked to a recorded sale.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
