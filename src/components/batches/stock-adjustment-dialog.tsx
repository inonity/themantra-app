"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";

type Mode = "adjust" | "writeoff";
type AdjustDirection = "add" | "deduct";
type WriteOffCategory = "damaged" | "expired" | "lost" | "sample" | "other";

const writeOffCategoryLabels: Record<WriteOffCategory, string> = {
  damaged: "Damaged / Broken",
  expired: "Expired",
  lost: "Lost / Missing",
  sample: "Sample / Testing",
  other: "Other",
};

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
  const sellers = useQuery(api.users.listSellers);
  const salesStaff = (sellers ?? []).filter((s) => s.role === "sales");
  const inventoryRows = useQuery(api.inventory.getByBatch, { batchId: batch._id });
  const hqQuantity = (inventoryRows ?? [])
    .filter((inv) => inv.heldByType === "business")
    .reduce((sum, inv) => sum + inv.quantity, 0);

  const [mode, setMode] = useState<Mode>("adjust");

  // Adjust Count state
  const [direction, setDirection] = useState<AdjustDirection>("add");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");

  // Write Off state
  const [category, setCategory] = useState<WriteOffCategory>("damaged");
  const [writeOffAmount, setWriteOffAmount] = useState("");
  const [writeOffNotes, setWriteOffNotes] = useState("");
  const [attributedTo, setAttributedTo] = useState<string>("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setMode("adjust");
    setDirection("add");
    setAdjustAmount("");
    setAdjustNotes("");
    setCategory("damaged");
    setWriteOffAmount("");
    setWriteOffNotes("");
    setAttributedTo("");
    setError("");
  }

  async function submitAdjust(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const qty = parseInt(adjustAmount);
    if (isNaN(qty) || qty <= 0) return setError("Enter a valid positive number.");
    if (!adjustNotes.trim()) return setError("Provide a reason.");
    if (direction === "deduct" && qty > hqQuantity) {
      return setError(`HQ only holds ${hqQuantity} unit${hqQuantity !== 1 ? "s" : ""}.`);
    }

    setSubmitting(true);
    try {
      await adjustStock({
        id: batch._id,
        adjustment: direction === "add" ? qty : -qty,
        reason: adjustNotes.trim(),
        category: "miscount",
      });
      toast.success(`Count ${direction === "add" ? "increased" : "decreased"} by ${qty}`);
      onOpenChange(false);
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to adjust count");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitWriteOff(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const qty = parseInt(writeOffAmount);
    if (isNaN(qty) || qty <= 0) return setError("Enter a valid positive number.");
    if (!writeOffNotes.trim()) return setError("Provide details.");
    if (qty > hqQuantity) {
      return setError(`HQ only holds ${hqQuantity} unit${hqQuantity !== 1 ? "s" : ""}.`);
    }

    setSubmitting(true);
    try {
      await adjustStock({
        id: batch._id,
        adjustment: -qty,
        reason: writeOffNotes.trim(),
        category,
        attributedToUserId: attributedTo
          ? (attributedTo as Id<"users">)
          : undefined,
      });
      toast.success(`Wrote off ${qty} unit${qty !== 1 ? "s" : ""}`);
      onOpenChange(false);
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to write off stock");
    } finally {
      setSubmitting(false);
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
          <DialogTitle>Stock Changes — {batch.batchCode}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          HQ holds <span className="font-medium">{hqQuantity}</span> of{" "}
          <span className="font-medium">{batch.totalQuantity}</span> total units.
          {batch.totalQuantity > hqQuantity && (
            <>
              {" "}
              <span className="text-xs">
                ({batch.totalQuantity - hqQuantity} with agents — use{" "}
                <strong>Report Loss</strong> on Stock page for those.)
              </span>
            </>
          )}
        </p>

        <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setError(""); }}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="adjust">Adjust Count</TabsTrigger>
            <TabsTrigger value="writeoff">Write Off</TabsTrigger>
          </TabsList>

          <TabsContent value="adjust" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Use this to correct miscounts — add missed units or remove phantom ones.
              For broken / lost stock, use <strong>Write Off</strong> instead.
            </p>
            <form onSubmit={submitAdjust} className="space-y-4">
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as AdjustDirection)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {direction === "add" ? "Add Stock (+)" : "Deduct Stock (−)"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add Stock (+)</SelectItem>
                    <SelectItem value="deduct">Deduct Stock (−)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustQty">Quantity</Label>
                <Input
                  id="adjustQty"
                  type="number"
                  min="1"
                  placeholder="e.g. 5"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustNotes">Reason</Label>
                <Textarea
                  id="adjustNotes"
                  placeholder="e.g. Found 3 extra units in storage during audit"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  required
                />
              </div>

              {error && mode === "adjust" && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex justify-end gap-2">
                <DialogClose render={<Button type="button" variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button
                  type="submit"
                  variant={direction === "deduct" ? "destructive" : "default"}
                  disabled={submitting}
                >
                  {submitting
                    ? "Saving..."
                    : direction === "add"
                      ? "Add Stock"
                      : "Deduct Stock"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="writeoff" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Record units that left the business without a sale — damaged, expired,
              lost, or used as samples.
            </p>
            <form onSubmit={submitWriteOff} className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as WriteOffCategory)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {writeOffCategoryLabels[category]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(writeOffCategoryLabels) as WriteOffCategory[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {writeOffCategoryLabels[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="writeOffQty">Quantity</Label>
                <Input
                  id="writeOffQty"
                  type="number"
                  min="1"
                  max={hqQuantity || undefined}
                  placeholder="e.g. 3"
                  value={writeOffAmount}
                  onChange={(e) => setWriteOffAmount(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Attributed to (optional)</Label>
                <Select
                  value={attributedTo || "__none__"}
                  onValueChange={(v) =>
                    setAttributedTo(v === "__none__" ? "" : (v ?? ""))
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {attributedTo
                        ? (salesStaff.find((s) => s._id === attributedTo)?.nickname ??
                           salesStaff.find((s) => s._id === attributedTo)?.name ??
                           "Unnamed")
                        : "— none —"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— none —</SelectItem>
                    {salesStaff.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.nickname || s.name || s.email || "Unnamed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Blame a specific salesperson for tracking. Leave blank for general HQ loss.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="writeOffNotes">Details</Label>
                <Textarea
                  id="writeOffNotes"
                  placeholder="e.g. 3 bottles broken while moving shelves"
                  value={writeOffNotes}
                  onChange={(e) => setWriteOffNotes(e.target.value)}
                  required
                />
              </div>

              {error && mode === "writeoff" && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex justify-end gap-2">
                <DialogClose render={<Button type="button" variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={submitting}>
                  {submitting ? "Saving..." : "Write Off"}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
