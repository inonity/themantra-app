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
import { PlusIcon, Trash2Icon } from "lucide-react";

const stockModelLabels: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
};

type BatchLine = {
  id: string;
  batchId: string;
  quantity: string;
};

type ProductBlock = {
  id: string;
  productId: string;
  batches: BatchLine[];
};

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyBatchLine(): BatchLine {
  return { id: genId(), batchId: "", quantity: "" };
}

function emptyProductBlock(): ProductBlock {
  return { id: genId(), productId: "", batches: [emptyBatchLine()] };
}

export function TransferFormDialog({
  products,
  children,
}: {
  products: Doc<"products">[];
  children: React.ReactElement;
}) {
  const transferBulk = useMutation(api.stockMovements.transferBulkToAgent);
  const sellers = useQuery(api.users.listSellers);
  const allBatches = useQuery(api.batches.listAll);
  const businessInventory = useQuery(api.inventory.getBusinessInventory);

  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [stockModel, setStockModel] = useState<"hold_paid" | "consignment" | "presell">(
    "hold_paid"
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blocks, setBlocks] = useState<ProductBlock[]>([emptyProductBlock()]);

  const agents = (sellers ?? []).filter((s) => s.role === "agent");
  const salesStaff = (sellers ?? []).filter((s) => s.role === "sales");
  const selectedAgent = (sellers ?? []).find((a) => a._id === agentId);

  // Lookup maps
  const availableBatchesByProduct = useMemo(() => {
    const map = new Map<string, Doc<"batches">[]>();
    for (const b of allBatches ?? []) {
      if (b.status !== "available") continue;
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

  // Total business stock per product (only available batches with stock)
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

  // Track used productIds and batchIds
  const usedProductIds = useMemo(
    () => new Set(blocks.filter((b) => b.productId).map((b) => b.productId)),
    [blocks]
  );

  function usedBatchIdsForBlock(blockId: string) {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return new Set<string>();
    return new Set(block.batches.filter((bl) => bl.batchId).map((bl) => bl.batchId));
  }

  function resetForm() {
    setAgentId("");
    setStockModel("hold_paid");
    setNotes("");
    setError("");
    setBlocks([emptyProductBlock()]);
  }

  // Product block operations
  function setProductId(blockId: string, productId: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, productId, batches: [emptyBatchLine()] }
          : b
      )
    );
  }

  function removeBlock(blockId: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }

  function addBlock() {
    setBlocks((prev) => [...prev, emptyProductBlock()]);
  }

  // Batch line operations
  function setBatchId(blockId: string, lineId: string, batchId: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              batches: b.batches.map((bl) =>
                bl.id === lineId ? { ...bl, batchId, quantity: "" } : bl
              ),
            }
          : b
      )
    );
  }

  function setQuantity(blockId: string, lineId: string, quantity: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              batches: b.batches.map((bl) =>
                bl.id === lineId ? { ...bl, quantity } : bl
              ),
            }
          : b
      )
    );
  }

  function addBatchLine(blockId: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, batches: [...b.batches, emptyBatchLine()] }
          : b
      )
    );
  }

  function removeBatchLine(blockId: string, lineId: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, batches: b.batches.filter((bl) => bl.id !== lineId) }
          : b
      )
    );
  }

  // Flatten blocks into items for submission
  const allItems = blocks.flatMap((block) =>
    block.batches
      .filter((bl) => bl.batchId && bl.quantity)
      .map((bl) => ({
        batchId: bl.batchId as Id<"batches">,
        quantity: parseInt(bl.quantity),
      }))
  );

  const canSubmit =
    agentId &&
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
      await transferBulk({
        agentId: agentId as Id<"users">,
        stockModel,
        notes: notes || undefined,
        items: allItems,
      });
      setOpen(false);
      resetForm();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to transfer stock";
      setError(message);
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
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Distribute Stock</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Agent */}
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
                    {salesStaff.length > 0 && agents.length > 0 && (
                      <SelectSeparator />
                    )}
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
                Stock model: <span className="font-medium">{stockModelLabels[stockModel] ?? stockModel}</span>
                {selectedAgent?.role === "sales"
                  ? " — salespersons always use Pre-sell"
                  : " — from agent profile defaults"}
              </p>
            )}
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

          {/* Product blocks */}
          <div className="space-y-4">
            <Label>Products</Label>
            {blocks.map((block) => {
              const product = block.productId
                ? products.find((p) => p._id === block.productId)
                : null;
              const batches = block.productId
                ? availableBatchesByProduct.get(block.productId) ?? []
                : [];
              const usedBatchIds = usedBatchIdsForBlock(block.id);

              // Sum of quantities for this product block
              const totalQty = block.batches.reduce(
                (sum, bl) => sum + (bl.quantity ? parseInt(bl.quantity) || 0 : 0),
                0
              );

              return (
                <div
                  key={block.id}
                  className="rounded-lg border p-3 space-y-1"
                >
                  {/* Product row */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <Select
                        value={block.productId}
                        onValueChange={(v) => setProductId(block.id, v ?? "")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product">
                            {product?.name}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {products
                            .filter((p) => {
                              const isAvailable =
                                p.status === "active" ||
                                p.status === "future_release";
                              // Hide already-chosen products (except current block's own)
                              if (
                                p._id !== block.productId &&
                                usedProductIds.has(p._id)
                              )
                                return false;
                              // Only show products that have available batches
                              const hasBatches =
                                (availableBatchesByProduct.get(p._id) ?? []).length > 0;
                              return isAvailable || !hasBatches ? true : true;
                            })
                            .map((p) => {
                              const stock = productTotalStock.get(p._id) ?? 0;
                              const isOutOfStock = stock === 0;
                              const isUnavailable =
                                p.status !== "active" &&
                                p.status !== "future_release";

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
                                    {p.status === "future_release"
                                      ? " (Future)"
                                      : ""}
                                    {isUnavailable
                                      ? ` (${p.status})`
                                      : ""}
                                  </span>
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>
                    {totalQty > 0 && (
                      <span className="text-sm font-medium tabular-nums shrink-0">
                        {totalQty} units
                      </span>
                    )}
                    {blocks.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={() => removeBlock(block.id)}
                      >
                        <Trash2Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>

                  {/* Batch lines (indented) */}
                  {block.productId && (
                    <div className="pl-6 space-y-2">
                      {block.batches.map((line) => {
                        const batch = line.batchId
                          ? batchMap.get(line.batchId as Id<"batches">)
                          : null;
                        const stock = line.batchId
                          ? businessStockByBatch.get(line.batchId) ?? 0
                          : 0;

                        // Available batches: in-stock, not already chosen in this block
                        const selectableBatches = batches.filter(
                          (b) =>
                            (businessStockByBatch.get(b._id) ?? 0) > 0 &&
                            (!usedBatchIds.has(b._id) || b._id === line.batchId)
                        );

                        return (
                          <div
                            key={line.id}
                            className="flex items-center gap-2"
                          >
                            {/* Batch select */}
                            <div className="flex-1 min-w-0">
                              <Select
                                value={line.batchId}
                                onValueChange={(v) =>
                                  setBatchId(block.id, line.id, v ?? "")
                                }
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Select batch">
                                    {batch?.batchCode}
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
                                          <span className="truncate">{b.batchCode}</span>
                                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {businessStockByBatch.get(b._id) ?? 0} in stock
                                          </span>
                                        </div>
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Qty / Stock */}
                            <div className="flex items-center gap-0.5 shrink-0 w-[90px]">
                              <Input
                                type="number"
                                min="1"
                                max={stock || undefined}
                                value={line.quantity}
                                onChange={(e) =>
                                  setQuantity(
                                    block.id,
                                    line.id,
                                    e.target.value
                                  )
                                }
                                placeholder="0"
                                className="h-8 text-sm w-[50px]"
                                disabled={!line.batchId}
                              />
                              <span className="text-xs text-muted-foreground">
                                /
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {line.batchId ? stock : "—"}
                              </span>
                            </div>

                            {/* Remove batch line */}
                            {block.batches.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0"
                                onClick={() =>
                                  removeBatchLine(block.id, line.id)
                                }
                              >
                                <Trash2Icon className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        );
                      })}

                      {/* Add batch button — only if more batches available */}
                      {batches.filter(
                        (b) =>
                          (businessStockByBatch.get(b._id) ?? 0) > 0 &&
                          !usedBatchIds.has(b._id)
                      ).length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addBatchLine(block.id)}
                        >
                          <PlusIcon className="h-3 w-3 mr-1" />
                          Add batch
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addBlock}
            >
              <PlusIcon className="h-3.5 w-3.5 mr-1" />
              Add product
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <DialogClose
              render={<Button type="button" variant="outline" />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting
                ? "Transferring..."
                : `Transfer ${allItems.length} item${allItems.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
