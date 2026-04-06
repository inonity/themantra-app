"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReleaseUnitsDialog } from "@/components/batches/release-units-dialog";
import { FacetedFilter, DateRangeFilter, RangeFilter } from "@/components/stock/faceted-filter";
import {
  ChevronDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

type BatchStatus = "upcoming" | "partial" | "available" | "depleted" | "cancelled";
type SortColumn = "variant" | "batchCode" | "manufacturedDate" | "expectedReadyDate" | "totalQuantity" | "status";
type SortDir = "asc" | "desc";

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

const ALLOWED_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  upcoming: ["available", "cancelled"],
  partial: ["available", "cancelled"],
  available: ["depleted", "cancelled"],
  depleted: ["cancelled"],
  cancelled: [],
};

function SortableHead({
  label,
  column,
  sortColumn,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSort: (col: SortColumn) => void;
}) {
  const isActive = sortColumn === column;
  return (
    <TableHead>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => onSort(column)}
      >
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

export function BatchTable({
  batches,
  variants,
}: {
  batches: Doc<"batches">[];
  variants?: Doc<"productVariants">[];
}) {
  const variantMap = useMemo(
    () => new Map(variants?.map((v) => [v._id, v.name]) ?? []),
    [variants]
  );
  const updateStatus = useMutation(api.batches.updateStatus);
  const [releasingBatch, setReleasingBatch] = useState<Doc<"batches"> | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [mfgFrom, setMfgFrom] = useState("");
  const [mfgTo, setMfgTo] = useState("");
  const [matFrom, setMatFrom] = useState("");
  const [matTo, setMatTo] = useState("");
  const [qtyMin, setQtyMin] = useState("");
  const [qtyMax, setQtyMax] = useState("");

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>("manufacturedDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  }

  function handleStatusChange(batch: Doc<"batches">, newStatus: BatchStatus) {
    if (
      (batch.status === "upcoming" || batch.status === "partial") &&
      newStatus === "available"
    ) {
      setReleasingBatch(batch);
      return;
    }
    updateStatus({ id: batch._id, status: newStatus })
      .then(() => toast.success(`Status changed to ${statusLabel[newStatus]}`))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to update status";
        toast.error(message);
      });
  }

  // Only variants that appear in this batch list
  const variantOptions = useMemo(() => {
    const usedIds = new Set(batches.map((b) => b.variantId).filter(Boolean) as string[]);
    return (variants ?? [])
      .filter((v) => usedIds.has(v._id))
      .map((v) => ({ label: v.name, value: v._id }));
  }, [batches, variants]);

  const statusOptions = [
    { label: "Upcoming", value: "upcoming" },
    { label: "Partial", value: "partial" },
    { label: "Available", value: "available" },
    { label: "Depleted", value: "depleted" },
    { label: "Cancelled", value: "cancelled" },
  ];

  const hasActiveFilters =
    search !== "" ||
    selectedVariants.size > 0 ||
    selectedStatuses.size > 0 ||
    mfgFrom !== "" ||
    mfgTo !== "" ||
    matFrom !== "" ||
    matTo !== "" ||
    qtyMin !== "" ||
    qtyMax !== "";

  function clearFilters() {
    setSearch("");
    setSelectedVariants(new Set());
    setSelectedStatuses(new Set());
    setMfgFrom("");
    setMfgTo("");
    setMatFrom("");
    setMatTo("");
    setQtyMin("");
    setQtyMax("");
  }

  const filtered = useMemo(() => {
    let result = batches;

    if (search) {
      const term = search.toLowerCase();
      result = result.filter((b) => {
        const variantName = b.variantId ? (variantMap.get(b.variantId) ?? "") : "";
        return (
          b.batchCode.toLowerCase().includes(term) ||
          variantName.toLowerCase().includes(term)
        );
      });
    }

    if (selectedVariants.size > 0) {
      result = result.filter((b) => b.variantId && selectedVariants.has(b.variantId));
    }

    if (selectedStatuses.size > 0) {
      result = result.filter((b) => selectedStatuses.has(b.status));
    }

    if (mfgFrom) {
      result = result.filter((b) => b.manufacturedDate >= mfgFrom);
    }
    if (mfgTo) {
      result = result.filter((b) => b.manufacturedDate <= mfgTo);
    }
    if (matFrom) {
      result = result.filter((b) => b.expectedReadyDate != null && b.expectedReadyDate >= matFrom);
    }
    if (matTo) {
      result = result.filter((b) => b.expectedReadyDate != null && b.expectedReadyDate <= matTo);
    }

    const parsedMin = qtyMin ? parseInt(qtyMin) : null;
    const parsedMax = qtyMax ? parseInt(qtyMax) : null;
    if (parsedMin !== null && !isNaN(parsedMin)) {
      result = result.filter((b) => b.totalQuantity >= parsedMin);
    }
    if (parsedMax !== null && !isNaN(parsedMax)) {
      result = result.filter((b) => b.totalQuantity <= parsedMax);
    }

    return [...result].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortColumn) {
        case "variant":
          aVal = a.variantId ? (variantMap.get(a.variantId) ?? "") : "";
          bVal = b.variantId ? (variantMap.get(b.variantId) ?? "") : "";
          break;
        case "batchCode":
          aVal = a.batchCode;
          bVal = b.batchCode;
          break;
        case "manufacturedDate":
          aVal = a.manufacturedDate;
          bVal = b.manufacturedDate;
          break;
        case "expectedReadyDate":
          aVal = a.expectedReadyDate ?? "";
          bVal = b.expectedReadyDate ?? "";
          break;
        case "totalQuantity":
          aVal = a.totalQuantity;
          bVal = b.totalQuantity;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
      }

      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [batches, search, selectedVariants, selectedStatuses, mfgFrom, mfgTo, matFrom, matTo, qtyMin, qtyMax, sortColumn, sortDir, variantMap]);

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="Filter by batch code, variant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[180px] lg:w-[260px]"
          />
          {variantOptions.length > 0 && (
            <FacetedFilter
              title="Variant"
              options={variantOptions}
              selected={selectedVariants}
              onSelectionChange={setSelectedVariants}
            />
          )}
          <FacetedFilter
            title="Status"
            options={statusOptions}
            selected={selectedStatuses}
            onSelectionChange={setSelectedStatuses}
          />
          <DateRangeFilter
            title="Manufactured"
            from={mfgFrom}
            to={mfgTo}
            onFromChange={setMfgFrom}
            onToChange={setMfgTo}
          />
          <DateRangeFilter
            title="Maturation"
            from={matFrom}
            to={matTo}
            onFromChange={setMatFrom}
            onToChange={setMatTo}
          />
          <RangeFilter
            title="Quantity"
            min={qtyMin}
            max={qtyMax}
            onMinChange={setQtyMin}
            onMaxChange={setQtyMax}
          />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8">
              Reset
              <XIcon className="ml-2 size-4" />
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <SortableHead label="Batch Code" column="batchCode" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                <SortableHead label="Variant" column="variant" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                <SortableHead label="Manufactured" column="manufacturedDate" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                <SortableHead label="Expected Maturation" column="expectedReadyDate" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                <SortableHead label="Quantity" column="totalQuantity" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                <SortableHead label="Status" column="status" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {hasActiveFilters
                      ? "No batches match the current filters."
                      : "No batches yet. Create your first batch to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((batch) => {
                  const allowedNext = ALLOWED_TRANSITIONS[batch.status as BatchStatus] ?? [];
                  const isPartial = batch.status === "partial";
                  const released = batch.releasedQuantity ?? 0;
                  return (
                    <TableRow key={batch._id}>
                      <TableCell className="font-medium">{batch.batchCode}</TableCell>
                      <TableCell>
                        {batch.variantId ? (variantMap.get(batch.variantId) ?? "—") : "—"}
                      </TableCell>
                      <TableCell>{batch.manufacturedDate}</TableCell>
                      <TableCell>{batch.expectedReadyDate ?? "—"}</TableCell>
                      <TableCell>
                        {isPartial ? (
                          <span>{released} / {batch.totalQuantity}</span>
                        ) : (
                          batch.totalQuantity
                        )}
                      </TableCell>
                      <TableCell>
                        {allowedNext.length > 0 ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger>
                              <Badge
                                variant={statusVariant[batch.status]}
                                className="cursor-pointer"
                              >
                                {statusLabel[batch.status] ?? batch.status}
                                <ChevronDownIcon className="ml-1 h-3 w-3" />
                              </Badge>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {allowedNext.map((s) => (
                                <DropdownMenuItem
                                  key={s}
                                  onClick={() => handleStatusChange(batch, s)}
                                >
                                  <Badge variant={statusVariant[s]} className="mr-2">
                                    {statusLabel[s]}
                                  </Badge>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Badge variant={statusVariant[batch.status]}>
                            {statusLabel[batch.status] ?? batch.status}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {releasingBatch && (
        <ReleaseUnitsDialog
          batch={releasingBatch}
          open={!!releasingBatch}
          onOpenChange={(open) => { if (!open) setReleasingBatch(null); }}
        />
      )}
    </>
  );
}
