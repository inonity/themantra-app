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
  consignment: "Consignment",
  presell: "Pre-sell",
};

type ReturnableStockModel = "consignment" | "presell";

type ReturnRow = {
  id: string;
  productId: string;
  // Composite key: `${batchId}__${stockModel}` — identifies a single inventory row.
  inventoryKey: string;
  quantity: string;
};

function getTodayMYT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyRow(): ReturnRow {
  return { id: genId(), productId: "", inventoryKey: "", quantity: "" };
}

function makeInventoryKey(batchId: string, stockModel: string) {
  return `${batchId}__${stockModel}`;
}

function parseInventoryKey(key: string): { batchId: string; stockModel: ReturnableStockModel } | null {
  const [batchId, stockModel] = key.split("__");
  if (!batchId || (stockModel !== "consignment" && stockModel !== "presell")) return null;
  return { batchId, stockModel };
}

export function ReturnFormDialog({
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
  const returnBulk = useMutation(api.stockMovements.returnBulkToBusiness);
  const sellers = useQuery(api.users.listSellers);
  const allBatches = useQuery(api.batches.listAll);
  const allVariants = useQuery(api.productVariants.listAll);
  const allInventory = useQuery(api.inventory.getBreakdown);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChangeProp?.(v);
  };
  const [agentId, setAgentId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [returnDate, setReturnDate] = useState(getTodayMYT());
  const [rows, setRows] = useState<ReturnRow[]>([emptyRow()]);

  const agents = (sellers ?? []).filter((s) => s.role === "agent");
  const salesStaff = (sellers ?? []).filter((s) => s.role === "sales");
  const selectedAgent = (sellers ?? []).find((a) => a._id === agentId);

  const batchMap = useMemo(
    () => new Map((allBatches ?? []).map((b) => [b._id, b])),
    [allBatches]
  );

  const variantMap = useMemo(
    () => new Map((allVariants ?? []).map((v) => [v._id, v])),
    [allVariants]
  );

  const productMap = useMemo(
    () => new Map(products.map((p) => [p._id, p])),
    [products]
  );

  // Inventory rows for the selected agent, filtered to returnable stock models only.
  const agentReturnableInventory = useMemo(() => {
    if (!agentId || !allInventory) return [];
    return allInventory.filter(
      (inv) =>
        inv.heldByType === "agent" &&
        inv.heldById === agentId &&
        inv.quantity > 0 &&
        (inv.stockModel === "consignment" || inv.stockModel === "presell")
    );
  }, [agentId, allInventory]);

  // Group returnable inventory by product for the product dropdown.
  const returnableByProduct = useMemo(() => {
    const map = new Map<string, Doc<"inventory">[]>();
    for (const inv of agentReturnableInventory) {
      const list = map.get(inv.productId) ?? [];
      list.push(inv);
      map.set(inv.productId, list);
    }
    return map;
  }, [agentReturnableInventory]);

  const productTotal = useMemo(() => {
    const map = new Map<string, number>();
    for (const [pid, list] of returnableByProduct) {
      map.set(pid, list.reduce((sum, inv) => sum + inv.quantity, 0));
    }
    return map;
  }, [returnableByProduct]);

  // Inventory key set already used across rows (prevent duplicates).
  const usedKeys = useMemo(
    () => new Set(rows.filter((r) => r.inventoryKey).map((r) => r.inventoryKey)),
    [rows]
  );

  function resetForm() {
    setAgentId("");
    setNotes("");
    setReturnDate(getTodayMYT());
    setError("");
    setRows([emptyRow()]);
  }

  function updateRow(id: string, patch: Partial<ReturnRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const inventoryByKey = useMemo(() => {
    const map = new Map<string, Doc<"inventory">>();
    for (const inv of agentReturnableInventory) {
      if (!inv.stockModel) continue;
      map.set(makeInventoryKey(inv.batchId, inv.stockModel), inv);
    }
    return map;
  }, [agentReturnableInventory]);

  const allItems = rows
    .filter((r) => r.inventoryKey && r.quantity)
    .map((r) => {
      const parsed = parseInventoryKey(r.inventoryKey);
      return parsed
        ? {
            batchId: parsed.batchId as Id<"batches">,
            stockModel: parsed.stockModel,
            quantity: parseInt(r.quantity),
          }
        : null;
    })
    .filter((x): x is { batchId: Id<"batches">; stockModel: ReturnableStockModel; quantity: number } => x !== null);

  const canSubmit =
    agentId &&
    returnDate &&
    allItems.length > 0 &&
    allItems.every((item) => {
      const inv = inventoryByKey.get(makeInventoryKey(item.batchId, item.stockModel));
      return item.quantity > 0 && inv !== undefined && item.quantity <= inv.quantity;
    });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const movedAt = new Date(`${returnDate}T12:00:00+08:00`).getTime();
      await returnBulk({
        agentId: agentId as Id<"users">,
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
          : "Failed to return stock";
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
          <DialogTitle>Return Stock to HQ</DialogTitle>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-y-auto overflow-x-hidden -mx-4 px-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Source */}
          <div className="space-y-2">
            <Label>Return from</Label>
            <Select
              value={agentId}
              onValueChange={(v) => {
                setAgentId(v ?? "");
                setRows([emptyRow()]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select agent or salesperson">
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
                        <SelectLabel>Agents</SelectLabel>
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
                        <SelectLabel>Salespersons</SelectLabel>
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
            <p className="text-xs text-muted-foreground">
              Only Consignment and Pre-sell stock can be returned. Hold & Paid is excluded.
            </p>
          </div>

          {/* Return date */}
          <div className="space-y-2">
            <Label htmlFor="returnDate">Return Date</Label>
            <Input
              id="returnDate"
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              When the stock was returned (defaults to today MYT)
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
            {agentId && agentReturnableInventory.length === 0 ? (
              <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                This agent has no returnable stock (Consignment / Pre-sell).
              </div>
            ) : (
            <div className="w-full rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch · Model</TableHead>
                    <TableHead className="w-[120px]">Qty / Held</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const inventoryForProduct = row.productId
                      ? (returnableByProduct.get(row.productId) ?? [])
                      : [];

                    const selectableEntries = inventoryForProduct.filter((inv) => {
                      if (!inv.stockModel) return false;
                      const key = makeInventoryKey(inv.batchId, inv.stockModel);
                      return !usedKeys.has(key) || key === row.inventoryKey;
                    });

                    const selectedInv = row.inventoryKey
                      ? inventoryByKey.get(row.inventoryKey)
                      : null;
                    const selectedBatch = selectedInv
                      ? batchMap.get(selectedInv.batchId)
                      : null;
                    const held = selectedInv?.quantity ?? 0;

                    return (
                      <TableRow key={row.id}>
                        {/* Product */}
                        <TableCell className="align-top py-2">
                          <Select
                            value={row.productId}
                            disabled={!agentId}
                            onValueChange={(v) =>
                              updateRow(row.id, { productId: v ?? "", inventoryKey: "", quantity: "" })
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select product">
                                {row.productId
                                  ? productMap.get(row.productId as Id<"products">)?.name
                                  : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              {Array.from(returnableByProduct.keys()).length === 0 ? (
                                <SelectItem value="_none" disabled>
                                  No returnable products
                                </SelectItem>
                              ) : (
                                Array.from(returnableByProduct.keys()).map((pid) => {
                                  const product = productMap.get(pid as Id<"products">);
                                  if (!product) return null;
                                  const total = productTotal.get(pid) ?? 0;
                                  return (
                                    <SelectItem key={pid} value={pid}>
                                      <div className="flex items-center justify-between w-full gap-4">
                                        <span>{product.name}</span>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                          {total} held
                                        </span>
                                      </div>
                                    </SelectItem>
                                  );
                                })
                              )}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Batch + stock model */}
                        <TableCell className="align-top py-2">
                          <Select
                            value={row.inventoryKey}
                            disabled={!row.productId}
                            onValueChange={(v) =>
                              updateRow(row.id, { inventoryKey: v ?? "", quantity: "" })
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select batch">
                                {selectedBatch && selectedInv?.stockModel
                                  ? `${selectedBatch.batchCode}${
                                      selectedBatch.variantId
                                        ? ` · ${variantMap.get(selectedBatch.variantId)?.name ?? ""}`
                                        : ""
                                    } · ${stockModelLabels[selectedInv.stockModel] ?? selectedInv.stockModel}`
                                  : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              {selectableEntries.length === 0 ? (
                                <SelectItem value="_none" disabled>
                                  No batches available
                                </SelectItem>
                              ) : (
                                selectableEntries.map((inv) => {
                                  if (!inv.stockModel) return null;
                                  const batch = batchMap.get(inv.batchId);
                                  if (!batch) return null;
                                  const key = makeInventoryKey(inv.batchId, inv.stockModel);
                                  return (
                                    <SelectItem key={key} value={key}>
                                      <div className="flex items-center justify-between w-full gap-4">
                                        <span className="truncate">
                                          {batch.batchCode}
                                          {batch.variantId && (
                                            <span className="ml-1.5 text-muted-foreground">
                                              {variantMap.get(batch.variantId)?.name}
                                            </span>
                                          )}
                                          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                                            {stockModelLabels[inv.stockModel] ?? inv.stockModel}
                                          </Badge>
                                        </span>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                          {inv.quantity} held
                                        </span>
                                      </div>
                                    </SelectItem>
                                  );
                                })
                              )}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Qty / Held */}
                        <TableCell className="align-top py-2">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="1"
                              max={held || undefined}
                              value={row.quantity}
                              onChange={(e) =>
                                updateRow(row.id, { quantity: e.target.value })
                              }
                              placeholder="0"
                              className="h-8 text-sm w-[54px]"
                              disabled={!row.inventoryKey}
                            />
                            <span className="text-xs text-muted-foreground">/</span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {row.inventoryKey ? held : "—"}
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

                  <TableRow>
                    <TableCell colSpan={4} className="py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!agentId}
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
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting
                ? "Returning..."
                : `Return ${allItems.length} item${allItems.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
