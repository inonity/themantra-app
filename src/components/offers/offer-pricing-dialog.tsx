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
  const rates = useQuery(api.rates.list) ?? [];
  const upsert = useMutation(api.offerPricing.upsert);
  const remove = useMutation(api.offerPricing.remove);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [selectedRateId, setSelectedRateId] = useState<string>("");
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
        rateId: selectedRateId as Id<"rates">,
        rateType,
        rateValue: rateType === "percentage" ? value / 100 : value,
      });
      setRateValue("");
    } finally {
      setSaving(false);
    }
  }

  // Rates that already have pricing set for this offer
  const existingRateIds = new Set(pricingRules?.map((r) => r.rateId) ?? []);
  const availableRates = rates.filter((r) => !existingRateIds.has(r._id));

  // Map rate IDs to names for display
  const rateMap = new Map(rates.map((r) => [r._id, r.name]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger render={children} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>HQ Pricing — {offerName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Set what agents pay HQ for this bundle offer, per rate tier.
        </p>

        {pricingRules && pricingRules.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rate</TableHead>
                <TableHead>HQ Price</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricingRules.map((rule) => (
                <TableRow key={rule._id}>
                  <TableCell>
                    <Badge variant="outline">
                      {rateMap.get(rule.rateId) ?? "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatRate(rule.rateType, rule.rateValue)}
                  </TableCell>
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
            No HQ pricing set. Agents will be charged per-product rates from
            their assigned rate.
          </div>
        )}

        {availableRates.length > 0 && (
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-4 gap-3 items-end pt-2"
          >
            <div>
              <Label>Rate</Label>
              <Select
                value={selectedRateId}
                onValueChange={(v) => v && setSelectedRateId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select rate..." />
                </SelectTrigger>
                <SelectContent>
                  {availableRates.map((r) => (
                    <SelectItem key={r._id} value={r._id}>
                      {r.name}
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
                  <SelectItem value="fixed">Fixed (RM)</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                {rateType === "percentage"
                  ? "% of Bundle Retail"
                  : "HQ Price (RM)"}
              </Label>
              <Input
                type="number"
                step={rateType === "percentage" ? "1" : "0.01"}
                placeholder={
                  rateType === "percentage" ? "e.g. 60" : "e.g. 60.00"
                }
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={saving || !selectedRateId}>
              <SaveIcon className="h-4 w-4 mr-1" />
              Add
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
