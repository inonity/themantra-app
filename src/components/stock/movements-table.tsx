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
import { ArrowRightIcon, XIcon } from "lucide-react";

const stockModelLabel: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
  dropship: "Dropship",
};

const directionOptions = [
  { label: "Transfer (HQ → Agent)", value: "transfer" },
  { label: "Return (Agent → HQ)", value: "return" },
];

const stockModelOptions = [
  { label: "Hold & Paid", value: "hold_paid" },
  { label: "Consignment", value: "consignment" },
  { label: "Pre-sell", value: "presell" },
  { label: "Dropship", value: "dropship" },
];

export function MovementsTable() {
  const movements = useQuery(api.stockMovements.listTransfers);

  const [search, setSearch] = useState("");
  const [selectedDirections, setSelectedDirections] = useState<Set<string>>(new Set());
  const [selectedStockModels, setSelectedStockModels] = useState<Set<string>>(new Set());
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const agentOptions = useMemo(() => {
    if (!movements) return [];
    const seen = new Map<string, string>();
    for (const m of movements) {
      if (m.agentId && m.agentName) seen.set(m.agentId, m.agentName);
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [movements]);

  const productOptions = useMemo(() => {
    if (!movements) return [];
    const seen = new Map<string, string>();
    for (const m of movements) seen.set(m.productId, m.productName);
    return Array.from(seen.entries())
      .map(([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [movements]);

  const batchOptions = useMemo(() => {
    if (!movements) return [];
    const seen = new Map<string, string>();
    for (const m of movements) {
      if (selectedProducts.size > 0 && !selectedProducts.has(m.productId)) continue;
      seen.set(m.batchId, m.batchCode);
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [movements, selectedProducts]);

  function handleProductsChange(next: Set<string>) {
    setSelectedProducts(next);
    if (next.size === 0 || !movements) return;
    const validBatchIds = new Set<string>();
    for (const m of movements) {
      if (next.has(m.productId)) validBatchIds.add(m.batchId);
    }
    setSelectedBatches((prev) => {
      const pruned = new Set<string>();
      for (const id of prev) if (validBatchIds.has(id)) pruned.add(id);
      return pruned.size === prev.size ? prev : pruned;
    });
  }

  const filtered = useMemo(() => {
    if (!movements) return [];
    let result = movements;
    if (dateFrom) {
      const fromMs = new Date(dateFrom + "T00:00:00").getTime();
      result = result.filter((m) => m.movedAt >= fromMs);
    }
    if (dateTo) {
      const toMs = new Date(dateTo + "T23:59:59.999").getTime();
      result = result.filter((m) => m.movedAt <= toMs);
    }
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (m) =>
          (m.agentName ?? "").toLowerCase().includes(term) ||
          m.productName.toLowerCase().includes(term) ||
          (m.variantName ?? "").toLowerCase().includes(term) ||
          m.batchCode.toLowerCase().includes(term) ||
          (m.notes ?? "").toLowerCase().includes(term)
      );
    }
    if (selectedDirections.size > 0) {
      result = result.filter((m) => selectedDirections.has(m.direction));
    }
    if (selectedAgents.size > 0) {
      result = result.filter((m) => m.agentId && selectedAgents.has(m.agentId));
    }
    if (selectedProducts.size > 0) {
      result = result.filter((m) => selectedProducts.has(m.productId));
    }
    if (selectedBatches.size > 0) {
      result = result.filter((m) => selectedBatches.has(m.batchId));
    }
    if (selectedStockModels.size > 0) {
      result = result.filter(
        (m) => m.stockModel && selectedStockModels.has(m.stockModel)
      );
    }
    return result;
  }, [
    movements,
    search,
    dateFrom,
    dateTo,
    selectedDirections,
    selectedAgents,
    selectedProducts,
    selectedBatches,
    selectedStockModels,
  ]);

  const hasActiveFilters =
    search !== "" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    selectedDirections.size > 0 ||
    selectedAgents.size > 0 ||
    selectedProducts.size > 0 ||
    selectedBatches.size > 0 ||
    selectedStockModels.size > 0;

  const totals = useMemo(() => {
    let transferQty = 0;
    let returnQty = 0;
    for (const m of filtered) {
      if (m.direction === "transfer") transferQty += m.quantity;
      else returnQty += m.quantity;
    }
    return { transferQty, returnQty };
  }, [filtered]);

  if (movements === undefined) {
    return <div className="text-sm text-muted-foreground">Loading movements...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search agent, product, batch..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[180px] lg:w-[260px]"
        />
        <DateRangeFilter
          title="Date"
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
        <FacetedFilter
          title="Direction"
          options={directionOptions}
          selected={selectedDirections}
          onSelectionChange={setSelectedDirections}
        />
        <FacetedFilter
          title="Agent"
          options={agentOptions}
          selected={selectedAgents}
          onSelectionChange={setSelectedAgents}
        />
        <FacetedFilter
          title="Product"
          options={productOptions}
          selected={selectedProducts}
          onSelectionChange={handleProductsChange}
        />
        <FacetedFilter
          title="Batch"
          options={batchOptions}
          selected={selectedBatches}
          onSelectionChange={setSelectedBatches}
        />
        <FacetedFilter
          title="Stock model"
          options={stockModelOptions}
          selected={selectedStockModels}
          onSelectionChange={setSelectedStockModels}
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setSelectedDirections(new Set());
              setSelectedAgents(new Set());
              setSelectedProducts(new Set());
              setSelectedBatches(new Set());
              setSelectedStockModels(new Set());
            }}
            className="h-8"
          >
            Reset <XIcon className="ml-2 size-4" />
          </Button>
        )}
        <div className="flex w-full items-center gap-4 text-xs text-muted-foreground sm:ml-auto sm:w-auto">
          <span>
            Out:{" "}
            <span className="font-medium text-foreground">{totals.transferQty}</span>
          </span>
          <span>
            In:{" "}
            <span className="font-medium text-foreground">{totals.returnQty}</span>
          </span>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Date</TableHead>
              <TableHead>From → To</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Batch · Model</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {hasActiveFilters
                    ? "No movements match the current filters."
                    : "No stock movements recorded."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const fromName =
                  m.direction === "transfer" ? "HQ" : m.agentName ?? "Unknown";
                const toName =
                  m.direction === "transfer" ? m.agentName ?? "Unknown" : "HQ";
                return (
                  <TableRow key={m._id}>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {new Date(m.movedAt).toLocaleDateString("en-CA")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{fromName}</span>
                        <ArrowRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{toName}</span>
                        <Badge
                          variant="outline"
                          className={
                            m.direction === "transfer"
                              ? "text-blue-600 border-blue-300"
                              : "text-emerald-600 border-emerald-300"
                          }
                        >
                          {m.direction === "transfer" ? "Transfer" : "Return"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{m.productName}</span>
                        {m.variantName && (
                          <span className="text-xs text-muted-foreground">
                            {m.variantName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{m.batchCode}</span>
                        {m.stockModel && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {stockModelLabel[m.stockModel] ?? m.stockModel}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {m.quantity}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                      {m.notes || "—"}
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
