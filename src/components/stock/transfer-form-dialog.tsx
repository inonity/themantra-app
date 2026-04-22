"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { useState, useMemo } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusIcon, Trash2Icon } from "lucide-react";

const stockModelLabels: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
};

type TransferRow = {
  id: string;
  productId: string;
  batchId: string;
  quantity: string;
};

function getTodayMYT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyRow(): TransferRow {
  return { id: genId(), productId: "", batchId: "", quantity: "" };
}

export function TransferFormDialog({
  products,
  children,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  products: Doc<"products">[];
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const transferBulk = useMutation(api.stockMovements.transferBulkToAgent);
  const sellers = useQuery(api.users.listSellers);
  const allBatches = useQuery(api.batches.listAll);
  const allVariants = useQuery(api.productVariants.listAll);
  const businessInventory = useQuery(api.inventory.getBusinessInventory);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChangeProp?.(v);
  };
  const [agentId, setAgentId] = useState<string>("");
  const [stockModel, setStockModel] = useState<"hold_paid" | "consignment" | "presell">(
    "hold_paid"
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [distributionDate, setDistributionDate] = useState(getTodayMYT());
  const [rows, setRows] = useState<TransferRow[]>([emptyRow()]);

  const agents = (sellers ?? []).filter((s) => s.role === "agent");
  const salesStaff = (sellers ?? []).filter((s) => s.role === "sales");
  const selectedAgent = (sellers ?? []).find((a) => a._id === agentId);

  // Lookup maps
  const availableBatchesByProduct = useMemo(() => {
    const map = new Map<string, Doc<"batches">[]>();
    for (const b of allBatches ?? []) {
      if (b.status !== "available" && b.status !== "partial") continue;
      const list = map.get(b.productId) ?? [];
      list.push(b);
      map.set(b.productId, list);
    }
    return map;
  }, [allBatches]);

  const businessStockByBatch = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of businessInventory ?? []) {
      map.set(inv.batchId, (map.get(inv.batchId) ?? 0) + inv.quantity);
    }
    return map;
  }, [businessInventory]);

  const batchMap = useMemo(
    () => new Map((allBatches ?? []).map((b) => [b._id, b])),
    [allBatches]
  );

  const variantMap = useMemo(
    () => new Map((allVariants ?? []).map((v) => [v._id, v])),
    [allVariants]
  );

  const productTotalStock = useMemo(() => {
    const map = new Map<string, number>();
    for (const [productId, batches] of availableBatchesByProduct) {
      let total = 0;
      for (const b of batches) {
        total += businessStockByBatch.get(b._id) ?? 0;
      }
      map.set(productId, total);
    }
    return map;
  }, [availableBatchesByProduct, businessStockByBatch]);

  // All batch IDs already selected across all rows (to prevent duplicates)
  const usedBatchIds = useMemo(
    () => new Set(rows.filter((r) => r.batchId).map((r) => r.batchId)),
    [rows]
  );

  function resetForm() {
    setAgentId("");
    setStockModel("hold_paid");
    setNotes("");
    setDistributionDate(getTodayMYT());
    setError("");
    setRows([emptyRow()]);
  }

  function updateRow(id: string, patch: Partial<TransferRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const allItems = rows
    .filter((r) => r.batchId && r.quantity)
    .map((r) => ({
      batchId: r.batchId as Id<"batches">,
      quantity: parseInt(r.quantity),
    }));

  const canSubmit =
    agentId &&
    distributionDate &&
    allItems.length > 0 &&
    allItems.every(
      (item) =>
        item.quantity > 0 &&
        item.quantity <= (businessStockByBatch.get(item.batchId) ?? 0)
    );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const movedAt = new Date(`${distributionDate}T12:00:00+08:00`).getTime();
      await transferBulk({
        agentId: agentId as Id<"users">,
        stockModel,
        notes: notes || undefined,
        movedAt,
        items: allItems,
      });
      setOpen(false);
      resetForm();
    } catch (err: unknown) {
      const msg =
        err instanceof Error && "data" in err && typeof (err as { data: unknown }).data === "string"
          ? (err as { data: string }).data
          : err instanceof Error
          ? err.message
          : "Failed to transfer stock";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      {children && <DialogTrigger render={children} />}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Distribute Stock</DialogTitle>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-y-auto overflow-x-hidden -mx-4 px-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Recipient */}
          <div className="space-y-2">
            <Label>Recipient</Label>
            <Select
              value={agentId}
              onValueChange={(v) => {
                setAgentId(v ?? "");
                const seller = (sellers ?? []).find((s) => s._id === v);
                if (seller?.role === "sales") {
                  setStockModel("presell");
                } else if (seller) {
                  const defaultModel = seller.defaultStockModel;
                  setStockModel(
                    defaultModel === "dropship" ? "presell" :
                    defaultModel ?? "consignment"
                  );
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select recipient">
                  {selectedAgent
                    ? selectedAgent.nickname ||
                      selectedAgent.name ||
                      selectedAgent.email ||
                      "Unnamed"
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {agents.length === 0 && salesStaff.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    No agents found
                  </SelectItem>
                ) : (
                  <>
                    {agents.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>
                          Agents — external partners, stock on consignment
                        </SelectLabel>
                        {agents.map((a) => (
                          <SelectItem key={a._id} value={a._id}>
                            <div className="flex items-center gap-2">
                              <span>{a.nickname || a.name || a.email || "Unnamed"}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                Agent
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {salesStaff.length > 0 && agents.length > 0 && <SelectSeparator />}
                    {salesStaff.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>
                          Salespersons — HQ employees with direct stock access
                        </SelectLabel>
                        {salesStaff.map((s) => (
                          <SelectItem key={s._id} value={s._id}>
                            <div className="flex items-center gap-2">
                              <span>{s.nickname || s.name || s.email || "Unnamed"}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                Sales
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </>
                )}
              </SelectContent>
            </Select>
            {agentId && (
              <p className="text-xs text-muted-foreground">
                Stock model:{" "}
                <span className="font-medium">{stockModelLabels[stockModel] ?? stockModel}</span>
                {selectedAgent?.role === "sales"
                  ? " — salespersons always use Pre-sell"
                  : " — from agent profile defaults"}
              </p>
            )}
          </div>

          {/* Distribution date */}
          <div className="space-y-2">
            <Label htmlFor="distributionDate">Distribution Date</Label>
            <Input
              id="distributionDate"
              type="date"
              value={distributionDate}
              onChange={(e) => setDistributionDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              When the stock was/will be distributed (defaults to today MYT)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Products table */}
          <div className="space-y-2">
            <Label>Products</Label>
            <div className="w-full rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead className="w-[120px]">Qty / Stock</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const batchesForProduct = row.productId
                      ? (availableBatchesByProduct.get(row.productId) ?? [])
                      : [];

                    const selectableBatches = batchesForProduct.filter(
                      (b) =>
                        (businessStockByBatch.get(b._id) ?? 0) > 0 &&
                        (!usedBatchIds.has(b._id) || b._id === row.batchId)
                    );

                    const selectedBatch = row.batchId
                      ? batchMap.get(row.batchId as Id<"batches">)
                      : null;
                    const stock = row.batchId
                      ? (businessStockByBatch.get(row.batchId) ?? 0)
                      : 0;

                    return (
                      <TableRow key={row.id}>
                        {/* Product */}
                        <TableCell className="align-top py-2">
                          <Select
                            value={row.productId}
                            onValueChange={(v) =>
                              updateRow(row.id, { productId: v ?? "", batchId: "", quantity: "" })
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select product">
                                {row.productId
                                  ? products.find((p) => p._id === row.productId)?.name
                                  : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              {products.map((p) => {
                                const totalStock = productTotalStock.get(p._id) ?? 0;
                                const isOutOfStock = totalStock === 0;
                                const isUnavailable =
                                  p.status !== "active" && p.status !== "future_release";
                                return (
                                  <SelectItem
                                    key={p._id}
                                    value={p._id}
                                    disabled={isOutOfStock || isUnavailable}
                                  >
                                    <span
                                      className={
                                        isOutOfStock || isUnavailable
                                          ? "line-through opacity-50"
                                          : ""
                                      }
                                    >
                                      {p.name}
                                      {p.status === "future_release" ? " (Future)" : ""}
                                      {isUnavailable ? ` (${p.status})` : ""}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Batch */}
                        <TableCell className="align-top py-2">
                          <Select
                            value={row.batchId}
                            disabled={!row.productId}
                            onValueChange={(v) =>
                              updateRow(row.id, { batchId: v ?? "", quantity: "" })
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select batch">
                                {selectedBatch
                                  ? `${selectedBatch.batchCode}${selectedBatch.variantId ? ` · ${variantMap.get(selectedBatch.variantId)?.name ?? ""}` : ""}`
                                  : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              {selectableBatches.length === 0 ? (
                                <SelectItem value="_none" disabled>
                                  No batches available
                                </SelectItem>
                              ) : (
                                selectableBatches.map((b) => (
                                  <SelectItem key={b._id} value={b._id}>
                                    <div className="flex items-center justify-between w-full gap-4">
                                      <span className="truncate">
                                        {b.batchCode}
                                        {b.variantId && (
                                          <span className="ml-1.5 text-muted-foreground">
                                            {variantMap.get(b.variantId)?.name}
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {businessStockByBatch.get(b._id) ?? 0} in stock
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Qty / Stock */}
                        <TableCell className="align-top py-2">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="1"
                              max={stock || undefined}
                              value={row.quantity}
                              onChange={(e) =>
                                updateRow(row.id, { quantity: e.target.value })
                              }
                              placeholder="0"
                              className="h-8 text-sm w-[54px]"
                              disabled={!row.batchId}
                            />
                            <span className="text-xs text-muted-foreground">/</span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {row.batchId ? stock : "—"}
                            </span>
                          </div>
                        </TableCell>

                        {/* Delete */}
                        <TableCell className="align-top py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={rows.length === 1}
                            onClick={() => removeRow(row.id)}
                          >
                            <Trash2Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Add row */}
                  <TableRow>
                    <TableCell colSpan={4} className="py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setRows((prev) => [...prev, emptyRow()])}
                      >
                        <PlusIcon className="h-3 w-3 mr-1" />
                        Add row
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting
                ? "Transferring..."
                : `Transfer ${allItems.length} item${allItems.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
