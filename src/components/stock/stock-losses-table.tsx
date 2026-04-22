"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FacetedFilter } from "@/components/stock/faceted-filter";
import { XIcon } from "lucide-react";

const categoryLabel: Record<string, string> = {
  damaged: "Damaged",
  expired: "Expired",
  lost: "Lost",
  miscount: "Miscount",
  sample: "Sample",
  self_use: "Self-Use",
  other: "Other",
};

const categoryTone: Record<string, string> = {
  damaged: "text-red-600 border-red-300",
  expired: "text-orange-600 border-orange-300",
  lost: "text-amber-600 border-amber-300",
  miscount: "text-slate-600 border-slate-300",
  sample: "text-purple-600 border-purple-300",
  self_use: "text-blue-600 border-blue-300",
  other: "text-muted-foreground border-muted",
};

const stockModelLabel: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
  dropship: "Dropship",
};

function formatRM(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

export function StockLossesTable() {
  const losses = useQuery(api.stockMovements.listStockLosses);
  const hqName = useQuery(api.users.getHQName) ?? "HQ";
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());

  const categoryOptions = Object.entries(categoryLabel).map(([value, label]) => ({
    label,
    value,
  }));

  const sourceOptions = [
    { label: "Agent", value: "agent_role" },
    { label: "Sales", value: "sales_role" },
    { label: "HQ", value: "hq" },
  ];

  const filtered = useMemo(() => {
    if (!losses) return [];
    let result = losses;
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (l) =>
          (l.attributedUserName ?? "").toLowerCase().includes(term) ||
          l.productName.toLowerCase().includes(term) ||
          (l.variantName ?? "").toLowerCase().includes(term) ||
          l.batchCode.toLowerCase().includes(term) ||
          (l.notes ?? "").toLowerCase().includes(term)
      );
    }
    if (selectedCategories.size > 0) {
      result = result.filter(
        (l) => l.writeOffCategory && selectedCategories.has(l.writeOffCategory)
      );
    }
    if (selectedSources.size > 0) {
      result = result.filter((l) => {
        if (l.source === "business") return selectedSources.has("hq");
        if (l.attributedUserRole === "sales") return selectedSources.has("sales_role");
        return selectedSources.has("agent_role");
      });
    }
    return result;
  }, [losses, search, selectedCategories, selectedSources]);

  const hasActiveFilters =
    search !== "" || selectedCategories.size > 0 || selectedSources.size > 0;

  const totals = useMemo(() => {
    let chargedAmount = 0;
    let totalQty = 0;
    let writeOffCount = 0;
    for (const l of filtered) {
      totalQty += l.quantity;
      if (l.salePrice && l.salePrice > 0) {
        chargedAmount += l.salePrice;
      } else {
        writeOffCount += 1;
      }
    }
    return { chargedAmount, totalQty, writeOffCount };
  }, [filtered]);

  if (losses === undefined) {
    return <div className="text-sm text-muted-foreground">Loading losses...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search person, product, batch..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[180px] lg:w-[260px]"
        />
        <FacetedFilter
          title="Category"
          options={categoryOptions}
          selected={selectedCategories}
          onSelectionChange={setSelectedCategories}
        />
        <FacetedFilter
          title="Source"
          options={sourceOptions}
          selected={selectedSources}
          onSelectionChange={setSelectedSources}
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setSelectedCategories(new Set());
              setSelectedSources(new Set());
            }}
            className="h-8"
          >
            Reset <XIcon className="ml-2 size-4" />
          </Button>
        )}
        <div className="flex w-full items-center gap-4 text-xs text-muted-foreground sm:ml-auto sm:w-auto">
          <span>
            <span className="font-medium text-foreground">{totals.totalQty}</span>{" "}
            unit{totals.totalQty !== 1 ? "s" : ""}
          </span>
          <span>
            Charged:{" "}
            <span className="font-medium text-foreground">
              {formatRM(totals.chargedAmount)}
            </span>
          </span>
          <span>
            Write-offs:{" "}
            <span className="font-medium text-foreground">{totals.writeOffCount}</span>
          </span>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Date</TableHead>
              <TableHead>Attributed to</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Batch · Model</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {hasActiveFilters
                    ? "No losses match the current filters."
                    : "No stock losses recorded."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l) => {
                const category = l.writeOffCategory ?? "other";
                const isHQSource = l.source === "business";
                const charged = l.salePrice && l.salePrice > 0 ? l.salePrice : null;
                return (
                  <TableRow key={l._id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(l.movedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {l.attributedUserName ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{l.attributedUserName}</span>
                          {l.attributedUserRole && (
                            <Badge
                              variant={
                                l.attributedUserRole === "sales"
                                  ? "secondary"
                                  : l.attributedUserRole === "admin"
                                    ? "default"
                                    : "outline"
                              }
                              className="text-[10px] px-1.5 py-0 capitalize"
                            >
                              {l.attributedUserRole}
                            </Badge>
                          )}
                        </div>
                      ) : isHQSource ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{hqName}</span>
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            HQ
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{l.productName}</span>
                        {l.variantName && (
                          <span className="text-xs text-muted-foreground">
                            {l.variantName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{l.batchCode}</span>
                        {l.stockModel && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {stockModelLabel[l.stockModel] ?? l.stockModel}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={categoryTone[category]}>
                        {categoryLabel[category] ?? category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {l.quantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {charged !== null ? (
                        <span className="font-medium">{formatRM(charged)}</span>
                      ) : (
                        <span className="text-muted-foreground">Write-off</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                      {l.notes || "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
