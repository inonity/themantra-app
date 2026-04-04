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
import { Separator } from "@/components/ui/separator";
import { SaveIcon } from "lucide-react";

const STOCK_MODELS = [
  { value: "hold_paid", label: "Hold & Paid" },
  { value: "consignment", label: "Consignment" },
  { value: "presell", label: "Pre-sell" },
  { value: "dropship", label: "Dropship" },
] as const;

type StockModel = "hold_paid" | "consignment" | "presell" | "dropship";

function formatRate(rateType: string, rateValue: number) {
  if (rateType === "percentage") {
    return `${(rateValue * 100).toFixed(0)}% of retail`;
  }
  return `RM ${rateValue.toFixed(2)} fixed`;
}

export function AgentPricingDialog({
  agentId,
  agentName,
  children,
}: {
  agentId: Id<"users">;
  agentName: string;
  children: React.ReactElement;
}) {
  const profile = useQuery(api.agentProfiles.getByAgentId, { agentId });
  const rates = useQuery(api.rates.list) ?? [];
  const upsertProfile = useMutation(api.agentProfiles.upsert);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedRateId, setSelectedRateId] = useState<string>("");
  const [defaultStockModel, setDefaultStockModel] = useState<StockModel | "">(
    ""
  );
  const [notes, setNotes] = useState("");

  function loadProfile() {
    setSelectedRateId(profile?.rateId ?? "");
    setDefaultStockModel(profile?.defaultStockModel ?? "");
    setNotes(profile?.notes ?? "");
  }

  async function handleSave() {
    setSaving(true);
    try {
      await upsertProfile({
        agentId,
        rateId: selectedRateId
          ? (selectedRateId as Id<"rates">)
          : undefined,
        defaultStockModel: defaultStockModel
          ? (defaultStockModel as StockModel)
          : undefined,
        notes: notes || undefined,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const selectedRate = rates.find((r) => r._id === selectedRateId);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) loadProfile();
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>Rate — {agentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Rate Assignment */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Assigned Rate</h3>
            <p className="text-xs text-muted-foreground">
              Select the HQ pricing rate for this agent. This determines what
              they pay HQ per collection.
            </p>
            <Select
              value={selectedRateId}
              onValueChange={(v) => v && setSelectedRateId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a rate...">
                  {selectedRate ? selectedRate.name : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {rates.map((r) => (
                  <SelectItem key={r._id} value={r._id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Preview of selected rate */}
            {selectedRate && (
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Rate Preview
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Collection</TableHead>
                      <TableHead>HQ Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRate.collectionRates.map((cr, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant="outline">{cr.collection}</Badge>
                        </TableCell>
                        <TableCell>
                          {formatRate(cr.rateType, cr.rateValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {selectedRate.defaultRate &&
                      !(selectedRate.defaultRate.rateType === "percentage" && selectedRate.defaultRate.rateValue === 1) && (
                      <TableRow>
                        <TableCell>
                          <span className="text-muted-foreground italic">
                            Default
                          </span>
                        </TableCell>
                        <TableCell>
                          {formatRate(
                            selectedRate.defaultRate.rateType,
                            selectedRate.defaultRate.rateValue
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <Separator />

          {/* Default Stock Model */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Default Stock Model</h3>
            <p className="text-xs text-muted-foreground">
              The preferred stock model for this agent (used as default when
              recording sales). This only affects logistics, not pricing.
            </p>
            <Select
              value={defaultStockModel}
              onValueChange={(v) =>
                v && setDefaultStockModel(v as StockModel)
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select...">
                  {defaultStockModel ? STOCK_MODELS.find((m) => m.value === defaultStockModel)?.label : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STOCK_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              placeholder="Optional notes about this agent..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              <SaveIcon className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
