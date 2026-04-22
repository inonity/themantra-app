"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { useState, useMemo, useEffect } from "react";
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
import { useCurrentUser } from "@/hooks/useStoreUserEffect";

const stockModelLabels: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
};

type LossStockModel = "hold_paid" | "consignment" | "presell";
type Reason = "damage" | "self_use" | "lost";
type HQReason = "damaged" | "expired" | "lost" | "sample" | "other";

const HQ_SUBJECT_ID = "__hq__";

const reasonLabels: Record<Reason, string> = {
  damage: "Damage / Broken",
  self_use: "Self-Use / Personal",
  lost: "Lost / Missing",
};

const hqReasonLabels: Record<HQReason, string> = {
  damaged: "Damaged / Broken",
  expired: "Expired",
  lost: "Lost / Missing",
  sample: "Sample / Testing",
  other: "Other",
};

type LossRow = {
  id: string;
  productId: string;
  inventoryKey: string; // `${batchId}__${stockModel}`
  quantity: string;
};

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyRow(): LossRow {
  return { id: genId(), productId: "", inventoryKey: "", quantity: "" };
}

function makeKey(batchId: string, stockModel: string) {
  return `${batchId}__${stockModel}`;
}

function parseKey(key: string): { batchId: string; stockModel: LossStockModel } | null {
  const [batchId, stockModel] = key.split("__");
  if (!batchId) return null;
  if (stockModel !== "hold_paid" && stockModel !== "consignment" && stockModel !== "presell") {
    return null;
  }
  return { batchId, stockModel };
}

