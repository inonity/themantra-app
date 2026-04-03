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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type AdjustmentType = "add" | "deduct";

export function StockAdjustmentDialog({
  batch,
  open,
  onOpenChange,
}: {
  batch: Doc<"batches">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const adjustStock = useMutation(api.batches.adjustStock);

  const [type, setType] = useState<AdjustmentType>("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function resetForm() {
    setType("add");
    setAmount("");
    setReason("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const qty = parseInt(amount);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid positive number.");
      return;
    }
    if (!reason.trim()) {
      setError("Please provide a reason for the adjustment.");
      return;
    }

    const adjustment = type === "add" ? qty : -qty;

    try {
      await adjustStock({
        id: batch._id,
        adjustment,
        reason: reason.trim(),
      });
      toast.success(
        `Stock ${type === "add" ? "added" : "deducted"}: ${qty} units`
      );
      onOpenChange(false);
      resetForm();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to adjust stock";
      setError(message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Stock — {batch.batchCode}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Current total: <span className="font-medium">{batch.totalQuantity}</span> units.
          Use this to correct miscalculations or account for broken/damaged stock.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Adjustment Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as AdjustmentType)}
            >
              <SelectTrigger>
                <SelectValue>
                  {type === "add" ? "Add Stock" : "Deduct Stock"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Add Stock</SelectItem>
                <SelectItem value="deduct">Deduct Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjustAmount">Quantity</Label>
            <Input
              id="adjustAmount"
              type="number"
              min="1"
              placeholder="e.g. 5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjustReason">Reason</Label>
            <Textarea
              id="adjustReason"
              placeholder="e.g. 3 broken bottles during packaging"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              variant={type === "deduct" ? "destructive" : "default"}
            >
              {type === "add" ? "Add Stock" : "Deduct Stock"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
