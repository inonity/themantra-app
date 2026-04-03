"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FulfillmentItem {
  lineItemIndex: number;
  productId: Id<"products">;
  quantity: number;
  fulfilledQuantity: number;
  productName: string;
  fulfillmentSource: string;
  batchId: Id<"batches"> | null;
  batchCode: string;
  alreadyDone: boolean;
  fromHQ: boolean; // whether this item's selected batch is from HQ inventory
}

export function FulfillSaleDialog({
  sale,
  products,
  trigger,
  userRole,
}: {
  sale: Doc<"sales">;
  products: Map<Id<"products">, Doc<"products">>;
  trigger: React.ReactNode;
  userRole?: string;
}) {
  const isSalesperson = userRole === "sales";
  const fulfillLineItems = useMutation(api.sales.fulfillLineItems);
  const legacyFulfillSale = useMutation(api.sales.fulfillSale);
  const selfFulfillFromHQ = useMutation(api.sales.selfFulfillFromHQ);
  const agentInventory = useQuery(api.inventory.getForAgent);
  const businessInventory = useQuery(api.inventory.getBusinessInventory, isSalesperson ? {} : "skip");
  const batches = useQuery(api.batches.listAll);

  const [items, setItems] = useState<FulfillmentItem[]>(() =>
    (sale.lineItems ?? []).map((li, index) => {
      const fulfilled = li.fulfilledQuantity ?? 0;
      const remaining = li.quantity - fulfilled;
      return {
        lineItemIndex: index,
        productId: li.productId,
        quantity: remaining,
        fulfilledQuantity: fulfilled,
        productName: products.get(li.productId)?.name ?? "Unknown",
        fulfillmentSource: li.fulfillmentSource ?? "pending_batch",
        batchId: null,
        batchCode: "",
        alreadyDone: remaining <= 0,
        fromHQ: false,
      };
    })
  );
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  const batchMap = new Map((batches ?? []).map((b) => [b._id, b]));

  // Group agent inventory by productId
  const inventoryByProduct = new Map<string, Doc<"inventory">[]>();
  for (const inv of agentInventory ?? []) {
    const existing = inventoryByProduct.get(inv.productId) ?? [];
    existing.push(inv);
    inventoryByProduct.set(inv.productId, existing);
  }

  // Group HQ inventory by productId (salesperson only)
  const hqInventoryByProduct = new Map<string, Doc<"inventory">[]>();
  if (isSalesperson) {
    for (const inv of businessInventory ?? []) {
      const existing = hqInventoryByProduct.get(inv.productId) ?? [];
      existing.push(inv);
      hqInventoryByProduct.set(inv.productId, existing);
    }
  }

  // Set of HQ batch IDs for quick lookup
  const hqBatchIds = new Set(
    (businessInventory ?? [] as Doc<"inventory">[]).map((inv) => inv.batchId)
  );

  function selectBatch(index: number, batchId: string) {
    const batch = batchMap.get(batchId as Id<"batches">);
    setItems(
      items.map((item, i) =>
        i === index
          ? {
              ...item,
              batchId: batchId as Id<"batches">,
              batchCode: batch?.batchCode ?? "?",
              fromHQ: hqBatchIds.has(batchId as Id<"batches">) &&
                !(inventoryByProduct.get(item.productId) ?? []).some(
                  (inv) => inv.batchId === batchId && inv.quantity >= item.quantity
                ),
            }
          : item
      )
    );
  }

  const pendingItems = items.filter((item) => !item.alreadyDone);
  const itemsWithBatch = pendingItems.filter((item) => item.batchId !== null);
  const agentStockItems = itemsWithBatch.filter((item) => !item.fromHQ);
  const hqStockItems = itemsWithBatch.filter((item) => item.fromHQ);
  const canFulfill = itemsWithBatch.length > 0;

  // Check if this is a legacy sale (no fulfillmentSource on line items)
  const isLegacy = (sale.lineItems ?? []).every((li) => !li.fulfillmentSource);

  async function handleFulfill() {
    if (!canFulfill) return;
    setSubmitting(true);
    try {
      // Fulfill items from agent stock
      if (agentStockItems.length > 0) {
        if (isLegacy && agentStockItems.length === pendingItems.length) {
          await legacyFulfillSale({
            saleId: sale._id,
            items: agentStockItems.map((item) => ({
              batchId: item.batchId!,
              productId: item.productId,
              quantity: item.quantity,
            })),
          });
        } else {
          await fulfillLineItems({
            saleId: sale._id,
            items: agentStockItems.map((item) => ({
              lineItemIndex: item.lineItemIndex,
              batchId: item.batchId!,
              quantity: item.quantity,
            })),
          });
        }
      }

      // Fulfill items pulled from HQ
      if (hqStockItems.length > 0) {
        await selfFulfillFromHQ({
          saleId: sale._id,
          items: hqStockItems.map((item) => ({
            lineItemIndex: item.lineItemIndex,
            batchId: item.batchId!,
            quantity: item.quantity,
          })),
        });
      }

      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const SOURCE_LABELS: Record<string, string> = {
    agent_stock: "In Stock",
    hq_transfer: "Pending HQ Transfer",
    hq_direct: "Fulfilled by HQ",
    pending_batch: "Pending Batch",
    future_release: "Future Release",
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span />}>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fulfill Sale</DialogTitle>
          <DialogDescription>
            {isSalesperson
              ? "Select batches for items you can fulfill now. You can also pull stock directly from HQ."
              : "Select batches from your inventory to fulfill items."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {items.map((item, index) => {
            if (item.alreadyDone) {
              return (
                <div key={item.lineItemIndex} className="space-y-1 opacity-50">
                  <Label className="text-sm flex items-center gap-2">
                    {item.productName} — x{item.fulfilledQuantity}
                    <Badge variant="default" className="text-xs">Fulfilled</Badge>
                  </Label>
                </div>
              );
            }

            const availableAgentBatches = inventoryByProduct.get(item.productId) ?? [];
            const availableHQBatches = hqInventoryByProduct.get(item.productId) ?? [];
            const hasAgentStock = availableAgentBatches.some(
              (inv) => inv.quantity >= item.quantity
            );
            const hasHQStock = availableHQBatches.some(
              (inv) => inv.quantity >= item.quantity
            );
            const hasAnyStock = hasAgentStock || hasHQStock;

            return (
              <div key={item.lineItemIndex} className="space-y-2">
                <Label className="text-sm flex items-center gap-2">
                  {item.productName} — x{item.quantity}
                  <Badge variant="outline" className="text-xs">
                    {SOURCE_LABELS[item.fulfillmentSource] ?? item.fulfillmentSource}
                  </Badge>
                  {item.batchId && item.fromHQ && (
                    <Badge variant="secondary" className="text-xs">
                      From HQ
                    </Badge>
                  )}
                </Label>
                {hasAnyStock ? (
                  <>
                    {(item.fulfillmentSource === "future_release" || item.fulfillmentSource === "pending_batch") && hasAgentStock && (
                      <p className="text-xs text-green-600">
                        Stock now available in your inventory!
                      </p>
                    )}
                    {!hasAgentStock && hasHQStock && isSalesperson && (
                      <p className="text-xs text-blue-600">
                        Not in your stock — pull directly from HQ
                      </p>
                    )}
                    <Select
                      value={item.batchId ?? ""}
                      onValueChange={(v) => v && selectBatch(index, v)}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {item.batchId
                            ? `${item.fromHQ ? "[HQ] " : ""}Batch ${item.batchCode}`
                            : "Select batch..."}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {/* Agent inventory batches */}
                        {availableAgentBatches
                          .filter((inv) => inv.quantity >= item.quantity)
                          .map((inv) => {
                            const batch = batchMap.get(inv.batchId);
                            return (
                              <SelectItem key={inv._id} value={inv.batchId}>
                                Batch {batch?.batchCode ?? "?"} (yours: {inv.quantity})
                              </SelectItem>
                            );
                          })}
                        {/* HQ inventory batches */}
                        {availableHQBatches
                          .filter((inv) => inv.quantity >= item.quantity)
                          .filter((inv) => {
                            // Don't show HQ batches the agent already has with sufficient qty
                            const agentHas = availableAgentBatches.find(
                              (a) => a.batchId === inv.batchId && a.quantity >= item.quantity
                            );
                            return !agentHas;
                          })
                          .map((inv) => {
                            const batch = batchMap.get(inv.batchId);
                            return (
                              <SelectItem key={`hq-${inv._id}`} value={inv.batchId}>
                                [HQ] Batch {batch?.batchCode ?? "?"} (HQ: {inv.quantity})
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {item.fulfillmentSource === "future_release"
                      ? isSalesperson
                        ? "Product not yet available — no stock at HQ or in your inventory"
                        : "Product not yet available — no stock in your inventory"
                      : isSalesperson
                        ? "No batch with sufficient stock available (yours or HQ)"
                        : "No batch with sufficient stock in your inventory"}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <button className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium h-8 gap-1.5 px-2.5 hover:bg-muted hover:text-foreground transition-all" />
            }
          >
            Cancel
          </DialogClose>
          <Button
            onClick={handleFulfill}
            disabled={!canFulfill || submitting}
          >
            {submitting
              ? "Fulfilling..."
              : `Fulfill ${itemsWithBatch.length} of ${pendingItems.length} Items${hqStockItems.length > 0 ? ` (${hqStockItems.length} from HQ)` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
