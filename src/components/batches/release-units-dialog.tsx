"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function ReleaseUnitsDialog({
  batch,
  open,
  onOpenChange,
}: {
  batch: Doc<"batches">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const releaseUnits = useMutation(api.batches.releaseUnits);

  const alreadyReleased = batch.releasedQuantity ?? 0;
  const remaining = batch.totalQuantity - alreadyReleased;

  const [quantity, setQuantity] = useState(String(remaining));
  const [error, setError] = useState("");

  function reset() {
    setQuantity(String(remaining));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid positive number.");
      return;
    }
    if (qty > remaining) {
      setError(`Only ${remaining} unit${remaining !== 1 ? "s" : ""} left to release.`);
      return;
    }

    try {
      await releaseUnits({ id: batch._id, quantity: qty });
      const willBeFullyAvailable = qty >= remaining;
      toast.success(
        willBeFullyAvailable
          ? `All ${batch.totalQuantity} units now available`
          : `${qty} unit${qty !== 1 ? "s" : ""} released — ${remaining - qty} still pending`
      );
      onOpenChange(false);
      reset();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to release units";
      setError(message);
    }
  }

  const isPartial = batch.status === "partial";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isPartial ? "Release More Units" : "Release Units"} — {batch.batchCode}
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Total batch: <span className="font-medium text-foreground">{batch.totalQuantity}</span> units</p>
          {isPartial && (
            <p>Already released: <span className="font-medium text-foreground">{alreadyReleased}</span> · Remaining: <span className="font-medium text-foreground">{remaining}</span></p>
          )}
          {!isPartial && (
            <p>Enter how many to release now. Any unreleased units can be added later via <span className="font-medium">Release More</span>.</p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="releaseQty">Units to release</Label>
            <Input
              id="releaseQty"
              type="number"
              min="1"
              max={remaining}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Max: {remaining}</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit">Release</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
