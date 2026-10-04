"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { BanknoteIcon, PencilIcon, TruckIcon, XCircleIcon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/utils";
import { AdminOrder, formatRM } from "./order-status";

const COMMON_COURIERS = [
  "J&T Express",
  "Pos Laju",
  "DHL eCommerce",
  "Ninja Van",
  "City-Link Express",
  "GDEX",
  "SPX Express",
  "Lalamove",
];

export function RecordManualPaymentDialog({
  order,
  hasPaymentUnderReview = false,
}: {
  order: AdminOrder;
  hasPaymentUnderReview?: boolean;
}) {
  const recordManualPayment = useMutation(api.orders.recordManualPayment);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) setNote("");
    setOpen(next);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await recordManualPayment({ orderId: order._id, note: note.trim() || undefined });
      toast.success(`${order.orderNumber} marked as paid`);
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to record payment"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <BanknoteIcon data-icon="inline-start" />
        Record manual payment
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record manual payment</DialogTitle>
          <DialogDescription>
            For money received outside the payment gateway — bank transfer, DuitNow, cash.
            The order is marked paid for the full {formatRM(order.total)} and the customer
            is emailed a confirmation.
          </DialogDescription>
        </DialogHeader>

        {hasPaymentUnderReview && (
          <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            A gateway payment on this order is waiting for review. If that money did arrive,
            use <span className="font-medium">Accept payment</span> on it under Payments
            instead — recording a manual payment as well would count it twice.
          </div>
        )}

        {order.status === "expired" && (
          <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            This order has expired. Recording a payment revives it as a paid order.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="manual-payment-note">Reference (optional)</Label>
          <Input
            id="manual-payment-note"
            placeholder="e.g. Maybank ref 123456"
            maxLength={120}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Recording..." : `Mark paid — ${formatRM(order.total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Marks a paid order shipped, or corrects the tracking on a shipped one. */
export function ShipOrderDialog({ order }: { order: AdminOrder }) {
  const markShipped = useMutation(api.orders.markShipped);
  const isEdit = order.status === "shipped";
  const [open, setOpen] = useState(false);
  const [courier, setCourier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setCourier(order.courier ?? "");
      setTrackingNumber(order.trackingNumber ?? "");
    }
    setOpen(next);
  }

  const canSubmit = courier.trim() !== "" && trackingNumber.trim() !== "";

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await markShipped({
        orderId: order._id,
        courier: courier.trim(),
        trackingNumber: trackingNumber.trim(),
      });
      toast.success(
        isEdit
          ? "Tracking updated — customer emailed again"
          : `${order.orderNumber} marked as shipped`
      );
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to update shipping"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant={isEdit ? "outline" : "default"} />}>
        {isEdit ? <PencilIcon data-icon="inline-start" /> : <TruckIcon data-icon="inline-start" />}
        {isEdit ? "Edit tracking" : "Mark shipped"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit tracking" : "Mark shipped"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Saving re-sends the shipping email to the customer with the corrected details."
              : "The customer is emailed the courier and tracking number."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="ship-order-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="ship-courier">Courier</Label>
            <Input
              id="ship-courier"
              list="ship-courier-options"
              placeholder="e.g. J&T Express"
              maxLength={60}
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
            />
            <datalist id="ship-courier-options">
              {COMMON_COURIERS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ship-tracking">Tracking number</Label>
            <Input
              id="ship-tracking"
              className="font-mono"
              maxLength={60}
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="ship-order-form" disabled={submitting || !canSubmit}>
            {submitting ? "Saving..." : isEdit ? "Save & re-send email" : "Mark shipped"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelOrderDialog({ order }: { order: AdminOrder }) {
  const cancelOrder = useMutation(api.orders.cancel);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) setReason("");
    setOpen(next);
  }

  async function handleCancel() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await cancelOrder({ orderId: order._id, reason: reason.trim() });
      toast.success(`${order.orderNumber} cancelled`);
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to cancel order"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          />
        }
      >
        <XCircleIcon data-icon="inline-start" />
        Cancel order
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {order.orderNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            The order will be marked cancelled. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {order.status === "paid" ? (
          <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            This order has been paid ({formatRM(order.total)}). Cancelling does not refund the
            customer — refund them yourself.
          </div>
        ) : order.status === "awaiting_payment" ? (
          <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            If the customer still completes payment, the order will be flagged for attention.
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="cancel-order-reason">Reason</Label>
          <Textarea
            id="cancel-order-reason"
            placeholder="e.g. Out of stock, customer asked to cancel..."
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Keep order</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            disabled={submitting || !reason.trim()}
            className="bg-destructive hover:bg-destructive/90"
          >
            {submitting ? "Cancelling..." : "Cancel order"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A yes/no confirmation around a single mutation. */
export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  successMessage,
  errorMessage,
  onConfirm,
}: {
  trigger: React.ReactElement;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  successMessage: string;
  errorMessage: string;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
      toast.success(successMessage);
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, errorMessage));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={submitting}>
            {submitting ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
