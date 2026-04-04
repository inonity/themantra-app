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
    return `${(rateValue * 100).toFixed(0)}% of retail`;
  }
  return `RM ${rateValue.toFixed(2)} fixed`;
}

type CollectionRateRow = {
  collection: string;
  rateType: "fixed" | "percentage";
  rateValue: string;
};

function RateForm({
  initial,
  onDone,
}: {
  initial?: Doc<"rates">;
  onDone: () => void;
}) {
  const create = useMutation(api.rates.create);
  const update = useMutation(api.rates.update);
  const collections = useQuery(api.products.listCollections);

  const [name, setName] = useState(initial?.name ?? "");
  const [rows, setRows] = useState<CollectionRateRow[]>(
    initial?.collectionRates.map((cr) => ({
      collection: cr.collection,
      rateType: cr.rateType,
      rateValue:
        cr.rateType === "percentage"
          ? (cr.rateValue * 100).toString()
          : cr.rateValue.toString(),
    })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const usedCollections = new Set(rows.map((r) => r.collection));
  const availableCollections =
    collections?.filter((c) => !usedCollections.has(c)) ?? [];

  function addRow(collection: string) {
    setRows([...rows, { collection, rateType: "percentage", rateValue: "" }]);
  }

  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, updates: Partial<CollectionRateRow>) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!name.trim()) {
        setError("Name is required.");
        return;
      }

      const collectionRates = rows.map((r) => {
        const val = parseFloat(r.rateValue);
        if (isNaN(val)) throw new Error(`Invalid rate for ${r.collection}`);
        return {
          collection: r.collection,
          rateType: r.rateType,
          rateValue: r.rateType === "percentage" ? val / 100 : val,
        };
      });

      const defaultRate = { rateType: "percentage" as const, rateValue: 1 };

      if (initial) {
        await update({
          id: initial._id,
          name: name.trim(),
          collectionRates,
          defaultRate,
        });
      } else {
        await create({
          name: name.trim(),
          collectionRates,
          defaultRate,
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rateName">Rate Name</Label>
        <Input
          id="rateName"
          placeholder='e.g. "Tier A", "Gold"'
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Collection Rates</Label>
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No collection rates set. Add one below.
          </p>
        )}
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Select
              value={row.collection}
              onValueChange={(v) => v && updateRow(idx, { collection: v })}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue>{row.collection}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={row.collection}>{row.collection}</SelectItem>
                {(collections?.filter((c) => !usedCollections.has(c) || c === row.collection) ?? [])
                  .filter((c) => c !== row.collection)
                  .map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select
              value={row.rateType}
              onValueChange={(v) =>
                v && updateRow(idx, { rateType: v as "fixed" | "percentage" })
              }
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue>
                  {row.rateType === "percentage" ? "Percentage" : "Fixed (RM)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed (RM)</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              step={row.rateType === "percentage" ? "1" : "0.01"}
              placeholder={row.rateType === "percentage" ? "70" : "35.00"}
              value={row.rateValue}
              onChange={(e) => updateRow(idx, { rateValue: e.target.value })}
              className="w-[100px]"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(idx)}
            >
              <Trash2Icon className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {availableCollections.length > 0 && (
          <Select value="" onValueChange={(v) => v && addRow(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Add collection..." />
            </SelectTrigger>
            <SelectContent>
              {availableCollections.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <DialogClose
          render={<Button type="button" variant="outline" />}
        >
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
  const editingRate = editingId
    ? rates?.find((r) => r._id === editingId)
    : undefined;

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Rates</h1>
            <p className="text-muted-foreground">
              Define HQ pricing rates per collection. Assign rates to agents to
              control what they pay HQ.
            </p>
          </div>
          <Button onClick={openCreate}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Create Rate
          </Button>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingRate ? "Edit Rate" : "Create Rate"}
              </DialogTitle>
              <DialogDescription>
                {editingRate
                  ? "Update the pricing rate and its collection rates."
                  : "Create a new HQ pricing rate with per-collection pricing."}
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
                  <TableHead>Collection Rates</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground"
                  >
                    No rates created yet. Create a rate to define HQ pricing
                    for agents.
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
                  <TableHead>Collection Rates</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((rate) => (
                  <TableRow key={rate._id}>
                    <TableCell className="font-medium">{rate.name}</TableCell>
                    <TableCell>
                      {rate.collectionRates.length === 0 ? (
                        <span className="text-muted-foreground">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {rate.collectionRates.map((cr, idx) => (
                            <Badge key={idx} variant="outline">
                              {cr.collection}: {formatRate(cr.rateType, cr.rateValue)}
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