export function ReportStockLossDialog({
  products,
  lockedAgentId,
  children,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  products: Doc<"products">[];
  // If set, agent selector is hidden and locked to this user (self-file mode).
  lockedAgentId?: Id<"users">;
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const recordStockLoss = useMutation(api.stockMovements.recordStockLoss);
  const recordHQStockLoss = useMutation(api.stockMovements.recordHQStockLoss);
  const sellers = useQuery(api.users.listSellers);
  const hqName = useQuery(api.users.getHQName) ?? "HQ";
  const allBatches = useQuery(api.batches.listAll);
  const allVariants = useQuery(api.productVariants.listAll);
  const currentUser = useCurrentUser();
  // Admin sees all inventory; agent sees only their own.
  const adminInventory = useQuery(
    api.inventory.getBreakdown,
    lockedAgentId ? "skip" : {}
  );
  const agentInventory = useQuery(
    api.inventory.getForAgent,
    lockedAgentId ? {} : "skip"
  );
  const allInventory = lockedAgentId ? agentInventory : adminInventory;

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChangeProp?.(v);
  };
  const [agentId, setAgentId] = useState<string>(lockedAgentId ?? "");
  const [reason, setReason] = useState<Reason>("damage");
  const [hqReason, setHqReason] = useState<HQReason>("damaged");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LossRow[]>([emptyRow()]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const agents = (sellers ?? []).filter((s) => s.role === "agent");
  const salesStaff = (sellers ?? []).filter((s) => s.role === "sales");
  const selectedAgent = (sellers ?? []).find((a) => a._id === agentId);

  const isHQSubject = !lockedAgentId && agentId === HQ_SUBJECT_ID;

  // Subject = the user whose stock is being written off. When lockedAgentId is set
  // (self-file flow), subject is the current user; otherwise it's the selected agent.
  const subjectRole = lockedAgentId
    ? currentUser?.role
    : selectedAgent?.role;
  const subjectIsSales = subjectRole === "sales";

  // Sales staff never purchase from HQ — self-use is hidden for them.
  const availableReasons: Reason[] = subjectIsSales
    ? ["damage", "lost"]
    : ["damage", "self_use", "lost"];

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

  const holderInventory = useMemo(() => {
    if (!agentId || !allInventory) return [];
    if (isHQSubject) {
      return allInventory.filter(
        (inv) => inv.heldByType === "business" && inv.quantity > 0
      );
    }
    return allInventory.filter(
      (inv) =>
        inv.heldByType === "agent" &&
        inv.heldById === agentId &&
        inv.quantity > 0 &&
        (inv.stockModel === "hold_paid" ||
          inv.stockModel === "consignment" ||
          inv.stockModel === "presell")
    );
  }, [agentId, allInventory, isHQSubject]);

  const inventoryByProduct = useMemo(() => {
    const map = new Map<string, Doc<"inventory">[]>();
    for (const inv of holderInventory) {
      const list = map.get(inv.productId) ?? [];
      list.push(inv);
      map.set(inv.productId, list);
    }
    return map;
  }, [holderInventory]);

  const productTotal = useMemo(() => {
    const map = new Map<string, number>();
    for (const [pid, list] of inventoryByProduct) {
      map.set(pid, list.reduce((sum, inv) => sum + inv.quantity, 0));
    }
    return map;
  }, [inventoryByProduct]);

  const inventoryByKey = useMemo(() => {
    const map = new Map<string, Doc<"inventory">>();
    for (const inv of holderInventory) {
      if (isHQSubject) {
        // HQ business inventory has no stockModel split — key by batchId only.
        map.set(inv.batchId, inv);
      } else if (inv.stockModel) {
        map.set(makeKey(inv.batchId, inv.stockModel), inv);
      }
    }
    return map;
  }, [holderInventory, isHQSubject]);

  const usedKeys = useMemo(
    () => new Set(rows.filter((r) => r.inventoryKey).map((r) => r.inventoryKey)),
    [rows]
  );

  function resetForm() {
    setAgentId(lockedAgentId ?? "");
    setReason("damage");
    setHqReason("damaged");
    setNotes("");
    setRows([emptyRow()]);
    setError("");
  }

  // If the selected subject changes from agent→sales while self_use is chosen, reset it.
  useEffect(() => {
    if (reason === "self_use" && subjectIsSales) {
      setReason("damage");
    }
  }, [reason, subjectIsSales]);

  function updateRow(id: string, patch: Partial<LossRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const parsedAgentItems = rows
    .filter((r) => r.inventoryKey && r.quantity)
    .map((r) => {
      const parsed = parseKey(r.inventoryKey);
      return parsed
        ? {
            batchId: parsed.batchId as Id<"batches">,
            stockModel: parsed.stockModel,
            quantity: parseInt(r.quantity),
          }
        : null;
    })
    .filter((x): x is { batchId: Id<"batches">; stockModel: LossStockModel; quantity: number } => x !== null);

  const parsedHQItems = rows
    .filter((r) => r.inventoryKey && r.quantity)
    .map((r) => ({
      batchId: r.inventoryKey as Id<"batches">,
      quantity: parseInt(r.quantity),
    }))
    .filter((i) => !isNaN(i.quantity));

  const parsedItemCount = isHQSubject
    ? parsedHQItems.length
    : parsedAgentItems.length;

  // Chargeable preview: any non-hold_paid line = agent will owe HQ.
  const chargeableLines = parsedAgentItems.filter((i) => i.stockModel !== "hold_paid");

  const canSubmit =
    agentId &&
    parsedItemCount > 0 &&
    (isHQSubject
      ? parsedHQItems.every((item) => {
          const inv = inventoryByKey.get(item.batchId);
          return (
            item.quantity > 0 && inv !== undefined && item.quantity <= inv.quantity
          );
        })
      : parsedAgentItems.every((item) => {
          const inv = inventoryByKey.get(makeKey(item.batchId, item.stockModel));
          return (
            item.quantity > 0 && inv !== undefined && item.quantity <= inv.quantity
          );
        }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isHQSubject) {
        await recordHQStockLoss({
          category: hqReason,
          notes: notes || undefined,
          items: parsedHQItems,
        });
      } else {
        await recordStockLoss({
          agentId: lockedAgentId ? undefined : (agentId as Id<"users">),
          reason,
          notes: notes || undefined,
          items: parsedAgentItems,
        });
      }
      setOpen(false);
      resetForm();
    } catch (err: unknown) {
      const msg =
        err instanceof Error && "data" in err && typeof (err as { data: unknown }).data === "string"
          ? (err as { data: string }).data
          : err instanceof Error
            ? err.message
            : "Failed to report loss";
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
          <DialogTitle>
            {lockedAgentId ? "Report My Stock Loss" : "Report Stock Loss"}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-y-auto overflow-x-hidden -mx-4 px-4">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!lockedAgentId && (
              <div className="space-y-2">
                <Label>From</Label>
                <Select
                  value={agentId}
                  onValueChange={(v) => {
                    setAgentId(v ?? "");
                    setRows([emptyRow()]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select HQ, agent or salesperson">
                      {isHQSubject
                        ? hqName
                        : selectedAgent
                          ? selectedAgent.nickname ||
                            selectedAgent.name ||
                            selectedAgent.email ||
                            "Unnamed"
                          : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Business</SelectLabel>
                      <SelectItem value={HQ_SUBJECT_ID}>
                        <div className="flex items-center gap-2">
                          <span>{hqName}</span>
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 !text-primary-foreground">
                            HQ
                          </Badge>
                        </div>
                      </SelectItem>
                    </SelectGroup>
                    {(agents.length > 0 || salesStaff.length > 0) && <SelectSeparator />}
                    {agents.length === 0 && salesStaff.length === 0 ? null : (
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
              </div>
            )}

            {agentId && (
              <div className="rounded-md border border-muted bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                {isHQSubject ? (
                  <>
                    Write off HQ-held stock (damaged, expired, lost, etc.). The
                    batch&apos;s total count decreases. Optionally attribute to a
                    salesperson for internal tracking — no charge is ever
                    applied.
                  </>
                ) : subjectIsSales ? (
                  <>
                    Any damage or loss by salesperson is absorbed by HQ as a
                    write-off. No charge is ever applied to the salesperson.
                  </>
                ) : lockedAgentId ? (
                  <>
                    <strong className="text-foreground">Hold & Paid</strong> stock
                    is your own — no charge.{" "}
                    <strong className="text-foreground">Consignment</strong> and{" "}
                    <strong className="text-foreground">Pre-sell</strong>{" "}stock
                    belongs to HQ, so you&apos;ll be charged at your HQ price and
                    the amount is added to your pending settlement.
                  </>
                ) : (
                  <>
                    <strong className="text-foreground">Hold & Paid</strong>{" "}
                    lines are the agent&apos;s own stock — no charge.{" "}
                    <strong className="text-foreground">Consignment</strong> and{" "}
                    <strong className="text-foreground">Pre-sell</strong> lines
                    are charged to the agent at their HQ price and added to
                    their pending settlement.
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason</Label>
              {isHQSubject ? (
                <Select value={hqReason} onValueChange={(v) => setHqReason(v as HQReason)}>
                  <SelectTrigger>
                    <SelectValue>{hqReasonLabels[hqReason]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(hqReasonLabels) as HQReason[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {hqReasonLabels[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                  <SelectTrigger>
                    <SelectValue>{reasonLabels[reason]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableReasons.map((k) => (
                      <SelectItem key={k} value={k}>
                        {reasonLabels[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

<div className="space-y-2">
              <Label htmlFor="lossNotes">Notes (optional)</Label>
              <Textarea
                id="lossNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. spilled during delivery"
              />
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              {agentId && holderInventory.length === 0 ? (
                <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                  No stock held.
                </div>
              ) : (
                <div className="w-full rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>{isHQSubject ? "Batch" : "Batch · Model"}</TableHead>
                        <TableHead className="w-[120px]">Qty / Held</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const inventoryForProduct = row.productId
                          ? (inventoryByProduct.get(row.productId) ?? [])
                          : [];

                        const selectableEntries = inventoryForProduct.filter((inv) => {
                          if (isHQSubject) {
                            const key = inv.batchId;
                            return !usedKeys.has(key) || key === row.inventoryKey;
                          }
                          if (!inv.stockModel) return false;
                          const key = makeKey(inv.batchId, inv.stockModel);
                          return !usedKeys.has(key) || key === row.inventoryKey;
                        });

                        const selectedInv = row.inventoryKey
                          ? inventoryByKey.get(row.inventoryKey)
                          : null;
                        const selectedBatch = selectedInv
                          ? batchMap.get(selectedInv.batchId)
                          : null;
                        const held = selectedInv?.quantity ?? 0;
                        const isHoldPaid = selectedInv?.stockModel === "hold_paid";

                        return (
                          <TableRow key={row.id}>
                            <TableCell className="align-top py-2">
                              <Select
                                value={row.productId}
                                disabled={!agentId}
                                onValueChange={(v) =>
                                  updateRow(row.id, {
                                    productId: v ?? "",
                                    inventoryKey: "",
                                    quantity: "",
                                  })
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
                                  {Array.from(inventoryByProduct.keys()).length === 0 ? (
                                    <SelectItem value="_none" disabled>
                                      No stock held
                                    </SelectItem>
                                  ) : (
                                    Array.from(inventoryByProduct.keys()).map((pid) => {
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
                                    {selectedBatch
                                      ? isHQSubject
                                        ? `${selectedBatch.batchCode}${
                                            selectedBatch.variantId
                                              ? ` · ${variantMap.get(selectedBatch.variantId)?.name ?? ""}`
                                              : ""
                                          }`
                                        : selectedInv?.stockModel
                                          ? `${selectedBatch.batchCode}${
                                              selectedBatch.variantId
                                                ? ` · ${variantMap.get(selectedBatch.variantId)?.name ?? ""}`
                                                : ""
                                            } · ${stockModelLabels[selectedInv.stockModel] ?? selectedInv.stockModel}`
                                          : undefined
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
                                      const batch = batchMap.get(inv.batchId);
                                      if (!batch) return null;
                                      const key = isHQSubject
                                        ? inv.batchId
                                        : inv.stockModel
                                          ? makeKey(inv.batchId, inv.stockModel)
                                          : null;
                                      if (!key) return null;
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
                                              {!isHQSubject && inv.stockModel && (
                                                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                                                  {stockModelLabels[inv.stockModel] ?? inv.stockModel}
                                                </Badge>
                                              )}
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
                              {selectedInv && (
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {isHQSubject
                                    ? "HQ write-off"
                                    : subjectIsSales
                                      ? "HQ write-off (no charge)"
                                      : isHoldPaid
                                        ? "No HQ charge (already paid)"
                                        : "Charged to HQ at HQ price"}
                                </p>
                              )}
                            </TableCell>

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

            {!subjectIsSales && chargeableLines.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {chargeableLines.length} line{chargeableLines.length !== 1 ? "s" : ""} will
                be charged to {lockedAgentId ? "you" : "the agent"} at HQ price and added
                to the pending settlement.
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={!canSubmit || submitting}>
                {submitting
                  ? "Saving..."
                  : `File ${parsedItemCount} item${parsedItemCount !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
