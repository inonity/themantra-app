"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrashIcon, SaveIcon } from "lucide-react";

const STOCK_MODELS = [
  { value: "hold_paid", label: "Hold & Paid" },
  { value: "consignment", label: "Consignment" },
  { value: "dropship", label: "Dropship" },
] as const;

type StockModel = "hold_paid" | "consignment" | "dropship";

function formatRate(rateType: string, rateValue: number) {
  if (rateType === "percentage") {
    return `${(rateValue * 100).toFixed(0)}% of bundle retail`;
  }
  return `RM ${rateValue.toFixed(2)} fixed`;
}

export function OfferPricingDialog({
  offerId,
  offerName,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  offerId: Id<"offers">;
  offerName: string;
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const pricingRules = useQuery(api.offerPricing.listByOffer, { offerId });
  const upsert = useMutation(api.offerPricing.upsert);
  const remove = useMutation(api.offerPricing.remove);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [stockModel, setStockModel] = useState<StockModel>("consignment");
  const [rateType, setRateType] = useState<"fixed" | "percentage">("fixed");
  const [rateValue, setRateValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const value = parseFloat(rateValue);
      if (isNaN(value)) throw new Error("Invalid rate value");
      await upsert({
        offerId,
        stockModel,
        rateType,
        rateValue: rateType === "percentage" ? value / 100 : value,
      });
      setRateValue("");
    } finally {
      setSaving(false);
    }
  }

  // Stock models that already have pricing set
  const existingModels = new Set(pricingRules?.map((r) => r.stockModel) ?? []);
  const availableModels = STOCK_MODELS.filter(
    (m) => !existingModels.has(m.value)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger render={children} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>HQ Pricing — {offerName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Set what agents pay HQ for this bundle offer per stock model.
        </p>

        {pricingRules && pricingRules.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stock Model</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricingRules.map((rule) => (
                <TableRow key={rule._id}>
                  <TableCell>
                    <Badge variant="outline">
                      {STOCK_MODELS.find((m) => m.value === rule.stockModel)
                        ?.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatRate(rule.rateType, rule.rateValue)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove({ id: rule._id })}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {pricingRules?.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4">
            No HQ pricing set. Agents will be charged per-product rates.
          </div>
        )}

        {availableModels.length > 0 && (
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-4 gap-3 items-end pt-2"
          >
            <div>
              <Label>Stock Model</Label>
              <Select
                value={stockModel}
                onValueChange={(v) => v && setStockModel(v as StockModel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((m) => (
                    <SelectItem key={m.value} value={m.value} label={m.label}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rate Type</Label>
              <Select
                value={rateType}
                onValueChange={(v) =>
                  v && setRateType(v as "fixed" | "percentage")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed" label="Fixed (RM)">Fixed (RM)</SelectItem>
                  <SelectItem value="percentage" label="Percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                {rateType === "percentage" ? "% of Bundle Retail" : "HQ Price (RM)"}
              </Label>
              <Input
                type="number"
                step={rateType === "percentage" ? "1" : "0.01"}
                placeholder={rateType === "percentage" ? "e.g. 60" : "e.g. 60.00"}
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={saving}>
              <SaveIcon className="h-4 w-4 mr-1" />
              Add
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
