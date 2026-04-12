"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatDateForInput(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function EditSaleDialog({
  sale,
  open,
  onOpenChange,
}: {
  sale: Doc<"sales">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateSaleDetails = useMutation(api.sales.updateSaleDetails);

  const [customerName, setCustomerName] = useState(
    sale.customerDetail?.name ?? ""
  );
  const [customerPhone, setCustomerPhone] = useState(
    sale.customerDetail?.phone ?? ""
  );
  const [customerEmail, setCustomerEmail] = useState(
    sale.customerDetail?.email ?? ""
  );

  // Per-line-item fulfilled dates (only for items that have been fulfilled)
  const fulfilledLineItems = (sale.lineItems ?? [])
    .map((li, index) => ({ ...li, index }))
    .filter((li) => (li.fulfilledQuantity ?? 0) > 0);

  const [itemDates, setItemDates] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const li of fulfilledLineItems) {
      if (li.fulfilledAt) {
        initial[li.index] = formatDateForInput(li.fulfilledAt);
      }
    }
    return initial;
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const customerDetail =
        sale.buyerType === "customer"
          ? {
              name: customerName.trim() || sale.customerDetail?.name || "",
              phone: customerPhone.trim() || undefined,
              email: customerEmail.trim() || undefined,
            }
          : undefined;

      // Build per-item date updates
      const lineItemFulfilledDates: { index: number; fulfilledAt: number }[] = [];
      for (const li of fulfilledLineItems) {
        const dateStr = itemDates[li.index];
        if (dateStr) {
          const ts = new Date(dateStr + "T00:00:00").getTime();
          // Only include if changed
          if (ts !== li.fulfilledAt) {
            lineItemFulfilledDates.push({ index: li.index, fulfilledAt: ts });
          }
        }
      }

      await updateSaleDetails({
        saleId: sale._id,
        customerDetail,
        lineItemFulfilledDates:
          lineItemFulfilledDates.length > 0 ? lineItemFulfilledDates : undefined,
      });

      onOpenChange(false);
    } catch (e) {
      console.error("Failed to update sale:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit Sale</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {sale.buyerType === "customer" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="edit-customer-name">Customer Name</Label>
                <Input
                  id="edit-customer-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-customer-phone">Phone</Label>
                <Input
                  id="edit-customer-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-customer-email">Email</Label>
                <Input
                  id="edit-customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Email (optional)"
                />
              </div>
            </>
          )}

          {fulfilledLineItems.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Fulfilled Dates</Label>
              {fulfilledLineItems.map((li) => {
                const name = li.productName ?? "Item";
                const variant = li.variantName;
                return (
                  <div
                    key={li.index}
                    className="flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      {variant && (
                        <p className="text-xs text-muted-foreground truncate">
                          {variant} — x{li.fulfilledQuantity ?? li.quantity}
                        </p>
                      )}
                      {!variant && (
                        <p className="text-xs text-muted-foreground">
                          x{li.fulfilledQuantity ?? li.quantity}
                        </p>
                      )}
                    </div>
                    <Input
                      type="date"
                      className="w-auto"
                      value={itemDates[li.index] ?? ""}
                      onChange={(e) =>
                        setItemDates((prev) => ({
                          ...prev,
                          [li.index]: e.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
