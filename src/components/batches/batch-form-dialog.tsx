"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { useMemo } from "react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function addWeeks(dateStr: string, weeks: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().split("T")[0];
}

export function BatchFormDialog({
  productId: fixedProductId,
  products,
  batch,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  productId?: Id<"products">;
  products?: Doc<"products">[];
  batch?: Doc<"batches">;
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const createBatch = useMutation(api.batches.create);
  const updateBatch = useMutation(api.batches.update);

  const isEdit = !!batch;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [selectedProductId, setSelectedProductId] = useState<string>(
    fixedProductId ?? batch?.productId ?? ""
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    batch?.variantId ?? ""
  );
  const [batchCode, setBatchCode] = useState(batch?.batchCode ?? "");
  const [batchCodeManuallyEdited, setBatchCodeManuallyEdited] = useState(isEdit);
  const [manufacturedDate, setManufacturedDate] = useState(batch?.manufacturedDate ?? "");
  const [expectedReadyDate, setExpectedReadyDate] = useState(batch?.expectedReadyDate ?? "");
  const [expectedReadyDateManuallyEdited, setExpectedReadyDateManuallyEdited] =
    useState(isEdit);
  const [totalQuantity, setTotalQuantity] = useState(
    batch ? String(batch.totalQuantity) : ""
  );
  const [status, setStatus] = useState<
    "upcoming" | "partial" | "available" | "depleted" | "cancelled"
  >(batch?.status ?? "upcoming");
  const [notes, setNotes] = useState(batch?.notes ?? "");
  const [error, setError] = useState("");

  const activeProductId = fixedProductId ?? batch?.productId ?? (selectedProductId as Id<"products">);

  const productVariants = useQuery(
    api.productVariants.listByProduct,
    activeProductId ? { productId: activeProductId as Id<"products"> } : "skip"
  );

  const activeVariants = useMemo(
    () => (productVariants ?? []).filter((v) => v.status === "active"),
    [productVariants]
  );

  const nextBatchInfo = useQuery(
    api.batches.getNextBatchNumber,
    activeProductId && !isEdit ? { productId: activeProductId as Id<"products"> } : "skip"
  );

  // Auto-fill batch code when product changes (create mode only)
  useEffect(() => {
    if (nextBatchInfo && !batchCodeManuallyEdited && !isEdit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBatchCode(nextBatchInfo.suggestedCode);
    }
  }, [nextBatchInfo, batchCodeManuallyEdited, isEdit]);

  // Sync form when batch prop changes (for edit mode)
  useEffect(() => {
    if (batch && open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedProductId(batch.productId);
      setBatchCode(batch.batchCode);
      setManufacturedDate(batch.manufacturedDate);
      setExpectedReadyDate(batch.expectedReadyDate ?? "");
      setTotalQuantity(String(batch.totalQuantity));
      setStatus(batch.status);
      setNotes(batch.notes ?? "");
    }
  }, [batch, open]);

  // Auto-select product when only one is available (create mode, no fixed product)
  useEffect(() => {
    if (!open || isEdit || fixedProductId || selectedProductId) return;
    if (!products || products.length !== 1) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedProductId(products[0]._id);
  }, [open, isEdit, fixedProductId, selectedProductId, products]);

  // Auto-select variant when only one active variant exists (create mode)
  useEffect(() => {
    if (!open || isEdit || selectedVariantId) return;
    if (activeVariants.length !== 1) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedVariantId(activeVariants[0]._id);
  }, [open, isEdit, selectedVariantId, activeVariants]);

  function handleManufacturedDateChange(value: string) {
    setManufacturedDate(value);
    if (value && !expectedReadyDateManuallyEdited) {
      setExpectedReadyDate(addWeeks(value, 2));
    }
  }

  function resetForm() {
    if (!fixedProductId && !isEdit) setSelectedProductId("");
    setSelectedVariantId("");
    setBatchCode("");
    setBatchCodeManuallyEdited(false);
    setManufacturedDate("");
    setExpectedReadyDate("");
    setExpectedReadyDateManuallyEdited(false);
    setTotalQuantity("");
    setStatus("upcoming");
    setNotes("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!activeProductId) {
      setError("Please select a product");
      return;
    }

    if (!isEdit && activeVariants.length > 0 && !selectedVariantId) {
      setError("Please select a variant");
      return;
    }

    try {
      if (isEdit) {
        await updateBatch({
          id: batch._id,
          batchCode,
          manufacturedDate,
          expectedReadyDate: expectedReadyDate || undefined,
          totalQuantity: parseInt(totalQuantity),
          status,
          notes: notes || undefined,
        });
      } else {
        await createBatch({
          productId: activeProductId as Id<"products">,
          variantId: selectedVariantId ? (selectedVariantId as Id<"productVariants">) : undefined,
          batchCode,
          manufacturedDate,
          expectedReadyDate: expectedReadyDate || undefined,
          totalQuantity: parseInt(totalQuantity),
          status,
          notes: notes || undefined,
        });
      }
      setOpen(false);
      if (!isEdit) resetForm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Failed to ${isEdit ? "update" : "create"} batch`;
      setError(message);
    }
  }

  const showProductSelector = !fixedProductId && !isEdit && products;
  const selectedProduct = products?.find((p) => p._id === selectedProductId);

  const dialogContent = (
    <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Batch" : "Create Batch"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        {showProductSelector && (
          <div className="space-y-2">
            <Label>Product</Label>
            <Select
              value={selectedProductId}
              onValueChange={(v) => {
                setSelectedProductId(v ?? "");
                setSelectedVariantId("");
                setBatchCodeManuallyEdited(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product">
                  {selectedProduct
                    ? `${selectedProduct.name}${selectedProduct.shortCode ? ` (${selectedProduct.shortCode})` : ""}`
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name} {p.shortCode ? `(${p.shortCode})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Variant selector — only in create mode and when variants exist */}
        {!isEdit && activeVariants.length > 0 && (
          <div className="space-y-2">
            <Label>Variant</Label>
            <Select
              value={selectedVariantId}
              onValueChange={(v) => setSelectedVariantId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue>
                  {selectedVariantId
                    ? activeVariants.find((v) => v._id === selectedVariantId)?.name ?? "Select variant"
                    : "Select variant"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {activeVariants.map((v) => (
                  <SelectItem key={v._id} value={v._id}>
                    {v.name} — RM{v.price.toFixed(2)}
                    {v.agentOnly ? " (Agent Only)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Associate this batch with a specific variant (e.g. 30ML, Tester 15ML).
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="batchCode">Batch Code</Label>
          <Input
            id="batchCode"
            placeholder={nextBatchInfo?.suggestedCode ?? "e.g. MA0001"}
            value={batchCode}
            onChange={(e) => {
              setBatchCode(e.target.value);
              setBatchCodeManuallyEdited(true);
            }}
            required
          />
          <p className="text-xs text-muted-foreground">
            Auto-generated from product code. Must be unique.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="manufacturedDate">Manufactured Date</Label>
          <Input
            id="manufacturedDate"
            type="date"
            value={manufacturedDate}
            onChange={(e) => handleManufacturedDateChange(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expectedReadyDate">Expected Maturation Date</Label>
          <Input
            id="expectedReadyDate"
            type="date"
            value={expectedReadyDate}
            onChange={(e) => {
              setExpectedReadyDate(e.target.value);
              setExpectedReadyDateManuallyEdited(true);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Auto-set to 2 weeks after manufactured date. Editable.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="totalQuantity">Total Quantity</Label>
          <Input
            id="totalQuantity"
            type="number"
            min={isEdit && batch?.status === "partial" ? (batch.releasedQuantity ?? 1) : 1}
            value={totalQuantity}
            onChange={(e) => setTotalQuantity(e.target.value)}
            required
            disabled={isEdit && batch?.status !== "upcoming" && batch?.status !== "partial"}
          />
          {isEdit && batch?.status === "partial" ? (
            <p className="text-xs text-muted-foreground">
              {batch.releasedQuantity ?? 0} units already released — total cannot go below this.
            </p>
          ) : isEdit && batch?.status !== "upcoming" ? (
            <p className="text-xs text-muted-foreground">
              Quantity is locked for active batches. Use <span className="font-medium">Adjust Stock</span> from the batch actions to add or deduct.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {status === "upcoming"
                ? "Expected stock count — may change when batch is activated."
                : "Confirmed stock after filling into bottles."}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          {isEdit && batch?.status === "partial" ? (
            <>
              <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                Partial
              </div>
              <p className="text-xs text-muted-foreground">
                Status is managed via <span className="font-medium">Release More</span> or the status dropdown in the batch table.
              </p>
            </>
          ) : (
            <>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus(v as "upcoming" | "available" | "depleted" | "cancelled")
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {!isEdit ? (
                    <>
                      <SelectItem value="upcoming" label="Upcoming">Upcoming</SelectItem>
                      <SelectItem value="available" label="Available">Available</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="upcoming" label="Upcoming">Upcoming</SelectItem>
                      <SelectItem value="available" label="Available">Available</SelectItem>
                      <SelectItem value="depleted" label="Depleted">Depleted</SelectItem>
                      <SelectItem value="cancelled" label="Cancelled">Cancelled</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {!isEdit && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Upcoming</span> = expected stock for a batch still under production.{" "}
                  <span className="font-medium">Available</span> = confirmed stock after filling into bottles — adds to HQ inventory immediately.
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Optional notes about this batch..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <DialogClose
            render={<Button type="button" variant="outline" />}
          >
            Cancel
          </DialogClose>
          <Button type="submit">{isEdit ? "Save Changes" : "Create Batch"}</Button>
        </div>
      </form>
    </DialogContent>
  );

  if (children) {
    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v && !isEdit) resetForm();
        }}
      >
        <DialogTrigger render={children} />
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v && !isEdit) resetForm();
      }}
    >
      {dialogContent}
    </Dialog>
  );
}
