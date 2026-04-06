"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlusIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

function formatRate(rateType: string, rateValue: number) {
  if (rateType === "percentage") {
    return `${(rateValue * 100).toFixed(0)}%`;
  }
  return `RM ${rateValue.toFixed(2)}`;
}

// ── Customer rate rows ────────────────────────────────────────────────────────

type CustomerRateRow = {
  collection: string;
  sizeMl: string;
  rateType: "fixed" | "percentage";
  rateValue: string;
};

// ── Agent variant rate rows ───────────────────────────────────────────────────

type AgentRateRow = {
  type: string;
  rateType: "fixed" | "percentage";
  rateValue: string;
};

function parseRateRow(rateType: "fixed" | "percentage", rateValue: string) {
  const val = parseFloat(rateValue);
  if (isNaN(val)) return null;
  return { rateType, rateValue: rateType === "percentage" ? val / 100 : val };
}

function RateForm({
  initial,
  onDone,
}: {
  initial?: Doc<"rates">;
  onDone: () => void;
}) {
  const create = useMutation(api.rates.create);
  const update = useMutation(api.rates.update);
  const collections = useQuery(api.products.listCollections) ?? [];
  const allSizes = useQuery(api.productVariants.listSizes) ?? [];
  const agentTypes = useQuery(api.productVariants.listAgentTypes) ?? [];

  const [name, setName] = useState(initial?.name ?? "");

  const [customerRows, setCustomerRows] = useState<CustomerRateRow[]>(
    (initial?.collectionRates ?? [])
      .filter((cr) => cr.sizeMl != null)
      .map((cr) => ({
        collection: cr.collection,
        sizeMl: cr.sizeMl!.toString(),
        rateType: cr.rateType,
        rateValue:
          cr.rateType === "percentage"
            ? (cr.rateValue * 100).toString()
            : cr.rateValue.toString(),
      }))
  );

  const [agentRows, setAgentRows] = useState<AgentRateRow[]>(
    (initial?.agentVariantRates ?? []).map((r) => ({
      type: r.type,
      rateType: r.rateType,
      rateValue:
        r.rateType === "percentage"
          ? (r.rateValue * 100).toString()
          : r.rateValue.toString(),
    }))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Keys used to prevent duplicate (collection, size) pairs
  const usedCustomerKeys = new Set(customerRows.map((r) => `${r.collection}|${r.sizeMl}`));
  const usedAgentTypes = new Set(agentRows.map((r) => r.type));

  function addCustomerRow(row: CustomerRateRow) {
    const key = `${row.collection}|${row.sizeMl}`;
    if (usedCustomerKeys.has(key)) return;
    setCustomerRows([...customerRows, row]);
  }

  function removeCustomerRow(idx: number) {
    setCustomerRows(customerRows.filter((_, i) => i !== idx));
  }

  function addAgentRow(row: AgentRateRow) {
    if (usedAgentTypes.has(row.type)) return;
    setAgentRows([...agentRows, row]);
  }

  function removeAgentRow(idx: number) {
    setAgentRows(agentRows.filter((_, i) => i !== idx));
  }

  // Pending state for adding a new customer rate row
  const [pendingCollection, setPendingCollection] = useState("");
  const [pendingSize, setPendingSize] = useState("");
  const [pendingRateType, setPendingRateType] = useState<"fixed" | "percentage">("fixed");
  const [pendingRateValue, setPendingRateValue] = useState("");

  const availableSizesForPending = allSizes.filter(
    (s) => !usedCustomerKeys.has(`${pendingCollection}|${s}`)
  );

  // Pending state for adding a new agent variant rate row
  const [pendingAgentType, setPendingAgentType] = useState("");
  const [pendingAgentRateType, setPendingAgentRateType] = useState<"fixed" | "percentage">("fixed");
  const [pendingAgentRateValue, setPendingAgentRateValue] = useState("");

  const availableAgentTypes = agentTypes.filter((t) => !usedAgentTypes.has(t));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!name.trim()) {
        setError("Name is required.");
        return;
      }

      const collectionRates = customerRows.map((r) => {
        const parsed = parseRateRow(r.rateType, r.rateValue);
        if (!parsed) throw new Error(`Invalid rate for ${r.collection} ${r.sizeMl}ML`);
        return { collection: r.collection, sizeMl: parseFloat(r.sizeMl), ...parsed };
      });

      const agentVariantRates =
        agentRows.length > 0
          ? agentRows.map((r) => {
              const parsed = parseRateRow(r.rateType, r.rateValue);
              if (!parsed) throw new Error(`Invalid rate for ${r.type}`);
              return { type: r.type, ...parsed };
            })
          : undefined;

      if (initial) {
        await update({ id: initial._id, name: name.trim(), collectionRates, agentVariantRates });
      } else {
        await create({ name: name.trim(), collectionRates, agentVariantRates });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="rateName">Rate Name</Label>
        <Input
          id="rateName"
          placeholder='e.g. "Preferred Agent", "Gold"'
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {/* Customer Rates */}
      <div className="space-y-2">
        <Label>Customer Rates</Label>
        <p className="text-xs text-muted-foreground">
          What HQ charges per (collection, size) when an agent sells to a customer.
          Default if not set: agent keeps nothing (HQ takes full retail).
        </p>
        {customerRows.length === 0 && (
          <p className="text-sm text-muted-foreground">No customer rates set.</p>
        )}
        {customerRows.map((row, idx) => (
          <div key={idx} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="font-medium">{row.collection} · {row.sizeMl}ML</span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">
                {row.rateType === "fixed" ? `RM ${parseFloat(row.rateValue).toFixed(2)}` : `${row.rateValue}%`}
              </span>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeCustomerRow(idx)}>
                <Trash2Icon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {/* Add customer row */}
        {collections.length > 0 && allSizes.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <Select
              value={pendingCollection}
              onValueChange={(v) => { if (v) { setPendingCollection(v); setPendingSize(""); } }}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Collection..." />
              </SelectTrigger>
              <SelectContent>
                {collections.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={pendingSize}
              onValueChange={(v) => { if (v) setPendingSize(v); }}
              disabled={!pendingCollection}
            >
              <SelectTrigger className="w-[90px]">
                <SelectValue placeholder="Size..." />
              </SelectTrigger>
              <SelectContent>
                {availableSizesForPending.map((s) => (
                  <SelectItem key={s} value={s.toString()}>{s} ML</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={pendingRateType}
              onValueChange={(v) => setPendingRateType(v as "fixed" | "percentage")}
              disabled={!pendingSize}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue>
                  {pendingRateType === "percentage" ? "%" : "RM Fixed"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">RM Fixed</SelectItem>
                <SelectItem value="percentage">%</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              step={pendingRateType === "percentage" ? "1" : "0.01"}
              placeholder={pendingRateType === "percentage" ? "70" : "24.00"}
              value={pendingRateValue}
              onChange={(e) => setPendingRateValue(e.target.value)}
              disabled={!pendingSize}
              className="w-[80px]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pendingCollection || !pendingSize || !pendingRateValue}
              onClick={() => {
                addCustomerRow({
                  collection: pendingCollection,
                  sizeMl: pendingSize,
                  rateType: pendingRateType,
                  rateValue: pendingRateValue,
                });
                setPendingCollection("");
                setPendingSize("");
                setPendingRateType("fixed");
                setPendingRateValue("");
              }}
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Agent Variant Rates */}
      <div className="space-y-2">
        <Label>Agent Variant Rates</Label>
        <p className="text-xs text-muted-foreground">
          What HQ charges agents for tester/refill-type variants.
          Default if not set: agent pays full variant price.
        </p>
        {agentRows.length === 0 && (
          <p className="text-sm text-muted-foreground">No agent variant rates set.</p>
        )}
        {agentRows.map((row, idx) => (
          <div key={idx} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="font-medium">{row.type}</span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">
                {row.rateType === "fixed" ? `RM ${parseFloat(row.rateValue).toFixed(2)}` : `${row.rateValue}%`}
              </span>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeAgentRow(idx)}>
                <Trash2Icon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {/* Add agent row */}
        {agentTypes.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <Select
              value={pendingAgentType}
              onValueChange={(v) => { if (v) setPendingAgentType(v); }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Type..." />
              </SelectTrigger>
              <SelectContent>
                {availableAgentTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={pendingAgentRateType}
              onValueChange={(v) => setPendingAgentRateType(v as "fixed" | "percentage")}
              disabled={!pendingAgentType}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue>
                  {pendingAgentRateType === "percentage" ? "%" : "RM Fixed"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">RM Fixed</SelectItem>
                <SelectItem value="percentage">%</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              step={pendingAgentRateType === "percentage" ? "1" : "0.01"}
              placeholder={pendingAgentRateType === "percentage" ? "80" : "10.00"}
              value={pendingAgentRateValue}
              onChange={(e) => setPendingAgentRateValue(e.target.value)}
              disabled={!pendingAgentType}
              className="w-[80px]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pendingAgentType || !pendingAgentRateValue}
              onClick={() => {
                addAgentRow({
                  type: pendingAgentType,
                  rateType: pendingAgentRateType,
                  rateValue: pendingAgentRateValue,
                });
                setPendingAgentType("");
                setPendingAgentRateType("fixed");
                setPendingAgentRateValue("");
              }}
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={saving}>
          {saving
            ? initial ? "Updating..." : "Saving..."
            : initial ? "Save Changes" : "Create Rate"}
        </Button>
      </div>
    </form>
  );
}

export default function PricingPage() {
  const rates = useQuery(api.rates.list);
  const remove = useMutation(api.rates.remove);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"rates"> | null>(null);

  const isLoading = rates === undefined;
  const editingRate = editingId ? rates?.find((r) => r._id === editingId) : undefined;

  function openCreate() {
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(id: Id<"rates">) {
    setEditingId(id);
    setDialogOpen(true);
  }

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Rates</h1>
            <p className="text-muted-foreground">
              Define HQ pricing rates per collection and variant type. Assign rates to agents.
            </p>
          </div>
          <Button className="w-full sm:w-auto" onClick={openCreate}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Create Rate
          </Button>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRate ? "Edit Rate" : "Create Rate"}</DialogTitle>
              <DialogDescription>
                {editingRate
                  ? "Update the pricing rate."
                  : "Create a new HQ pricing rate for agents."}
              </DialogDescription>
            </DialogHeader>
            <RateForm
              key={editingId ?? "new"}
              initial={editingRate}
              onDone={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : rates.length === 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Customer Rates</TableHead>
                  <TableHead>Agent Variant Rates</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No rates created yet. Create a rate to define HQ pricing for agents.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Customer Rates</TableHead>
                  <TableHead>Agent Variant Rates</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((rate) => {
                  const customerRates = rate.collectionRates.filter((cr) => cr.sizeMl != null);
                  return (
                    <TableRow key={rate._id}>
                      <TableCell className="font-medium">{rate.name}</TableCell>
                      <TableCell>
                        {customerRates.length === 0 ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {customerRates.map((cr, idx) => (
                              <Badge key={idx} variant="outline">
                                {cr.collection} {cr.sizeMl}ML: {formatRate(cr.rateType, cr.rateValue)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {!rate.agentVariantRates || rate.agentVariantRates.length === 0 ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {rate.agentVariantRates.map((r, idx) => (
                              <Badge key={idx} variant="secondary">
                                {r.type}: {formatRate(r.rateType, r.rateValue)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontalIcon className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(rate._id)}>
                              Edit Rate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => remove({ id: rate._id })}
                            >
                              Delete Rate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
