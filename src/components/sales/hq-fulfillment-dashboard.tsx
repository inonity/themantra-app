"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Fragment, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FacetedFilter } from "@/components/stock/faceted-filter";
import { ChevronDownIcon, ChevronRightIcon, XIcon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon } from "lucide-react";

type SortCol = "name" | "qty";
type SortDir = "asc" | "desc";

type DashboardItem = {
  saleId: Id<"sales">;
  lineItemIndex: number;
  productId: Id<"products">;
  productName: string;
  variantName?: string;
  quantity: number;
  fulfilledQuantity: number;
  fulfillmentSource: string;
  sellerId: Id<"users"> | undefined;
  sellerName: string;
  customerName: string;
  saleDate: number;
  stockModel: string;
  availableBatches: {
    batchId: Id<"batches">;
    batchCode: string;
    quantity: number;
  }[];
  category: "ready" | "awaiting_stock" | "future_release";
};

type SaleEntry = {
  saleId: Id<"sales">;
  lineItemIndex: number;
  customerName: string;
  quantity: number;
  fulfilledQuantity: number;
  fulfillmentSource: string;
  saleDate: number;
};

type ProductGroup = {
  productId: Id<"products">;
  productName: string;
  variantName?: string;
  totalNeeded: number;
  sales: SaleEntry[];
};

type AgentGroup = {
  sellerId: Id<"users">;
  sellerName: string;
  totalNeeded: number;
  products: ProductGroup[];
};

const SOURCE_STYLES: Record<string, string> = {
  hq_transfer: "text-orange-600 border-orange-300",
  hq_direct: "text-blue-600 border-blue-300",
  pending_batch: "text-yellow-600 border-yellow-300",
  future_release: "text-purple-600 border-purple-300",
};

const SOURCE_LABELS: Record<string, string> = {
  agent_stock: "Agent Stock",
  hq_transfer: "Pending HQ Transfer",
  hq_direct: "Fulfilled by HQ",
  pending_batch: "No Batch",
  future_release: "Future Release",
};

function buildAgentGroups(items: DashboardItem[]): AgentGroup[] {
  const agentMap = new Map<string, AgentGroup>();

  for (const item of items) {
    if (!item.sellerId) continue;
    const agentKey = item.sellerId;

    if (!agentMap.has(agentKey)) {
      agentMap.set(agentKey, {
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        totalNeeded: 0,
        products: [],
      });
    }
    const agent = agentMap.get(agentKey)!;

    let productGroup = agent.products.find(
      (p) => p.productId === item.productId && p.variantName === item.variantName
    );
    if (!productGroup) {
      productGroup = {
        productId: item.productId,
        productName: item.productName,
        variantName: item.variantName,
        totalNeeded: 0,
        sales: [],
      };
      agent.products.push(productGroup);
    }

    const remaining = item.quantity - item.fulfilledQuantity;
    productGroup.totalNeeded += remaining;
    agent.totalNeeded += remaining;
    productGroup.sales.push({
      saleId: item.saleId,
      lineItemIndex: item.lineItemIndex,
      customerName: item.customerName,
      quantity: item.quantity,
      fulfilledQuantity: item.fulfilledQuantity,
      fulfillmentSource: item.fulfillmentSource,
      saleDate: item.saleDate,
    });
  }

  const groups = [...agentMap.values()].sort((a, b) =>
    a.sellerName.localeCompare(b.sellerName)
  );
  for (const agent of groups) {
    agent.products.sort((a, b) => a.productName.localeCompare(b.productName));
    for (const product of agent.products) {
      product.sales.sort((a, b) => b.saleDate - a.saleDate);
    }
  }
  return groups;
}

function SummaryCards({ items }: { items: DashboardItem[] }) {
  const ready = items.filter((i) => i.category === "ready").length;
  const awaiting = items.filter((i) => i.category === "awaiting_stock").length;
  const future = items.filter((i) => i.category === "future_release").length;
  const total = items.length;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Pending
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold">{total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-green-600">
            HQ Stock Available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold text-green-600">{ready}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-yellow-600">
            Awaiting Stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold text-yellow-600">{awaiting}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-purple-600">
            Future Release
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold text-purple-600">{future}</div>
        </CardContent>
      </Card>
    </div>
  );
}

