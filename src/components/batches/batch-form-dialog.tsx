"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
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
    "upcoming" | "available" | "depleted" | "cancelled"
  >(batch?.status ?? "upcoming");
  const [error, setError] = useState("");

  const activeProductId = fixedProductId ?? batch?.productId ?? (selectedProductId as Id<"products">);

  const nextBatchInfo = useQuery(
    api.batches.getNextBatchNumber,
    activeProductId && !isEdit ? { productId: activeProductId as Id<"products"> } : "skip"
  );

  // Auto-fill batch code when product changes (create mode only)
  useEffect(() => {
    if (nextBatchInfo && !batchCodeManuallyEdited && !isEdit) {
      setBatchCode(nextBatchInfo.suggestedCode);
    }
  }, [nextBatchInfo, batchCodeManuallyEdited, isEdit]);

  // Sync form when batch prop changes (for edit mode)
  useEffect(() => {
    if (batch && open) {
      setSelectedProductId(batch.productId);
      setBatchCode(batch.batchCode);
      setManufacturedDate(batch.manufacturedDate);
      setExpectedReadyDate(batch.expectedReadyDate ?? "");
      setTotalQuantity(String(batch.totalQuantity));
      setStatus(batch.status);
    }
  }, [batch, open]);

  function handleManufacturedDateChange(value: string) {
    setManufacturedDate(value);
    if (value && !expectedReadyDateManuallyEdited) {
      setExpectedReadyDate(addWeeks(value, 2));
    }
  }

  function resetForm() {
    if (!fixedProductId && !isEdit) setSelectedProductId("");
    setBatchCode("");
    setBatchCodeManuallyEdited(false);
    setManufacturedDate("");
    setExpectedReadyDate("");
    setExpectedReadyDateManuallyEdited(false);
    setTotalQuantity("");
    setStatus("upcoming");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!activeProductId) {
      setError("Please select a product");
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
        });
      } else {
        await createBatch({
          productId: activeProductId as Id<"products">,
          batchCode,
          manufacturedDate,
          expectedReadyDate: expectedReadyDate || undefined,
          totalQuantity: parseInt(totalQuantity),
          status,
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
    <DialogContent>
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
            min="1"
            value={totalQuantity}
            onChange={(e) => setTotalQuantity(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
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
              Use <span className="font-medium">Upcoming</span> for batches still maturing.{" "}
              <span className="font-medium">Available</span> adds stock to HQ inventory immediately.
            </p>
          )}
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
