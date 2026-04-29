"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Doc } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useMutation } from "convex/react";
import {
  PlusIcon,
  MoreHorizontalIcon,
  ChevronDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { BatchFormDialog } from "@/components/batches/batch-form-dialog";
import { StockAdjustmentDialog } from "@/components/batches/stock-adjustment-dialog";
import { ReleaseUnitsDialog } from "@/components/batches/release-units-dialog";
import { RecentActivityTable } from "@/components/batches/recent-activity-table";
import { FacetedFilter, DateRangeFilter, RangeFilter } from "@/components/stock/faceted-filter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo } from "react";
import { toast } from "sonner";

type BatchStatus = "upcoming" | "partial" | "available" | "depleted" | "cancelled";
type SortColumn = "product" | "variant" | "batchCode" | "manufacturedDate" | "expectedReadyDate" | "totalQuantity" | "status";
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

export default function BatchesPage() {
  const batches = useQuery(api.batches.listAll);
  const products = useQuery(api.products.list);
  const variants = useQuery(api.productVariants.listAll);
  const updateStatus = useMutation(api.batches.updateStatus);

  const [editingBatch, setEditingBatch] = useState<Doc<"batches"> | null>(null);
  const [adjustingBatch, setAdjustingBatch] = useState<Doc<"batches"> | null>(null);
  const [releasingBatch, setReleasingBatch] = useState<Doc<"batches"> | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
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

  const productMap = useMemo(
    () => new Map((products ?? []).map((p) => [p._id, p])),
    [products]
  );
  const variantMap = useMemo(
    () => new Map((variants ?? []).map((v) => [v._id, v.name])),
    [variants]
  );

  const isLoading = batches === undefined || products === undefined;

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

  const productOptions = useMemo(
    () => (products ?? []).map((p) => ({ label: p.name, value: p._id })),
    [products]
  );

  // Only show variants that appear in at least one batch
  const variantOptions = useMemo(() => {
    const usedIds = new Set((batches ?? []).map((b) => b.variantId).filter(Boolean) as string[]);
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
    selectedProducts.size > 0 ||
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
    setSelectedProducts(new Set());
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
    if (!batches) return [];

    let result = batches;

    if (search) {
      const term = search.toLowerCase();
      result = result.filter((b) => {
        const productName = productMap.get(b.productId)?.name ?? "";
        const variantName = b.variantId ? (variantMap.get(b.variantId) ?? "") : "";
        return (
          b.batchCode.toLowerCase().includes(term) ||
          productName.toLowerCase().includes(term) ||
          variantName.toLowerCase().includes(term)
        );
      });
    }

    if (selectedProducts.size > 0) {
      result = result.filter((b) => selectedProducts.has(b.productId));
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
        case "product":
          aVal = productMap.get(a.productId)?.name ?? "";
          bVal = productMap.get(b.productId)?.name ?? "";
          break;
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
  }, [batches, search, selectedProducts, selectedVariants, selectedStatuses, mfgFrom, mfgTo, matFrom, matTo, qtyMin, qtyMax, sortColumn, sortDir, productMap, variantMap]);

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Batches</h1>
            <p className="text-muted-foreground">
              View and manage all batches across products.
            </p>
          </div>
          {products && (
            <BatchFormDialog products={products}>
              <Button className="w-full sm:w-auto">
                <PlusIcon className="h-4 w-4 mr-2" />
                New Batch
              </Button>
            </BatchFormDialog>
          )}
        </div>

        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              <span className="sm:hidden">All</span>
              <span className="hidden sm:inline">All Batches</span>
            </TabsTrigger>
            <TabsTrigger value="recent">
              <span className="sm:hidden">Recent</span>
              <span className="hidden sm:inline">Recent Activity</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            {isLoading ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : (
              <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input
                placeholder="Filter by product, batch code, variant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[200px] lg:w-[300px]"
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8"
                >
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
                    <SortableHead label="Product" column="product" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Variant" column="variant" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Batch Code" column="batchCode" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Manufactured" column="manufacturedDate" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Expected Maturation" column="expectedReadyDate" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Quantity" column="totalQuantity" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Status" column="status" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        {hasActiveFilters
                          ? "No batches match the current filters."
                          : 'No batches yet. Click "New Batch" to create one.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((batch) => {
                      const product = productMap.get(batch.productId);
                      const allowedNext = ALLOWED_TRANSITIONS[batch.status as BatchStatus] ?? [];
                      const isPartial = batch.status === "partial";
                      const released = batch.releasedQuantity ?? 0;
                      return (
                        <TableRow key={batch._id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/dashboard/products/${batch.productId}`}
                              className="hover:underline"
                            >
                              {product?.name ?? "Unknown"}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {batch.variantId ? (variantMap.get(batch.variantId) ?? "—") : "—"}
                          </TableCell>
                          <TableCell>{batch.batchCode}</TableCell>
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
                                    className="cursor-pointer gap-1"
                                  >
                                    {statusLabel[batch.status] ?? batch.status}
                                    <ChevronDownIcon className="h-3 w-3" />
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
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button variant="ghost" size="icon" className="h-8 w-8" />
                                }
                              >
                                <MoreHorizontalIcon className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditingBatch(batch)}>
                                  Edit
                                </DropdownMenuItem>
                                {(batch.status === "available" || batch.status === "partial") && (
                                  <DropdownMenuItem onClick={() => setAdjustingBatch(batch)}>
                                    Adjust Stock
                                  </DropdownMenuItem>
                                )}
                                {batch.status === "partial" && (
                                  <DropdownMenuItem onClick={() => setReleasingBatch(batch)}>
                                    Release More
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="recent" className="mt-4">
            <RecentActivityTable />
          </TabsContent>
        </Tabs>

        {/* Edit dialog */}
        <BatchFormDialog
          batch={editingBatch ?? undefined}
          open={!!editingBatch}
          onOpenChange={(open) => { if (!open) setEditingBatch(null); }}
        />

        {/* Stock adjustment dialog */}
        {adjustingBatch && (
          <StockAdjustmentDialog
            batch={adjustingBatch}
            open={!!adjustingBatch}
            onOpenChange={(open) => { if (!open) setAdjustingBatch(null); }}
          />
        )}

        {/* Release units dialog */}
        {releasingBatch && (
          <ReleaseUnitsDialog
            batch={releasingBatch}
            open={!!releasingBatch}
            onOpenChange={(open) => { if (!open) setReleasingBatch(null); }}
          />
        )}
      </div>
    </RoleGuard>
  );
}
