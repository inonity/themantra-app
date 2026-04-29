"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ChangeBatchDialog({
  saleId,
  lineItemIndex,
  currentBatchCode,
  productLabel,
  quantity,
  open,
  onOpenChange,
}: {
  saleId: Id<"sales">;
  lineItemIndex: number;
  currentBatchCode: string;
  productLabel: string;
  quantity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const candidates = useQuery(
    api.saleCorrections.listCandidateBatches,
    open ? { saleId, lineItemIndex } : "skip"
  );
  const correctLineBatch = useMutation(api.saleCorrections.correctLineBatch);

  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!selectedBatchId) {
      setError("Pick a batch to move the sale to.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await correctLineBatch({
        saleId,
        lineItemIndex,
        newBatchId: selectedBatchId as Id<"batches">,
        reason: reason.trim() || undefined,
      });
      onOpenChange(false);
      setSelectedBatchId("");
      setReason("");
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "data" in e
            ? String((e as { data: unknown }).data)
            : "Could not change batch";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const eligible = (candidates ?? []).filter((c) => c.availableQty >= quantity);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Change Batch</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{productLabel}</p>
            <p>
              Currently fulfilled from <span className="font-medium">Batch {currentBatchCode}</span>{" "}
              (x{quantity}).
            </p>
            <p className="mt-1">
              Pick the batch the goods <em>actually</em> came from. Inventory will be added back
              to {currentBatchCode} and deducted from the new batch.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="change-batch-select">New batch</Label>
            <Select
              value={selectedBatchId}
              onValueChange={(v) => setSelectedBatchId(v ?? "")}
            >
              <SelectTrigger id="change-batch-select">
                <SelectValue>
                  {selectedBatchId
                    ? (() => {
                        const c = eligible.find((b) => b.batchId === selectedBatchId);
                        return c ? `Batch ${c.batchCode} (have ${c.availableQty})` : "Pick a batch";
                      })()
                    : candidates === undefined
                      ? "Loading..."
                      : eligible.length === 0
                        ? "No batches with enough stock"
                        : "Pick a batch"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {eligible.map((c) => (
                  <SelectItem key={c.batchId} value={c.batchId}>
                    Batch {c.batchCode} (have {c.availableQty})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {candidates && candidates.length > 0 && eligible.length === 0 && (
              <p className="text-xs text-orange-600">
                No batches have at least {quantity} units in stock under the same stock model.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="change-batch-reason">Reason (optional)</Label>
            <Textarea
              id="change-batch-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. picked from the wrong shelf"
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !selectedBatchId}>
            {saving ? "Saving..." : "Change batch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
