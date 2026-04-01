"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { PlusIcon, MoreHorizontalIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

const STOCK_MODELS = [
  { value: "hold_paid", label: "Hold & Paid" },
  { value: "consignment", label: "Consignment" },
  { value: "dropship", label: "Dropship" },
] as const;

type StockModel = "hold_paid" | "consignment" | "dropship";
type SelectionMode = "all" | "single" | "multiple" | "collection";

function formatRate(rateType: string, rateValue: number) {
  if (rateType === "percentage") {
    return `${(rateValue * 100).toFixed(0)}% of retail`;
  }
  return `RM ${rateValue.toFixed(2)} fixed`;
}

function detectSelectionMode(d: Doc<"pricingDefaults">): SelectionMode {
  if (d.productId) return "single";
  if (d.productIds && d.productIds.length > 0) return "multiple";
  if (d.collection) return "collection";
  return "all";
}

function PricingForm({
  initial,
  onDone,
}: {
  initial?: Doc<"pricingDefaults">;
  onDone: () => void;
}) {
  const upsert = useMutation(api.pricingDefaults.upsert);
  const products = useQuery(api.products.list);
  const collections = useQuery(api.products.listCollections);

  const initMode = initial ? detectSelectionMode(initial) : "all";

  const [stockModel, setStockModel] = useState<StockModel>(
    initial?.stockModel ?? "hold_paid"
  );
  const [rateType, setRateType] = useState<"fixed" | "percentage">(
    initial?.rateType ?? "percentage"
  );
  const [rateValue, setRateValue] = useState(
    initial
      ? initial.rateType === "percentage"
        ? (initial.rateValue * 100).toString()
        : initial.rateValue.toString()
      : ""
  );
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(initMode);
  const [productId, setProductId] = useState<string>(
    initial?.productId ?? ""
  );
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    initial?.productIds ?? []
  );
  const [collection, setCollection] = useState<string>(
    initial?.collection ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addProduct(id: string) {
    if (id && !selectedProductIds.includes(id)) {
      setSelectedProductIds([...selectedProductIds, id]);
    }
  }

  function removeProduct(id: string) {
    setSelectedProductIds(selectedProductIds.filter((pid) => pid !== id));
  }

  const productMap = new Map(products?.map((p) => [p._id, p]) ?? []);
  const availableProducts =
    products?.filter(
      (p) => !selectedProductIds.includes(p._id) && (p.status === "active" || p.status === "future_release")
    ) ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const value = parseFloat(rateValue);
      if (isNaN(value)) {
        setError("Please enter a valid rate value.");
        return;
      }

      const args: {
        stockModel: StockModel;
        rateType: "fixed" | "percentage";
        rateValue: number;
        productId?: Id<"products">;
        productIds?: Id<"products">[];
        collection?: string;
      } = {
        stockModel,
        rateType,
        rateValue: rateType === "percentage" ? value / 100 : value,
      };

      if (selectionMode === "single" && productId) {
        args.productId = productId as Id<"products">;
      } else if (
        selectionMode === "multiple" &&
        selectedProductIds.length > 0
      ) {
        args.productIds = selectedProductIds as Id<"products">[];
      } else if (selectionMode === "collection" && collection) {
        args.collection = collection;
      }

      await upsert(args);
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
        <Label htmlFor="stockModel">Stock Model</Label>
        <Select
          value={stockModel}
          onValueChange={(v) => v && setStockModel(v as StockModel)}
        >
          <SelectTrigger id="stockModel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STOCK_MODELS.map((m) => (
              <SelectItem key={m.value} value={m.value} label={m.label}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="appliesTo">Applies To</Label>
        <Select
          value={selectionMode}
          onValueChange={(v) => v && setSelectionMode(v as SelectionMode)}
        >
          <SelectTrigger id="appliesTo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" label="All Products">All Products</SelectItem>
            <SelectItem value="single" label="Single Product">Single Product</SelectItem>
            <SelectItem value="multiple" label="Multiple Products">Multiple Products</SelectItem>
            <SelectItem value="collection" label="Collection">Collection</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* <div className={selectionMode === "collection" ? "grid grid-cols-2 gap-3" : undefined}>


      </div> */}

      {selectionMode === "collection" && (
        <div className="space-y-2">
          <Label htmlFor="collection">Collection</Label>
          <Select
            value={collection}
            onValueChange={(v) => v && setCollection(v)}
          >
            <SelectTrigger id="collection">
              <SelectValue placeholder="Select collection..." />
            </SelectTrigger>
            <SelectContent>
              {collections?.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectionMode === "single" && (
        <div className="space-y-2">
          <Label htmlFor="product">Product</Label>
          <Select
            value={productId}
            onValueChange={(v) => v && setProductId(v)}
          >
            <SelectTrigger id="product">
              <SelectValue placeholder="Select product..." />
            </SelectTrigger>
            <SelectContent>
              {products
                ?.filter((p) => p.status === "active" || p.status === "future_release")
                .map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}{p.status === "future_release" ? " (Future Release)" : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectionMode === "multiple" && (
        <div className="space-y-2">
          <Label>Products</Label>
          {selectedProductIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedProductIds.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1">
                  {productMap.get(id as Id<"products">)?.name ?? "Unknown"}
                  <button
                    type="button"
                    onClick={() => removeProduct(id)}
                    className="ml-1"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {availableProducts.length > 0 && (
            <Select value="" onValueChange={(v) => v && addProduct(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Add product..." />
              </SelectTrigger>
              <SelectContent>
                {availableProducts.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="rateType">Rate Type</Label>
        <Select
          value={rateType}
          onValueChange={(v) => v && setRateType(v as "fixed" | "percentage")}
        >
          <SelectTrigger id="rateType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage" label="Percentage">Percentage</SelectItem>
            <SelectItem value="fixed" label="Fixed (RM)">Fixed (RM)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rateValue">
          {rateType === "percentage" ? "% of Retail" : "Amount (RM)"}
        </Label>
        <Input
          id="rateValue"
          type="number"
          step={rateType === "percentage" ? "1" : "0.01"}
          placeholder={rateType === "percentage" ? "e.g. 70" : "e.g. 35.00"}
          value={rateValue}
          onChange={(e) => setRateValue(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          {rateType === "percentage"
            ? "Percentage of the retail price the agent pays to HQ."
            : "Fixed amount (RM) the agent pays to HQ per unit."}
        </p>
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
            : initial ? "Save Changes" : "Create Default"}
        </Button>
      </div>
    </form>
  );
}

function describeScope(
  d: {
    productId?: Id<"products"> | null;
    productIds?: Id<"products">[] | null;
    collection?: string | null;
  },
  productMap: Map<Id<"products">, { name: string }>
) {
  if (d.productId) {
    return productMap.get(d.productId)?.name ?? "Unknown";
  }
  if (d.productIds && d.productIds.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {d.productIds.map((pid) => (
          <Badge key={pid} variant="secondary" className="text-xs">
            {productMap.get(pid)?.name ?? "Unknown"}
          </Badge>
        ))}
      </div>
    );
  }
  if (d.collection) {
    return (
      <Badge variant="outline" className="text-xs">
        {d.collection}
      </Badge>
    );
  }
  return "All Products";
}

export default function PricingPage() {
  const defaults = useQuery(api.pricingDefaults.list);
  const products = useQuery(api.products.list);
  const remove = useMutation(api.pricingDefaults.remove);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"pricingDefaults"> | null>(
    null
  );

  const productMap = new Map(
    products?.map((p) => [p._id, p] as [Id<"products">, typeof p]) ?? []
  );
  const isLoading = defaults === undefined;
  const editingDefault = editingId
    ? defaults?.find((d) => d._id === editingId)
    : undefined;

  function openCreate() {
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(id: Id<"pricingDefaults">) {
    setEditingId(id);
    setDialogOpen(true);
  }

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
            <p className="text-muted-foreground">
              Set default HQ pricing rates per stock model. Agents pay this rate
              to HQ.
            </p>
          </div>
          <Button onClick={openCreate}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Default
          </Button>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingDefault ? "Edit Pricing Default" : "Add Pricing Default"}
              </DialogTitle>
              <DialogDescription>
                {editingDefault
                  ? "Update the pricing rate for this stock model."
                  : "Set a default HQ pricing rate that agents pay per stock model."}
              </DialogDescription>
            </DialogHeader>
            <PricingForm
              key={editingId ?? "new"}
              initial={editingDefault}
              onDone={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : defaults.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No pricing defaults set. Agents will be charged full retail price.
            </CardContent>
          </Card>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stock Model</TableHead>
                <TableHead>Applies To</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {defaults.map((d) => (
                <TableRow key={d._id}>
                  <TableCell>
                    <Badge variant="outline">
                      {
                        STOCK_MODELS.find((m) => m.value === d.stockModel)
                          ?.label
                      }
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {describeScope(
                      {
                        productId: d.productId ?? null,
                        productIds: d.productIds ?? null,
                        collection: d.collection ?? null,
                      },
                      productMap
                    )}
                  </TableCell>
                  <TableCell>{formatRate(d.rateType, d.rateValue)}</TableCell>
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
                        <DropdownMenuItem onClick={() => openEdit(d._id)}>
                          Edit Pricing
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => remove({ id: d._id })}
                        >
                          Delete Pricing
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </RoleGuard>
  );
}
