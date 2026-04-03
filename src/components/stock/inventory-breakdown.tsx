"use client";

import { Fragment, useState, useMemo } from "react";
import { Doc, Id } from "../../../convex/_generated/dataModel";
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
import { ChevronDownIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { FacetedFilter, RangeFilter } from "./faceted-filter";

const stockModelLabels: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
  dropship: "Pre-sell", // legacy
};

type HolderGroup = {
  holderKey: string;
  label: string;
  total: number;
  byStockModel: Map<string, number>;
  entries: Doc<"inventory">[];
};

export function InventoryBreakdown({
  inventory,
  products,
  batches,
  agents,
}: {
  inventory: Doc<"inventory">[];
  products: Doc<"products">[];
  batches: Doc<"batches">[];
  agents: Doc<"users">[];
}) {
  const [expandedProducts, setExpandedProducts] = useState<Set<Id<"products">>>(
    new Set()
  );
  const [expandedHolders, setExpandedHolders] = useState<Set<string>>(
    new Set()
  );

  // Filter state
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedHolders, setSelectedHolders] = useState<Set<string>>(new Set());
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [selectedStockModels, setSelectedStockModels] = useState<Set<string>>(new Set());
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");

  const batchMap = useMemo(() => new Map(batches.map((b) => [b._id, b])), [batches]);
  const agentMap = useMemo(() => new Map(agents.map((a) => [a._id, a])), [agents]);

  const hasActiveFilters =
    search !== "" ||
    selectedProducts.size > 0 ||
    selectedHolders.size > 0 ||
    selectedBatches.size > 0 ||
    selectedStockModels.size > 0 ||
    minQty !== "" ||
    maxQty !== "";

  function clearFilters() {
    setSearch("");
    setSelectedProducts(new Set());
    setSelectedHolders(new Set());
    setSelectedBatches(new Set());
    setSelectedStockModels(new Set());
    setMinQty("");
    setMaxQty("");
  }

  // Build filter options
  const productOptions = useMemo(
    () =>
      products
        .filter((p) => p.status === "active" || p.status === "future_release")
        .map((p) => ({ label: p.name, value: p._id })),
    [products]
  );

  const holderOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [
      { label: "HQ", value: "business" },
    ];
    for (const a of agents) {
      opts.push({
        label: a.nickname || a.name || a.email || "Unnamed Agent",
        value: a._id,
      });
    }
    return opts;
  }, [agents]);

  const batchOptions = useMemo(() => {
    const ids = new Set(inventory.map((inv) => inv.batchId));
    return batches
      .filter((b) => ids.has(b._id))
      .map((b) => ({ label: b.batchCode, value: b._id }));
  }, [inventory, batches]);

  const stockModelOptions = useMemo(() => [
    { label: "Hold & Paid", value: "hold_paid" },
    { label: "Consignment", value: "consignment" },
  ], []);

  // Text search: find matching product IDs by name
  const searchMatchedProductIds = useMemo(() => {
    if (!search) return null; // null = no search active
    const term = search.toLowerCase();
    return new Set(
      products
        .filter((p) => p.name.toLowerCase().includes(term))
        .map((p) => p._id)
    );
  }, [search, products]);

  // Filter inventory records using faceted filters (not text search)
  const filteredInventory = useMemo(() => {
    let filtered = inventory;

    if (selectedProducts.size > 0) {
      filtered = filtered.filter((inv) => selectedProducts.has(inv.productId));
    }

    if (selectedHolders.size > 0) {
      filtered = filtered.filter((inv) => {
        if (inv.heldByType === "business") return selectedHolders.has("business");
        return inv.heldById ? selectedHolders.has(inv.heldById) : false;
      });
    }

    if (selectedBatches.size > 0) {
      filtered = filtered.filter((inv) => selectedBatches.has(inv.batchId));
    }

    if (selectedStockModels.size > 0) {
      filtered = filtered.filter((inv) =>
        inv.stockModel ? selectedStockModels.has(inv.stockModel) : false
      );
    }

    const parsedMin = minQty ? parseInt(minQty) : null;
    const parsedMax = maxQty ? parseInt(maxQty) : null;
    if (parsedMin !== null && !isNaN(parsedMin)) {
      filtered = filtered.filter((inv) => inv.quantity >= parsedMin);
    }
    if (parsedMax !== null && !isNaN(parsedMax)) {
      filtered = filtered.filter((inv) => inv.quantity <= parsedMax);
    }

    return filtered;
  }, [inventory, selectedProducts, selectedHolders, selectedBatches, selectedStockModels, minQty, maxQty]);

  // Group filtered inventory by product -> holder -> entries
  const productGroups = useMemo(() => {
    const groups = new Map<
      Id<"products">,
      {
        product: Doc<"products">;
        totalStock: number;
        holders: Map<string, HolderGroup>;
      }
    >();

    // When no faceted filters active, show all products (including zero-stock)
    const hasFacetedFilters =
      selectedProducts.size > 0 ||
      selectedHolders.size > 0 ||
      selectedBatches.size > 0 ||
      selectedStockModels.size > 0 ||
      minQty !== "" ||
      maxQty !== "";

    if (!hasFacetedFilters) {
      for (const product of products) {
        groups.set(product._id, {
          product,
          totalStock: 0,
          holders: new Map(),
        });
      }
    }

    for (const inv of filteredInventory) {
      let group = groups.get(inv.productId);
      if (!group) {
        const product = products.find((p) => p._id === inv.productId);
        if (!product) continue;
        group = { product, totalStock: 0, holders: new Map() };
        groups.set(inv.productId, group);
      }

      group.totalStock += inv.quantity;

      const holderKey =
        inv.heldByType === "business"
          ? "business"
          : `agent_${inv.heldById ?? "unknown"}`;

      let holder = group.holders.get(holderKey);
      if (!holder) {
        let label: string;
        if (inv.heldByType === "business") {
          label = "HQ";
        } else {
          const agent = inv.heldById ? agentMap.get(inv.heldById) : null;
          label = agent?.nickname || agent?.name || agent?.email || "Unknown";
        }
        holder = {
          holderKey,
          label,
          total: 0,
          byStockModel: new Map(),
          entries: [],
        };
        group.holders.set(holderKey, holder);
      }

      holder.total += inv.quantity;
      holder.entries.push(inv);

      if (inv.stockModel) {
        holder.byStockModel.set(
          inv.stockModel,
          (holder.byStockModel.get(inv.stockModel) ?? 0) + inv.quantity
        );
      }
    }

    return groups;
  }, [filteredInventory, products, selectedProducts, selectedHolders, selectedBatches, selectedStockModels, minQty, maxQty, agentMap]);

  // Apply text search on top of grouped results (filters product groups by name)
  const sortedGroups = useMemo(() => {
    let groups = Array.from(productGroups.values());

    // Text search: only show products whose name matches
    if (searchMatchedProductIds) {
      groups = groups.filter((g) => searchMatchedProductIds.has(g.product._id));
    }

    return groups.sort((a, b) => {
      if (a.totalStock > 0 && b.totalStock === 0) return -1;
      if (a.totalStock === 0 && b.totalStock > 0) return 1;
      return a.product.name.localeCompare(b.product.name);
    });
  }, [productGroups, searchMatchedProductIds]);

  function toggleProduct(productId: Id<"products">) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  function toggleHolder(compositeKey: string) {
    setExpandedHolders((prev) => {
      const next = new Set(prev);
      if (next.has(compositeKey)) {
        next.delete(compositeKey);
      } else {
        next.add(compositeKey);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="Filter products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[150px] lg:w-[250px]"
          />
          <FacetedFilter
            title="Product"
            options={productOptions}
            selected={selectedProducts}
            onSelectionChange={setSelectedProducts}
          />
          <FacetedFilter
            title="Batch"
            options={batchOptions}
            selected={selectedBatches}
            onSelectionChange={setSelectedBatches}
          />
          <FacetedFilter
            title="Holder"
            options={holderOptions}
            selected={selectedHolders}
            onSelectionChange={setSelectedHolders}
          />
          <FacetedFilter
            title="Stock Model"
            options={stockModelOptions}
            selected={selectedStockModels}
            onSelectionChange={setSelectedStockModels}
          />
          <RangeFilter
            title="Amount"
            min={minQty}
            max={maxQty}
            onMinChange={setMinQty}
            onMaxChange={setMaxQty}
          />
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8"
            >
              Reset
              <XIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {sortedGroups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {hasActiveFilters
            ? "No inventory matches the current filters."
            : "No inventory records yet. Create batches and transfer stock to agents."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Total Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedGroups.map(({ product, totalStock, holders }) => {
              const isExpanded = expandedProducts.has(product._id);
              const hasStock = totalStock > 0;

              const sortedHolders = Array.from(holders.values()).sort((a, b) => {
                if (a.holderKey === "business") return -1;
                if (b.holderKey === "business") return 1;
                return b.total - a.total;
              });

              return (
                <Fragment key={product._id}>
                  <TableRow
                    className={hasStock ? "cursor-pointer hover:bg-muted/50" : ""}
                    onClick={() => hasStock && toggleProduct(product._id)}
                  >
                    <TableCell className="w-[40px]">
                      {hasStock &&
                        (isExpanded ? (
                          <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                        ))}
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>
                      <span
                        className={
                          totalStock === 0
                            ? "text-muted-foreground"
                            : "font-semibold"
                        }
                      >
                        {totalStock}
                      </span>
                    </TableCell>
                  </TableRow>

                  {isExpanded &&
                    sortedHolders.map((holder) => {
                      const holderCompositeKey = `${product._id}_${holder.holderKey}`;
                      const isHolderExpanded =
                        expandedHolders.has(holderCompositeKey);
                      const hasMultipleEntries = holder.entries.length > 1;

                      return (
                        <Fragment key={holder.holderKey}>
                          <TableRow
                            className={
                              hasMultipleEntries
                                ? "bg-muted/30 cursor-pointer hover:bg-muted/50"
                                : "bg-muted/30"
                            }
                            onClick={() =>
                              hasMultipleEntries &&
                              toggleHolder(holderCompositeKey)
                            }
                          >
                            <TableCell className="pl-6">
                              {hasMultipleEntries &&
                                (isHolderExpanded ? (
                                  <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                ))}
                            </TableCell>
                            <TableCell className="pl-8 text-sm">
                              <span className="font-medium">{holder.label}</span>
                              {holder.byStockModel.size > 0 && (
                                <span className="ml-3 inline-flex gap-2">
                                  {Array.from(holder.byStockModel.entries()).map(
                                    ([model]) => (
                                      <Badge
                                        key={model}
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {stockModelLabels[model] ?? model}
                                      </Badge>
                                    )
                                  )}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm font-semibold">
                              {holder.total}
                            </TableCell>
                          </TableRow>

                          {isHolderExpanded &&
                            holder.entries.map((inv) => {
                              const batch = batchMap.get(inv.batchId);
                              return (
                                <TableRow
                                  key={inv._id}
                                  className="bg-muted/15"
                                >
                                  <TableCell></TableCell>
                                  <TableCell className="pl-14 text-xs text-muted-foreground">
                                    <span>Batch:</span>{" "}
                                    <span className="font-medium text-foreground">
                                      {batch?.batchCode ?? "Unknown"}
                                    </span>
                                    {inv.stockModel && (
                                      <Badge
                                        variant="outline"
                                        className="ml-2 text-xs"
                                      >
                                        {stockModelLabels[inv.stockModel] ??
                                          inv.stockModel}
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {inv.quantity}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
