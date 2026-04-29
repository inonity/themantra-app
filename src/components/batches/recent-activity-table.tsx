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
import { DateRangeFilter, FacetedFilter } from "@/components/stock/faceted-filter";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  PackagePlusIcon,
  RefreshCwIcon,
  PlusCircleIcon,
  MinusCircleIcon,
  GitCompareIcon,
  XIcon,
} from "lucide-react";

type ActivityType =
  | "created"
  | "released"
  | "adjusted_added"
  | "adjusted_deducted"
  | "status_changed";

const typeOptions = [
  { label: "Batch Created", value: "created" },
  { label: "Released", value: "released" },
  { label: "Stock Added", value: "adjusted_added" },
  { label: "Stock Deducted", value: "adjusted_deducted" },
  { label: "Status Changed", value: "status_changed" },
];

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  upcoming: "secondary",
  partial: "secondary",
  available: "default",
  depleted: "destructive",
  cancelled: "outline",
};

const statusLabel: Record<string, string> = {
  upcoming: "Upcoming",
  partial: "Partial",
  available: "Available",
  depleted: "Depleted",
  cancelled: "Cancelled",
};

const categoryLabel: Record<string, string> = {
  damaged: "Damaged",
  expired: "Expired",
  lost: "Lost",
  miscount: "Miscount",
  sample: "Sample",
  self_use: "Self use",
  other: "Other",
};

function TypeBadge({ type }: { type: ActivityType }) {
  switch (type) {
    case "created":
      return (
        <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
          <PackagePlusIcon className="h-3 w-3" />
          Batch Created
        </Badge>
      );
    case "released":
      return (
        <Badge variant="outline" className="gap-1 text-blue-700 border-blue-300">
          <RefreshCwIcon className="h-3 w-3" />
          Released
        </Badge>
      );
    case "adjusted_added":
      return (
        <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
          <PlusCircleIcon className="h-3 w-3" />
          Stock Added
        </Badge>
      );
    case "adjusted_deducted":
      return (
        <Badge variant="outline" className="gap-1 text-rose-700 border-rose-300">
          <MinusCircleIcon className="h-3 w-3" />
          Stock Deducted
        </Badge>
      );
    case "status_changed":
      return (
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300">
          <GitCompareIcon className="h-3 w-3" />
          Status Changed
        </Badge>
      );
  }
}

type SortColumn = "timestamp" | "quantity";
type SortDir = "asc" | "desc";

function SortableHead({
  label,
  column,
  sortColumn,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  column: SortColumn;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSort: (col: SortColumn) => void;
  className?: string;
}) {
  const isActive = sortColumn === column;
  return (
    <TableHead className={className}>
      <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => onSort(column)}>
        {label}
        {isActive ? (
          sortDir === "asc" ? (
            <ArrowUpIcon className="ml-2 h-4 w-4" />
          ) : (
            <ArrowDownIcon className="ml-2 h-4 w-4" />
          )
        ) : (
          <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />
        )}
      </Button>
    </TableHead>
  );
}

export function RecentActivityTable() {
  const activity = useQuery(api.batches.listRecentActivity);

  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [sortColumn, setSortColumn] = useState<SortColumn>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const productOptions = useMemo(() => {
    if (!activity) return [];
    const seen = new Map<string, string>();
    for (const a of activity) seen.set(a.productId, a.productName);
    return Array.from(seen.entries())
      .map(([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [activity]);

  const variantOptions = useMemo(() => {
    if (!activity) return [];
    const seen = new Map<string, string>();
    for (const a of activity) {
      if (a.variantId && a.variantName) seen.set(a.variantId, a.variantName);
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [activity]);

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir("desc");
    }
  }

  const hasActiveFilters =
    search !== "" ||
    selectedProducts.size > 0 ||
    selectedVariants.size > 0 ||
    selectedTypes.size > 0 ||
    dateFrom !== "" ||
    dateTo !== "";

  function clearFilters() {
    setSearch("");
    setSelectedProducts(new Set());
    setSelectedVariants(new Set());
    setSelectedTypes(new Set());
    setDateFrom("");
    setDateTo("");
  }

  const filtered = useMemo(() => {
    if (!activity) return [];
    let result = activity;

    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.productName.toLowerCase().includes(term) ||
          (a.variantName ?? "").toLowerCase().includes(term) ||
          a.batchCode.toLowerCase().includes(term) ||
          (a.notes ?? "").toLowerCase().includes(term) ||
          (a.recordedByName ?? "").toLowerCase().includes(term)
      );
    }
    if (selectedProducts.size > 0) {
      result = result.filter((a) => selectedProducts.has(a.productId));
    }
    if (selectedVariants.size > 0) {
      result = result.filter((a) => a.variantId && selectedVariants.has(a.variantId));
    }
    if (selectedTypes.size > 0) {
      result = result.filter((a) => selectedTypes.has(a.type));
    }
    if (dateFrom) {
      const fromMs = new Date(dateFrom + "T00:00:00").getTime();
      result = result.filter((a) => a.timestamp >= fromMs);
    }
    if (dateTo) {
      const toMs = new Date(dateTo + "T23:59:59.999").getTime();
      result = result.filter((a) => a.timestamp <= toMs);
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "timestamp") cmp = a.timestamp - b.timestamp;
      else cmp = (a.quantity ?? 0) - (b.quantity ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [activity, search, selectedProducts, selectedVariants, selectedTypes, dateFrom, dateTo, sortColumn, sortDir]);

  if (activity === undefined) {
    return <div className="text-sm text-muted-foreground">Loading activity...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search product, batch, note..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[200px] lg:w-[300px]"
        />
        <FacetedFilter
          title="Type"
          options={typeOptions}
          selected={selectedTypes}
          onSelectionChange={setSelectedTypes}
        />
        <FacetedFilter
          title="Product"
          options={productOptions}
          selected={selectedProducts}
          onSelectionChange={setSelectedProducts}
        />
        <FacetedFilter
          title="Variant"
          options={variantOptions}
          selected={selectedVariants}
          onSelectionChange={setSelectedVariants}
        />
        <DateRangeFilter
          title="Date"
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8">
            Reset <XIcon className="ml-2 size-4" />
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <SortableHead
                label="Date"
                column="timestamp"
                sortColumn={sortColumn}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <TableHead>Type</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <SortableHead
                label="Detail"
                column="quantity"
                sortColumn={sortColumn}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <TableHead>By</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {hasActiveFilters
                    ? "No activity matches the current filters."
                    : "No activity yet."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">
                    {new Date(a.timestamp).toLocaleString("en-CA", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={a.type} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{a.productName}</span>
                      {a.variantName && (
                        <span className="text-xs text-muted-foreground">{a.variantName}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{a.batchCode}</TableCell>
                  <TableCell>
                    {a.type === "status_changed" && a.previousStatus && a.newStatus ? (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Badge variant={statusVariant[a.previousStatus]}>
                          {statusLabel[a.previousStatus] ?? a.previousStatus}
                        </Badge>
                        <ArrowRightIcon className="h-3 w-3 text-muted-foreground" />
                        <Badge variant={statusVariant[a.newStatus]}>
                          {statusLabel[a.newStatus] ?? a.newStatus}
                        </Badge>
                      </div>
                    ) : a.quantity !== undefined ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold tabular-nums ${
                            a.type === "adjusted_deducted" ? "text-rose-700" : "text-emerald-700"
                          }`}
                        >
                          {a.type === "adjusted_deducted" ? "−" : "+"}
                          {a.quantity}
                        </span>
                        {a.category && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {categoryLabel[a.category] ?? a.category}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.recordedByName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                    {a.notes || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
