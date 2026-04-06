"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FulfillSaleDialog } from "@/components/sales/fulfill-sale-dialog";
import { useCurrentUser } from "@/hooks/useStoreUserEffect";
import { PlusIcon, XIcon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon } from "lucide-react";
import { useState, useMemo } from "react";
import { FacetedFilter } from "@/components/stock/faceted-filter";

const SOURCE_LABELS: Record<string, string> = {
  agent_stock: "In Stock",
  hq_transfer: "Pending HQ Transfer",
  hq_direct: "Fulfilled by HQ",
  pending_batch: "Pending Batch",
  future_release: "Future Release",
};

const SOURCE_STYLES: Record<string, string> = {
  agent_stock: "bg-green-100 text-green-700",
  hq_transfer: "text-orange-600 border-orange-300",
  hq_direct: "text-blue-600 border-blue-300",
  pending_batch: "text-yellow-600 border-yellow-300",
  future_release: "text-purple-600 border-purple-300",
};

function RequestStockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const products = useQuery(api.products.listSellable) ?? [];
  const createRequest = useMutation(api.stockRequests.create);
  const [productId, setProductId] = useState<string>("");
  const [variantId, setVariantId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const variants = useQuery(
    api.productVariants.listActiveByProduct,
    productId ? { productId: productId as Id<"products"> } : "skip"
  ) ?? [];

  const selectedProduct = products.find((p) => p._id === productId);
  const selectedVariant = variants.find((v) => v._id === variantId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !quantity) return;
    setSubmitting(true);
    try {
      await createRequest({
        productId: productId as Id<"products">,
        variantId: variantId ? (variantId as Id<"productVariants">) : undefined,
        quantity: parseInt(quantity),
        notes: notes || undefined,
      });
      setProductId("");
      setVariantId("");
      setQuantity("");
      setNotes("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Stock from HQ</DialogTitle>
          <DialogDescription>
            Request products to be transferred to your inventory. HQ will review
            and transfer stock to you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <Select
              value={productId}
              onValueChange={(v) => {
                if (v) { setProductId(v); setVariantId(""); }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product...">
                  {selectedProduct
                    ? `${selectedProduct.name}${selectedProduct.status === "future_release" ? " (Future Release)" : ""}`
                    : "Select product..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                    {p.status === "future_release" ? " (Future Release)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {productId && variants.length > 0 && (
            <div className="space-y-2">
              <Label>Variant</Label>
              <Select
                value={variantId}
                onValueChange={(v) => { if (v) setVariantId(v); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select variant...">
                    {selectedVariant ? selectedVariant.name : "Select variant..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {variants.map((v) => (
                    <SelectItem key={v._id} value={v._id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="reqQty">Quantity</Label>
            <Input
              id="reqQty"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 10"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reqNotes">Notes (optional)</Label>
            <Textarea
              id="reqNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for HQ..."
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={!productId || !quantity || submitting}>
              {submitting ? "Requesting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingSalesSection({
  sales,
  products,
  userRole,
}: {
  sales: Doc<"sales">[];
  products: Map<Id<"products">, Doc<"products">>;
  userRole?: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<"customer" | "date">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: "customer" | "date") {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const sourceOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const sale of sales) {
      for (const li of sale.lineItems ?? []) {
        if ((li.fulfilledQuantity ?? 0) < li.quantity) {
          seen.add(li.fulfillmentSource ?? "pending_batch");
        }
      }
    }
    return Array.from(seen)
      .map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sales]);

  const hasActiveFilters = search !== "" || selectedSources.size > 0;

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return sales.filter((sale) => {
      if (term) {
        const customerMatch = (sale.customerDetail?.name ?? "").toLowerCase().includes(term);
        const productMatch = (sale.lineItems ?? []).some((li) => {
          const product = products.get(li.productId);
          return (
            (product?.name ?? "").toLowerCase().includes(term) ||
            (li.variantName ?? "").toLowerCase().includes(term)
          );
        });
        if (!customerMatch && !productMatch) return false;
      }
      if (selectedSources.size > 0) {
        const hasMatch = (sale.lineItems ?? []).some((li) => {
          const remaining = li.quantity - (li.fulfilledQuantity ?? 0);
          if (remaining <= 0) return false;
          return selectedSources.has(li.fulfillmentSource ?? "pending_batch");
        });
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [sales, products, search, selectedSources]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const cmp =
        sortCol === "customer"
          ? (a.customerDetail?.name ?? "").localeCompare(b.customerDetail?.name ?? "")
          : a.saleDate - b.saleDate;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search customers or products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[200px] lg:w-[280px]"
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
            onClick={() => { setSearch(""); setSelectedSources(new Set()); }}
            className="h-8"
          >
            Reset
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort("customer")}>
                  Customer
                  {sortCol === "customer"
                    ? sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />
                    : <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />}
                </Button>
              </TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort("date")}>
                  Sale Date
                  {sortCol === "date"
                    ? sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />
                    : <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />}
                </Button>
              </TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {hasActiveFilters
                    ? "No sales match the current filters."
                    : "No pending fulfillment. All sales are fulfilled."}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((sale) => {
                const pendingCount = (sale.lineItems ?? []).filter(
                  (li) => (li.fulfilledQuantity ?? 0) < li.quantity
                ).length;
                const totalItems = (sale.lineItems ?? []).length;

                return (
                  <TableRow key={sale._id}>
                    <TableCell className="font-medium">
                      {sale.customerDetail?.name ?? "Unknown"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {(sale.lineItems ?? []).map((li, i) => {
                          const fulfilled = li.fulfilledQuantity ?? 0;
                          const remaining = li.quantity - fulfilled;
                          const product = products.get(li.productId);
                          const source = li.fulfillmentSource ?? "pending_batch";
                          const isDone = remaining <= 0;

                          return (
                            <div
                              key={i}
                              className={`flex items-center gap-2 text-sm ${isDone ? "opacity-40 line-through" : ""}`}
                            >
                              <span>
                                {product?.name ?? "Unknown"}
                                {li.variantName && (
                                  <span className="text-muted-foreground ml-1">
                                    ({li.variantName})
                                  </span>
                                )}
                              </span>
                              <span className="text-muted-foreground">
                                x{isDone ? fulfilled : remaining}
                              </span>
                              {!isDone && (
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${SOURCE_STYLES[source] ?? ""}`}
                                >
                                  {SOURCE_LABELS[source] ?? source}
                                </Badge>
                              )}
                              {isDone && li.fulfilledAt && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(li.fulfilledAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          sale.fulfillmentStatus === "partial"
                            ? "text-blue-600 border-blue-300"
                            : "text-yellow-600 border-yellow-300"
                        }
                      >
                        {pendingCount}/{totalItems} pending
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(sale.saleDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <FulfillSaleDialog
                        sale={sale}
                        products={products}
                        userRole={userRole}
                        trigger={
                          <Button size="sm" variant="outline">
                            Fulfill
                          </Button>
                        }
                      />
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

type SortColReq = "product" | "qty" | "date";
type SortColPast = "product" | "qty" | "status" | "date";

function SortIcon({ col, active, dir }: { col: string; active: string; dir: "asc" | "desc" }) {
  if (col !== active) return <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />;
  return dir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />;
}

function StockRequestsSection() {
  const requests = useQuery(api.stockRequests.listMy, {}) ?? [];
  const products = useQuery(api.products.list) ?? [];
  const allVariants = useQuery(api.productVariants.listAll) ?? [];
  const cancelRequest = useMutation(api.stockRequests.cancel);

  const productMap = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);
  const variantMap = useMemo(() => new Map(allVariants.map((v) => [v._id, v])), [allVariants]);
  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const past = useMemo(() => requests.filter((r) => r.status !== "pending"), [requests]);

  // Pending table state
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingSortCol, setPendingSortCol] = useState<SortColReq>("date");
  const [pendingSortDir, setPendingSortDir] = useState<"asc" | "desc">("desc");

  // Past table state
  const [pastSearch, setPastSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [pastSortCol, setPastSortCol] = useState<SortColPast>("date");
  const [pastSortDir, setPastSortDir] = useState<"asc" | "desc">("desc");

  function handlePendingSort(col: SortColReq) {
    if (pendingSortCol === col) setPendingSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setPendingSortCol(col); setPendingSortDir("asc"); }
  }

  function handlePastSort(col: SortColPast) {
    if (pastSortCol === col) setPastSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setPastSortCol(col); setPastSortDir("asc"); }
  }

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of past) seen.add(r.status);
    return Array.from(seen)
      .map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [past]);

  const filteredPending = useMemo(() => {
    const term = pendingSearch.toLowerCase();
    const sorted = [...pending].sort((a, b) => {
      let cmp = 0;
      if (pendingSortCol === "product") {
        cmp = (productMap.get(a.productId)?.name ?? "").localeCompare(productMap.get(b.productId)?.name ?? "");
      } else if (pendingSortCol === "qty") {
        cmp = a.quantity - b.quantity;
      } else {
        cmp = a.createdAt - b.createdAt;
      }
      return pendingSortDir === "asc" ? cmp : -cmp;
    });
    if (!term) return sorted;
    return sorted.filter((r) =>
      (productMap.get(r.productId)?.name ?? "").toLowerCase().includes(term) ||
      (r.variantId ? (variantMap.get(r.variantId)?.name ?? "") : "").toLowerCase().includes(term)
    );
  }, [pending, pendingSearch, pendingSortCol, pendingSortDir, productMap, variantMap]);

  const filteredPast = useMemo(() => {
    const term = pastSearch.toLowerCase();
    const result = past.filter((r) => {
      if (term) {
        const nameMatch = (productMap.get(r.productId)?.name ?? "").toLowerCase().includes(term) ||
          (r.variantId ? (variantMap.get(r.variantId)?.name ?? "") : "").toLowerCase().includes(term);
        if (!nameMatch) return false;
      }
      if (selectedStatuses.size > 0 && !selectedStatuses.has(r.status)) return false;
      return true;
    });
    return result.sort((a, b) => {
      let cmp = 0;
      if (pastSortCol === "product") {
        cmp = (productMap.get(a.productId)?.name ?? "").localeCompare(productMap.get(b.productId)?.name ?? "");
      } else if (pastSortCol === "qty") {
        cmp = a.quantity - b.quantity;
      } else if (pastSortCol === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = a.createdAt - b.createdAt;
      }
      return pastSortDir === "asc" ? cmp : -cmp;
    });
  }, [past, pastSearch, selectedStatuses, pastSortCol, pastSortDir, productMap, variantMap]);

  const hasPendingFilters = pendingSearch !== "";
  const hasPastFilters = pastSearch !== "" || selectedStatuses.size > 0;

  return (
    <div className="space-y-6">
      {/* Pending requests */}
      <div className="space-y-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="Search products..."
            value={pendingSearch}
            onChange={(e) => setPendingSearch(e.target.value)}
            className="h-8 w-[200px] lg:w-[280px]"
          />
          {hasPendingFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPendingSearch("")}
              className="h-8"
            >
              Reset
              <XIcon className="size-4" />
            </Button>
          )}
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>
                  <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handlePendingSort("product")}>
                    Product
                    <SortIcon col="product" active={pendingSortCol} dir={pendingSortDir} />
                  </Button>
                </TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handlePendingSort("qty")}>
                    Quantity
                    <SortIcon col="qty" active={pendingSortCol} dir={pendingSortDir} />
                  </Button>
                </TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handlePendingSort("date")}>
                    Requested
                    <SortIcon col="date" active={pendingSortCol} dir={pendingSortDir} />
                  </Button>
                </TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPending.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {hasPendingFilters
                      ? "No requests match the current search."
                      : "No pending stock requests."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPending.map((req) => (
                  <TableRow key={req._id}>
                    <TableCell className="font-medium">
                      {productMap.get(req.productId)?.name ?? "Unknown"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {req.variantId ? (variantMap.get(req.variantId)?.name ?? "—") : "—"}
                    </TableCell>
                    <TableCell>{req.quantity}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {req.notes || "—"}
                    </TableCell>
                    <TableCell>
                      {new Date(req.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelRequest({ requestId: req._id })}
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Past requests */}
      {(past.length > 0 || hasPastFilters) && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Past Requests</h3>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              placeholder="Search products..."
              value={pastSearch}
              onChange={(e) => setPastSearch(e.target.value)}
              className="h-8 w-[200px] lg:w-[280px]"
            />
            <FacetedFilter
              title="Status"
              options={statusOptions}
              selected={selectedStatuses}
              onSelectionChange={setSelectedStatuses}
            />
            {hasPastFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setPastSearch(""); setSelectedStatuses(new Set()); }}
                className="h-8"
              >
                Reset
                <XIcon className="size-4" />
              </Button>
            )}
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handlePastSort("product")}>
                      Product
                      <SortIcon col="product" active={pastSortCol} dir={pastSortDir} />
                    </Button>
                  </TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handlePastSort("qty")}>
                      Quantity
                      <SortIcon col="qty" active={pastSortCol} dir={pastSortDir} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handlePastSort("status")}>
                      Status
                      <SortIcon col="status" active={pastSortCol} dir={pastSortDir} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handlePastSort("date")}>
                      Date
                      <SortIcon col="date" active={pastSortCol} dir={pastSortDir} />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPast.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No past requests match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPast.map((req) => (
                    <TableRow key={req._id}>
                      <TableCell>
                        {productMap.get(req.productId)?.name ?? "Unknown"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {req.variantId ? (variantMap.get(req.variantId)?.name ?? "—") : "—"}
                      </TableCell>
                      <TableCell>{req.quantity}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            req.status === "fulfilled"
                              ? "text-green-600 border-green-300"
                              : "text-muted-foreground"
                          }
                        >
                          {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(req.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyFulfillmentPage() {
  const user = useCurrentUser();
  const pendingSales = useQuery(api.sales.listMyPendingFulfillment) ?? [];
  const productsList = useQuery(api.products.list) ?? [];
  const [requestOpen, setRequestOpen] = useState(false);

  const productMap = new Map(
    productsList.map((p) => [p._id, p] as [Id<"products">, Doc<"products">])
  );

  // Summary counts
  const totalPendingItems = pendingSales.reduce((sum, sale) => {
    return (
      sum +
      (sale.lineItems ?? []).filter(
        (li) => (li.fulfilledQuantity ?? 0) < li.quantity
      ).length
    );
  }, 0);

  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Fulfillment
            </h1>
            <p className="text-muted-foreground">
              Fulfill pending sales from your inventory and request stock from
              HQ.
            </p>
          </div>
          <Button className="w-full sm:w-auto" onClick={() => setRequestOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Request Stock
          </Button>
        </div>

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold mb-2">{pendingSales.length}</div>
              <p className="text-xs text-muted-foreground">
                {totalPendingItems} item{totalPendingItems !== 1 ? "s" : ""}{" "}
                awaiting fulfillment
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Stock Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold mb-2">
                <StockRequestCount />
              </div>
              <p className="text-xs text-muted-foreground">
                pending requests to HQ
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Sales */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Pending Sales</h2>
          <PendingSalesSection sales={pendingSales} products={productMap} userRole={user?.role} />
        </div>

        {/* Stock Requests */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Stock Requests</h2>
          <StockRequestsSection />
        </div>

        <RequestStockDialog open={requestOpen} onOpenChange={setRequestOpen} />
      </div>
    </RoleGuard>
  );
}

function StockRequestCount() {
  const requests = useQuery(api.stockRequests.listMy, { status: "pending" });
  return <>{requests?.length ?? 0}</>;
}