export function HqFulfillmentDashboard() {
  const dashboardItems = useQuery(api.sales.getPendingFulfillmentDashboard);

  const [search, setSearch] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set()
  );
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    new Set()
  );

  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set()
  );
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const agentOptions = useMemo(() => {
    if (!dashboardItems) return [];
    const seen = new Map<string, string>();
    for (const item of dashboardItems) {
      if (item.sellerId && !seen.has(item.sellerId)) {
        seen.set(item.sellerId, item.sellerName);
      }
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [dashboardItems]);

  const productOptions = useMemo(() => {
    if (!dashboardItems) return [];
    const seen = new Map<string, string>();
    for (const item of dashboardItems) {
      if (!seen.has(item.productId)) {
        seen.set(item.productId, item.productName);
      }
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [dashboardItems]);

  const sourceOptions = useMemo(() => {
    if (!dashboardItems) return [];
    const seen = new Set<string>();
    for (const item of dashboardItems) {
      seen.add(item.fulfillmentSource);
    }
    return Array.from(seen)
      .map((value) => ({ value, label: SOURCE_LABELS[value] ?? value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [dashboardItems]);

  const hasActiveFilters =
    search !== "" ||
    selectedAgents.size > 0 ||
    selectedProducts.size > 0 ||
    selectedSources.size > 0;

  function clearFilters() {
    setSearch("");
    setSelectedAgents(new Set());
    setSelectedProducts(new Set());
    setSelectedSources(new Set());
  }

  const filtered = useMemo(() => {
    if (!dashboardItems) return [];
    const term = search.toLowerCase();
    return dashboardItems.filter((item) => {
      if (
        term &&
        !item.sellerName.toLowerCase().includes(term) &&
        !item.productName.toLowerCase().includes(term) &&
        !(item.variantName ?? "").toLowerCase().includes(term) &&
        !item.customerName.toLowerCase().includes(term)
      )
        return false;
      if (selectedAgents.size > 0 && (!item.sellerId || !selectedAgents.has(item.sellerId)))
        return false;
      if (selectedProducts.size > 0 && !selectedProducts.has(item.productId))
        return false;
      if (selectedSources.size > 0 && !selectedSources.has(item.fulfillmentSource))
        return false;
      return true;
    });
  }, [dashboardItems, search, selectedAgents, selectedProducts, selectedSources]);

  const allGroups = useMemo(() => {
    const groups = buildAgentGroups(filtered);
    return [...groups].sort((a, b) => {
      const cmp = sortCol === "qty"
        ? a.totalNeeded - b.totalNeeded
        : a.sellerName.localeCompare(b.sellerName);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  function toggleAgent(agentId: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  function toggleProduct(key: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (dashboardItems === undefined) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <SummaryCards items={filtered} />

      {/* Toolbar */}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search agents, products, customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[200px] lg:w-[280px]"
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
          onSelectionChange={setSelectedProducts}
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
            onClick={clearFilters}
            className="h-8"
          >
            Reset
            <XIcon className="size-4" />
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[40px]" />
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort("name")}>
                  Agent
                  {sortCol === "name"
                    ? sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />
                    : <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort("qty")}>
                  Qty Needed
                  {sortCol === "qty"
                    ? sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />
                    : <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />}
                </Button>
              </TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Sale Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {hasActiveFilters
                    ? "No fulfillment items match the current filters."
                    : "No pending fulfillment items."}
                </TableCell>
              </TableRow>
            ) : (
              allGroups.map((agent) => {
                const isAgentExpanded = expandedAgents.has(agent.sellerId);
                return (
                  <Fragment key={agent.sellerId}>
                    {/* Agent row */}
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleAgent(agent.sellerId)}
                    >
                      <TableCell className="w-[40px]">
                        {isAgentExpanded ? (
                          <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {agent.sellerName}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {agent.totalNeeded}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                    </TableRow>

                    {isAgentExpanded &&
                      agent.products.map((product) => {
                        const productKey = `${agent.sellerId}_${product.productId}_${product.variantName ?? ""}`;
                        const isProductExpanded =
                          expandedProducts.has(productKey);
                        return (
                          <Fragment key={`${product.productId}_${product.variantName ?? ""}`}>
                            {/* Product row */}
                            <TableRow
                              className="bg-muted/30 cursor-pointer hover:bg-muted/50"
                              onClick={() => toggleProduct(productKey)}
                            >
                              <TableCell className="pl-6">
                                {isProductExpanded ? (
                                  <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell className="pl-8 text-sm font-medium">
                                {product.productName}
                                {product.variantName && (
                                  <span className="text-muted-foreground ml-1 font-normal">— {product.variantName}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm font-semibold">
                                {product.totalNeeded}
                              </TableCell>
                              <TableCell />
                              <TableCell />
                            </TableRow>

                            {isProductExpanded &&
                              product.sales.map((sale) => (
                                <TableRow
                                  key={`${sale.saleId}-${sale.lineItemIndex}`}
                                  className="bg-muted/15"
                                >
                                  <TableCell />
                                  <TableCell className="pl-14 text-sm text-muted-foreground">
                                    {sale.customerName}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {sale.quantity - sale.fulfilledQuantity}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={
                                        SOURCE_STYLES[
                                          sale.fulfillmentSource
                                        ] ?? ""
                                      }
                                    >
                                      {SOURCE_LABELS[sale.fulfillmentSource] ??
                                        sale.fulfillmentSource}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {new Date(
                                      sale.saleDate
                                    ).toLocaleDateString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
