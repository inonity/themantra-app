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
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ForWho = "customers" | "agents" | "both";

const FOR_WHO_LABELS: Record<ForWho, string> = {
  customers: "Customers",
  agents: "Agents",
  both: "Both",
};

/** Auto-generates the variant name from its fields. */
function buildName(forWho: ForWho, sizeMl: string, type: string): string {
  const sizeLabel = sizeMl ? `${sizeMl}ML` : "";
  if (forWho === "agents") {
    if (type && sizeLabel) return `${type} ${sizeLabel}`;
    if (type) return type;
    return sizeLabel;
  }
  return sizeLabel || "Variant";
}

export function ProductVariantFormDialog({
  productId,
  variant,
  children,
}: {
  productId: Id<"products">;
  variant?: Doc<"productVariants">;
  children: React.ReactElement;
}) {
  const createVariant = useMutation(api.productVariants.create);
  const updateVariant = useMutation(api.productVariants.update);
  const existingSizes = useQuery(api.productVariants.listSizes) ?? [];
  const existingTypes = useQuery(api.productVariants.listAgentTypes) ?? [];

  const [open, setOpen] = useState(false);
  const [sizeMlValue, setSizeMlValue] = useState(variant?.sizeMl?.toString() ?? "");
  const [sizeMode, setSizeMode] = useState<"pick" | "custom">("pick");
  const [typeValue, setTypeValue] = useState(variant?.type ?? "");
  const [typeMode, setTypeMode] = useState<"pick" | "custom">("pick");
  const [price, setPrice] = useState(variant?.price?.toString() ?? "");
  const [forWho, setForWho] = useState<ForWho>((variant?.forWho ?? "customers") as ForWho);
  const [status, setStatus] = useState<"active" | "discontinued">(variant?.status ?? "active");
  const [sortOrder, setSortOrder] = useState(variant?.sortOrder?.toString() ?? "");
  const [error, setError] = useState("");

  const knownSizes = Array.from(
    new Set([...existingSizes, ...(variant?.sizeMl != null ? [variant.sizeMl] : [])])
  ).sort((a, b) => a - b);

  const knownTypes = Array.from(
    new Set([...existingTypes, ...(variant?.type ? [variant.type] : [])])
  ).sort();

  const selectedSizeInList = sizeMlValue && knownSizes.includes(parseFloat(sizeMlValue));
  const showCustomSizeInput = sizeMode === "custom" || (sizeMlValue && !selectedSizeInList);

  const selectedTypeInList = typeValue && knownTypes.includes(typeValue);
  const showCustomTypeInput = typeMode === "custom" || (typeValue && !selectedTypeInList);

  function resetForm() {
    if (!variant) {
      setSizeMlValue("");
      setSizeMode("pick");
      setTypeValue("");
      setTypeMode("pick");
      setPrice("");
      setForWho("customers");
      setStatus("active");
      setSortOrder("");
    }
    setError("");
  }

  function syncOpen(v: boolean) {
    setOpen(v);
    if (v && variant) {
      setSizeMlValue(variant.sizeMl?.toString() ?? "");
      setSizeMode("pick");
      setTypeValue(variant.type ?? "");
      setTypeMode("pick");
      setPrice(variant.price.toString());
      setForWho((variant.forWho ?? "customers") as ForWho);
      setStatus(variant.status);
      setSortOrder(variant.sortOrder?.toString() ?? "");
    }
    if (!v) resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError("Price must be a valid number");
      return;
    }

    const sizeMlNum = sizeMlValue ? parseFloat(sizeMlValue) : undefined;
    const typeStr = forWho === "agents" ? typeValue.trim() || undefined : undefined;
    const name = buildName(forWho, sizeMlValue, typeValue);

    try {
      if (variant) {
        await updateVariant({
          id: variant._id,
          name,
          sizeMl: sizeMlNum,
          type: typeStr,
          price: priceNum,
          forWho,
          status,
          sortOrder: sortOrder ? parseInt(sortOrder) : undefined,
        });
      } else {
        await createVariant({
          productId,
          name,
          sizeMl: sizeMlNum,
          type: typeStr,
          price: priceNum,
          forWho,
          status,
          sortOrder: sortOrder ? parseInt(sortOrder) : undefined,
        });
      }
      setOpen(false);
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save variant");
    }
  }

  return (
    <Dialog open={open} onOpenChange={syncOpen}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{variant ? "Edit Variant" : "Add Variant"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* For who */}
          <div className="space-y-2">
            <Label>For</Label>
            <Select
              value={forWho}
              onValueChange={(v) => setForWho(v as ForWho)}
            >
              <SelectTrigger>
                <SelectValue>{FOR_WHO_LABELS[forWho]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customers">Customers</SelectItem>
                <SelectItem value="agents">Agents</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type — agents only */}
          {forWho === "agents" && (
            <div className="space-y-2">
              <Label>Type</Label>
              {knownTypes.length > 0 && !showCustomTypeInput ? (
                <div className="flex gap-2">
                  <Select
                    value={typeValue && selectedTypeInList ? typeValue : ""}
                    onValueChange={(v) => {
                      if (v === "__custom__") {
                        setTypeMode("custom");
                        setTypeValue("");
                      } else {
                        setTypeValue(v ?? "");
                      }
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select type...">
                        {typeValue && selectedTypeInList ? typeValue : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {knownTypes.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">New type...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={typeValue}
                    onChange={(e) => setTypeValue(e.target.value)}
                    placeholder="e.g. Tester, Refill"
                    className="flex-1"
                    autoFocus={showCustomTypeInput as boolean}
                  />
                  {knownTypes.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTypeMode("pick")}
                    >
                      Pick
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Size */}
          <div className="space-y-2">
            <Label>Size (ML)</Label>
            {knownSizes.length > 0 && !showCustomSizeInput ? (
              <div className="flex gap-2">
                <Select
                  value={sizeMlValue && selectedSizeInList ? sizeMlValue : ""}
                  onValueChange={(v) => {
                    if (v === "__custom__") {
                      setSizeMode("custom");
                      setSizeMlValue("");
                    } else {
                      setSizeMlValue(v ?? "");
                    }
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select size...">
                      {sizeMlValue && selectedSizeInList ? `${sizeMlValue} ML` : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {knownSizes.map((s) => (
                      <SelectItem key={s} value={s.toString()}>
                        {s} ML
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">Custom size...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={sizeMlValue}
                  onChange={(e) => setSizeMlValue(e.target.value)}
                  placeholder="e.g. 30"
                  className="flex-1"
                  autoFocus={showCustomSizeInput as boolean}
                />
                {knownSizes.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSizeMode("pick")}
                  >
                    Pick
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="variantPrice">Price (RM)</Label>
              <Input
                id="variantPrice"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                min="0"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Lower = first</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "active" | "discontinued")}
            >
              <SelectTrigger>
                <SelectValue>
                  {status === "active" ? "Active" : "Discontinued"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="discontinued">Discontinued</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit">{variant ? "Save Changes" : "Add Variant"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
