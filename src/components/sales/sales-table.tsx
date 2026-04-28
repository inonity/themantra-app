"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, ChevronRightIcon, ReceiptIcon, ImageIcon, XIcon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon, PencilIcon, BanknoteIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FacetedFilter, DateRangeFilter } from "@/components/stock/faceted-filter";
import { EditSaleDialog } from "./edit-sale-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";

const PAYMENT_LABELS: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};

const CHANNEL_LABELS: Record<string, string> = {
  direct: "Direct",
  agent: "Agent",
  tiktok: "TikTok",
  shopee: "Shopee",
  other: "Other",
  internal: "Internal",
};

function PaymentBadge({ status }: { status: Doc<"sales">["paymentStatus"] }) {
  const variant =
    status === "paid" ? "default" :
    status === "partial" ? "secondary" :
    "outline";
  return <Badge variant={variant}>{PAYMENT_LABELS[status] ?? status}</Badge>;
}

function FulfillmentBadge({ status }: { status?: string }) {
  if (!status || status === "fulfilled") return null;
  if (status === "partial") {
    return (
      <Badge variant="outline" className="text-blue-600 border-blue-300">
        Partial
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-orange-600 border-orange-300">
      Pending Stock
    </Badge>
  );
}

const SOURCE_BADGE_STYLES: Record<string, string> = {
  agent_stock: "text-green-600 border-green-300",
  hq_transfer: "text-orange-600 border-orange-300",
  hq_direct: "text-blue-600 border-blue-300",
  pending_batch: "text-yellow-600 border-yellow-300",
  future_release: "text-purple-600 border-purple-300",
};

const SOURCE_LABELS: Record<string, string> = {
  agent_stock: "Fulfilled",
  hq_transfer: "Pending HQ Transfer",
  hq_direct: "Fulfilled by HQ",
  pending_batch: "Pending Batch",
  future_release: "Future Release",
};

// Check if a product is eligible for an offer
function isEligibleForOffer(
  productId: Id<"products">,
  product: Doc<"products"> | undefined,
  offer: Doc<"offers">
): boolean {
  if (offer.productId) return productId === offer.productId;
  if (offer.productIds && offer.productIds.length > 0) return offer.productIds.includes(productId);
  if (offer.collection) return product?.collection === offer.collection;
  return true; // no targeting = all products eligible
}

interface BundleGroup {
  originalPrice: number;
  bundlePrice: number;
  itemIndices: Set<number>; // which item indices have units in this bundle
}

// Minimal offer shape for bundle grouping (works with both live offers and snapshots)
interface OfferLike {
  name: string;
  minQuantity: number;
  bundlePrice: number;
  sizeMl?: number;
  // Only needed for live offers (backward compat) — snapshots treat all items as eligible
  productId?: Id<"products">;
  productIds?: Id<"products">[];
  collection?: string;
}

// Group items by stored inBundle flag — items with inBundle=true go into bundles, rest outside.
// Falls back to legacy computation for old sales without the flag.
function computeOfferGrouping(
  items: { productId: Id<"products">; quantity: number; productPrice?: number; inBundle?: boolean; variantSizeMl?: number }[],
  offer: OfferLike | null | undefined,
  products: Map<Id<"products">, Doc<"products">>,
  useSnapshotPrices = false,
) {
  const allIndices = items.map((_, i) => i);
  const empty = { bundles: [] as BundleGroup[], nonBundledIndices: allIndices };
  if (!offer) return empty;

  // Returns false if the item's variant sizeMl doesn't match the offer's sizeMl requirement
  const matchesSizeMl = (item: typeof items[number]) => {
    if (offer.sizeMl == null) return true; // no size filter on offer
    if (item.variantSizeMl == null) return true; // unknown size — don't exclude
    return item.variantSizeMl === offer.sizeMl;
  };

  // Check if any item has the inBundle flag — if so, use stored grouping
  const hasInBundleFlag = items.some((item) => item.inBundle != null);

  if (hasInBundleFlag) {
    // Items tagged inBundle go into bundles — but also enforce sizeMl to correct
    // any flags that were wrongly set before the sizeMl filter was applied.
    const bundledIndices = items
      .map((item, i) => (item.inBundle && matchesSizeMl(item) ? i : -1))
      .filter((i) => i >= 0);
    const nonBundledIndices = items
      .map((item, i) => (!item.inBundle || !matchesSizeMl(item) ? i : -1))
      .filter((i) => i >= 0);

    const bundledQty = bundledIndices.reduce((sum, idx) => sum + items[idx].quantity, 0);
    const bundleCount = Math.floor(bundledQty / offer.minQuantity);

    const bundles: BundleGroup[] = [];
    for (let b = 0; b < bundleCount; b++) {
      const start = b * offer.minQuantity;
      const end = start + offer.minQuantity;
      // Expand bundled items into units and slice per bundle
      const expandedUnits: number[] = [];
      for (const idx of bundledIndices) {
        for (let u = 0; u < items[idx].quantity; u++) {
          expandedUnits.push(idx);
        }
      }
      const bundleUnits = expandedUnits.slice(start, end);
      const itemIndices = new Set(bundleUnits);
      let originalPrice = 0;
      for (const idx of bundleUnits) {
        originalPrice += items[idx].productPrice ?? products.get(items[idx].productId)?.price ?? 0;
      }
      bundles.push({ originalPrice, bundlePrice: offer.bundlePrice, itemIndices });
    }

    return { bundles, nonBundledIndices };
  }

  // Legacy fallback: compute grouping from eligibility (for old sales without inBundle)
  const eligibleIndices: number[] = [];
  let eligibleQty = 0;
  for (let i = 0; i < items.length; i++) {
    let eligible: boolean;
    if (useSnapshotPrices) {
      eligible = true;
    } else {
      const product = products.get(items[i].productId);
      eligible = isEligibleForOffer(items[i].productId, product, offer as Doc<"offers">);
    }
    // Also apply sizeMl filter regardless of path
    if (eligible && !matchesSizeMl(items[i])) eligible = false;
    if (eligible) {
      eligibleIndices.push(i);
      eligibleQty += items[i].quantity;
    }
  }

  const bundleCount = Math.floor(eligibleQty / offer.minQuantity);
  if (bundleCount === 0) return empty;

  // Expand eligible units and assign to bundles
  const expanded: number[] = [];
  for (const idx of eligibleIndices) {
    for (let u = 0; u < items[idx].quantity; u++) {
      expanded.push(idx);
    }
  }

  const bundledUnitCount = bundleCount * offer.minQuantity;
  const bundles: BundleGroup[] = [];
  for (let b = 0; b < bundleCount; b++) {
    const start = b * offer.minQuantity;
    const end = start + offer.minQuantity;
    const bundleUnits = expanded.slice(start, end);
    const itemIndices = new Set(bundleUnits);
    let originalPrice = 0;
    for (const idx of bundleUnits) {
      originalPrice += items[idx].productPrice ?? products.get(items[idx].productId)?.price ?? 0;
    }
    bundles.push({ originalPrice, bundlePrice: offer.bundlePrice, itemIndices });
  }

  // Non-bundled: items not in any bundle
  const bundledSet = new Set(expanded.slice(0, bundledUnitCount));
  const nonBundledIndices: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (!bundledSet.has(i)) nonBundledIndices.push(i);
  }

  return { bundles, nonBundledIndices };
}

function SaleLineItems({
  saleId,
  sale,
  products,
  batches,
  showAgent,
  offer,
}: {
  saleId: Id<"sales">;
  sale: Doc<"sales">;
  products: Map<Id<"products">, Doc<"products">>;
  batches: Map<Id<"batches">, Doc<"batches">>;
  showAgent: boolean;
  offer?: Doc<"offers"> | null;
}) {
  const data = useQuery(api.sales.getWithLineItems, { saleId });
  const allVariants = useQuery(api.productVariants.listAll);
  const variantSizeMap = new Map(
    (allVariants ?? []).filter((v) => v.sizeMl != null).map((v) => [v._id, v.sizeMl!])
  );
  const totalCols = showAgent ? 9 : 8;

  // Use snapshotted offer if available, fall back to live offer for old sales
  const effectiveOffer: OfferLike | null | undefined = sale.offerSnapshot ?? offer;
  const hasSnapshots = !!sale.offerSnapshot || sale.lineItems?.some((li) => li.productName);

  // Render one offer bundle header row
  function renderBundleHeader(bundle: BundleGroup, bundleIdx: number) {
    if (!effectiveOffer) return null;
    return (
      <TableRow key={`bundle-${bundleIdx}`} className="bg-muted/30 hover:bg-muted/50">
        <TableCell />
        <TableCell />
        <TableCell
          colSpan={totalCols - 4}
          className="text-sm font-semibold"
        >
          {effectiveOffer.name}
          <span className="font-normal text-muted-foreground ml-2">
            {effectiveOffer.minQuantity} for RM{effectiveOffer.bundlePrice.toFixed(2)}
          </span>
        </TableCell>
        <TableCell className="text-right text-sm font-semibold whitespace-nowrap">
          <span className="text-muted-foreground line-through mr-2">
            RM{bundle.originalPrice.toFixed(2)}
          </span>
          RM{bundle.bundlePrice.toFixed(2)}
        </TableCell>
        <TableCell />
      </TableRow>
    );
  }

  // For pending_stock or partial sales, show enriched lineItems from sale document
  if (
    (sale.fulfillmentStatus === "pending_stock" || sale.fulfillmentStatus === "partial") &&
    sale.lineItems
  ) {
    const items = sale.lineItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      productPrice: item.productPrice,
      inBundle: item.inBundle,
      variantSizeMl: item.variantId ? variantSizeMap.get(item.variantId) : undefined,
    }));
    const { bundles, nonBundledIndices } = computeOfferGrouping(items, effectiveOffer, products, hasSnapshots);

    const renderPendingItem = (item: typeof sale.lineItems[number], i: number, indented: boolean) => {
      const product = products.get(item.productId);
      // Use snapshotted name/price, fall back to live product data
      const itemName = item.productName ?? product?.name ?? "Unknown";
      const variantName = item.variantName;
      const itemPrice = item.productPrice ?? product?.price ?? 0;
      const qty = item.quantity;
      const fulfilled = item.fulfilledQuantity ?? 0;
      const source = item.fulfillmentSource ?? "pending_batch";
      const isDone = fulfilled >= item.quantity;
      const batch = item.batchId ? batches.get(item.batchId) : null;
      const badgeStyle = SOURCE_BADGE_STYLES[source] ?? "";
      return (
        <TableRow
          key={`pending-${indented ? "bundled" : "rest"}-${i}`}
          className={`bg-muted/30 hover:bg-muted/50 ${isDone ? "opacity-60" : ""}`}
        >
          <TableCell />
          <TableCell />
          <TableCell
            colSpan={showAgent ? 2 : 1}
            className={`text-sm ${indented ? "pl-8" : ""}`}
          >
            <span className="font-medium">
              {itemName}
            </span>
            {variantName && (
              <span className="text-muted-foreground ml-1 text-xs">— {variantName}</span>
            )}
            <span className="text-muted-foreground">
              {" "}— {batch ? `Batch ${batch.batchCode}` : "Batch TBD"}
            </span>
            {" "}
            <Badge variant="outline" className={`text-xs ${badgeStyle}`}>
              {isDone ? "Fulfilled" : (SOURCE_LABELS[source] ?? source)}
            </Badge>
          </TableCell>
          <TableCell className="text-sm">
            x{qty}
            {fulfilled > 0 && fulfilled < item.quantity && (
              <span className="text-muted-foreground">
                {" "}({fulfilled} done)
              </span>
            )}
          </TableCell>
          <TableCell />
          <TableCell />
          <TableCell className="text-right text-sm">
            {!indented ? `RM${(itemPrice * qty).toFixed(2)}` : ""}
          </TableCell>
        </TableRow>
      );
    };

    return (
      <>
        {bundles.map((bundle, bIdx) => (
          <Fragment key={`bundle-group-${bIdx}`}>
            {renderBundleHeader(bundle, bIdx)}
            {[...bundle.itemIndices].map((itemIdx) =>
              renderPendingItem(sale.lineItems![itemIdx], itemIdx, true)
            )}
          </Fragment>
        ))}
        {nonBundledIndices.map((itemIdx) =>
          renderPendingItem(sale.lineItems![itemIdx], itemIdx, false)
        )}
        {sale.notes && (
          <TableRow className="bg-muted/30 hover:bg-muted/50">
            <TableCell />
            <TableCell
              colSpan={totalCols - 2}
              className="text-xs text-muted-foreground"
            >
              Note: {sale.notes}
            </TableCell>
            <TableCell />
          </TableRow>
        )}
      </>
    );
  }

  if (!data) return null;

  const { sale: saleData, lineItems } = data;

  // For fulfilled sales, try to use snapshotted lineItems for display if available
  const saleLineItems = sale.lineItems;
  const snapshotMap = new Map<string, { productName: string; variantName?: string; productPrice: number }>();
  if (saleLineItems) {
    for (const li of saleLineItems) {
      if (li.productName) {
        const key = li.variantId ?? li.productId;
        snapshotMap.set(key, { productName: li.productName, variantName: li.variantName, productPrice: li.productPrice ?? 0 });
      }
    }
  }

  // Match inBundle flag from sale.lineItems to stockMovement lineItems by index
  const inBundleByIdx = new Map<number, boolean>();
  if (saleLineItems) {
    for (let i = 0; i < saleLineItems.length; i++) {
      if (saleLineItems[i].inBundle != null) {
        inBundleByIdx.set(i, saleLineItems[i].inBundle!);
      }
    }
  }
  const fulfilledItems = lineItems.map((m, i) => ({
    productId: m.productId,
    quantity: m.quantity,
    productPrice: snapshotMap.get(m.variantId ?? m.productId)?.productPrice ?? products.get(m.productId)?.price,
    inBundle: inBundleByIdx.get(i),
    variantSizeMl: m.variantId ? variantSizeMap.get(m.variantId) : undefined,
  }));
  const { bundles, nonBundledIndices } = computeOfferGrouping(fulfilledItems, effectiveOffer, products, hasSnapshots);

  const isInternalSale = sale.saleChannel === "internal";
  const renderFulfilledItem = (m: typeof lineItems[number], _idx: number, indented: boolean) => {
    const snapshot = snapshotMap.get(m.variantId ?? m.productId);
    const product = products.get(m.productId);
    const itemName = snapshot?.productName ?? product?.name ?? "Unknown";
    const variantName = snapshot?.variantName;
    // For internal sales (loss charges, self-use) the meaningful per-unit price
    // is what the agent was charged (hqUnitPrice on the movement), not the retail.
    const itemPrice = isInternalSale
      ? (m.unitPrice ?? m.hqUnitPrice ?? 0)
      : (snapshot?.productPrice ?? product?.price ?? 0);
    const qty = m.quantity;
    const batch = batches.get(m.batchId);
    return (
      <TableRow
        key={`${m._id}-${indented ? "bundled" : "rest"}`}
        className="bg-muted/30 hover:bg-muted/50"
      >
        <TableCell />
        <TableCell />
        <TableCell
          colSpan={showAgent ? 2 : 1}
          className={`text-sm ${indented ? "pl-8" : ""}`}
        >
          <span className="font-medium">
            {itemName}
          </span>
          {variantName && (
            <span className="text-muted-foreground ml-1 text-xs">— {variantName}</span>
          )}
          <span className="text-muted-foreground">
            {" "}— Batch {batch?.batchCode ?? "?"}
          </span>
        </TableCell>
        <TableCell className="text-sm">
          x{qty}
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell className="text-right text-sm">
          {!indented ? `RM${(itemPrice * qty).toFixed(2)}` : ""}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      {bundles.map((bundle, bIdx) => (
        <Fragment key={`bundle-group-${bIdx}`}>
          {renderBundleHeader(bundle, bIdx)}
          {[...bundle.itemIndices].map((itemIdx) =>
            renderFulfilledItem(lineItems[itemIdx], itemIdx, true)
          )}
        </Fragment>
      ))}
      {nonBundledIndices.map((itemIdx) =>
        renderFulfilledItem(lineItems[itemIdx], itemIdx, false)
      )}
      {saleData.notes && (
        <TableRow className="bg-muted/30 hover:bg-muted/50">
          <TableCell />
          <TableCell
            colSpan={totalCols - 2}
            className="text-xs text-muted-foreground"
          >
            Note: {saleData.notes}
          </TableCell>
          <TableCell />
        </TableRow>
      )}
    </>
  );
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  qr: "QR Payment",
  bank_transfer: "Bank Transfer",
  online: "Online",
  other: "Other",
};

const COLLECTOR_LABELS: Record<string, string> = {
  agent: "Agent collected",
  hq: "HQ collected",
};

function PaymentProofImage({ storageId }: { storageId: Id<"_storage"> }) {
  const url = useQuery(api.files.getFileUrl, { storageId });
  const [showFull, setShowFull] = useState(false);

  if (!url) return <span className="text-muted-foreground text-xs">Loading...</span>;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          setShowFull(true);
        }}
      >
        <ImageIcon data-icon="inline-start" />
        View Receipt
      </Button>
      <Dialog open={showFull} onOpenChange={setShowFull}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Proof of Payment</DialogTitle>
          <img
            src={url}
            alt="Proof of payment"
            className="w-full rounded-lg object-contain max-h-[70vh]"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SalePaymentDetails({
  sale,
  totalCols,
}: {
  sale: Doc<"sales">;
  totalCols: number;
}) {
  const hasPaymentInfo =
    sale.paymentMethod || sale.paymentProofStorageId || sale.overpaymentAmount;

  if (!hasPaymentInfo) return null;

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/50">
      <TableCell />
      <TableCell colSpan={totalCols - 2} className="text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <ReceiptIcon className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Payment:</span>
            <span className="font-medium">
              {sale.paymentMethod
                ? PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod
                : "—"}
            </span>
          </div>
          {sale.paymentCollector && (
            <Badge variant="outline" className="text-xs">
              {COLLECTOR_LABELS[sale.paymentCollector] ?? sale.paymentCollector}
            </Badge>
          )}
          {sale.overpaymentAmount != null && sale.overpaymentAmount > 0 && (
            <Badge variant="secondary" className="text-xs">
              Overpaid RM{sale.overpaymentAmount.toFixed(2)}
            </Badge>
          )}
          {sale.amountReceived != null && sale.amountReceived !== sale.totalAmount && (
            <span className="text-xs text-muted-foreground">
              Received: RM{sale.amountReceived.toFixed(2)}
            </span>
          )}
          {sale.paymentProofStorageId && (
            <PaymentProofImage storageId={sale.paymentProofStorageId} />
          )}
        </div>
      </TableCell>
      <TableCell />
    </TableRow>
  );
}

export function SalesTable({
  sales,
  products,
  batches,
  agents,
  offers,
  showAgent = false,
  hideFilters = false,
  initialPaymentStatuses,
}: {
  sales: Doc<"sales">[];
  products: Doc<"products">[];
  batches: Doc<"batches">[];
  agents?: Doc<"users">[];
  offers?: Doc<"offers">[];
  showAgent?: boolean;
  hideFilters?: boolean;
  initialPaymentStatuses?: string[];
}) {
  const productMap = new Map(products.map((p) => [p._id, p]));
  const batchMap = new Map(batches.map((b) => [b._id, b]));
  const agentMap = new Map((agents ?? []).map((a) => [a._id, a]));
  const offerMap = new Map((offers ?? []).map((o) => [o._id, o]));

  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [selectedPaymentStatuses, setSelectedPaymentStatuses] = useState<Set<string>>(
    () => new Set(initialPaymentStatuses ?? [])
  );
  const [selectedFulfillmentStatuses, setSelectedFulfillmentStatuses] = useState<Set<string>>(new Set());
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<Set<string>>(new Set());
  const [selectedCollectors, setSelectedCollectors] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortCol, setSortCol] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editingSale, setEditingSale] = useState<Doc<"sales"> | null>(null);
  const [paymentSale, setPaymentSale] = useState<Doc<"sales"> | null>(null);

  function handleSort(col: "date" | "amount") {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  function toggleExpanded(saleId: string) {
    setExpandedSales((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) {
        next.delete(saleId);
      } else {
        next.add(saleId);
      }
      return next;
    });
  }

  const hasActiveFilters =
    search !== "" ||
    selectedAgents.size > 0 ||
    selectedProducts.size > 0 ||
    selectedBatches.size > 0 ||
    selectedPaymentStatuses.size > 0 ||
    selectedFulfillmentStatuses.size > 0 ||
    selectedPaymentMethods.size > 0 ||
    selectedCollectors.size > 0 ||
    dateFrom !== "" ||
    dateTo !== "";

  function clearFilters() {
    setSearch("");
    setSelectedAgents(new Set());
    setSelectedProducts(new Set());
    setSelectedBatches(new Set());
    setSelectedPaymentStatuses(new Set());
    setSelectedFulfillmentStatuses(new Set());
    setSelectedPaymentMethods(new Set());
    setSelectedCollectors(new Set());
    setDateFrom("");
    setDateTo("");
  }

  const agentOptions = (agents ?? []).map((a) => ({
    label: a.nickname || a.name || a.email || "Unnamed",
    value: a._id,
  }));

  const productOptions = products.map((p) => ({ label: p.name, value: p._id }));

  const batchOptionsForProducts =
    selectedProducts.size === 0
      ? batches
      : batches.filter((b) => selectedProducts.has(b.productId));

  const batchOptions = batchOptionsForProducts.map((b) => ({
    label: b.batchCode,
    value: b._id,
  }));

  const filteredSales = sales.filter((sale) => {
    if (search) {
      const term = search.toLowerCase();
      const customerName = sale.customerDetail?.name?.toLowerCase() ?? "";
      const customerPhone = sale.customerDetail?.phone?.toLowerCase() ?? "";
      if (!customerName.includes(term) && !customerPhone.includes(term))
        return false;
    }
    if (selectedAgents.size > 0 && !selectedAgents.has(sale.sellerId ?? ""))
      return false;
    if (selectedProducts.size > 0) {
      const items = sale.lineItems;
      if (!items || !items.some((li) => selectedProducts.has(li.productId)))
        return false;
    }
    if (selectedBatches.size > 0) {
      const items = sale.lineItems;
      if (!items || !items.some((li) => li.batchId && selectedBatches.has(li.batchId)))
        return false;
    }
    if (selectedPaymentStatuses.size > 0 && !selectedPaymentStatuses.has(sale.paymentStatus))
      return false;
    if (
      selectedFulfillmentStatuses.size > 0 &&
      !selectedFulfillmentStatuses.has(sale.fulfillmentStatus ?? "")
    )
      return false;
    if (selectedPaymentMethods.size > 0 && !selectedPaymentMethods.has(sale.paymentMethod ?? ""))
      return false;
    if (selectedCollectors.size > 0 && !selectedCollectors.has(sale.paymentCollector ?? ""))
      return false;
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      if (sale.saleDate < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86_400_000;
      if (sale.saleDate >= to) return false;
    }
    return true;
  });

  const sortedSales = [...filteredSales].sort((a, b) => {
    const aVal = sortCol === "date" ? a.saleDate : a.totalAmount;
    const bVal = sortCol === "date" ? b.saleDate : b.totalAmount;
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  if (sales.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No sales recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      {!hideFilters && <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[150px] lg:w-[220px]"
        />
        {showAgent && (
          <FacetedFilter
            title="Agent"
            options={agentOptions}
            selected={selectedAgents}
            onSelectionChange={setSelectedAgents}
          />
        )}
        <FacetedFilter
          title="Product"
          options={productOptions}
          selected={selectedProducts}
          onSelectionChange={(next) => {
            setSelectedProducts(next);
            setSelectedBatches(new Set());
          }}
        />
        <FacetedFilter
          title="Batch"
          options={batchOptions}
          selected={selectedBatches}
          onSelectionChange={setSelectedBatches}
        />
        <FacetedFilter
          title="Payment"
          options={[
            { label: "Paid", value: "paid" },
            { label: "Partial", value: "partial" },
            { label: "Unpaid", value: "unpaid" },
          ]}
          selected={selectedPaymentStatuses}
          onSelectionChange={setSelectedPaymentStatuses}
        />
        <FacetedFilter
          title="Fulfillment"
          options={[
            { label: "Fulfilled", value: "fulfilled" },
            { label: "Partial", value: "partial" },
            { label: "Pending Stock", value: "pending_stock" },
          ]}
          selected={selectedFulfillmentStatuses}
          onSelectionChange={setSelectedFulfillmentStatuses}
        />
        <FacetedFilter
          title="Payment Type"
          options={[
            { label: "Cash", value: "cash" },
            { label: "QR Payment", value: "qr" },
            { label: "Bank Transfer", value: "bank_transfer" },
            { label: "Online", value: "online" },
            { label: "Other", value: "other" },
          ]}
          selected={selectedPaymentMethods}
          onSelectionChange={setSelectedPaymentMethods}
        />
        <FacetedFilter
          title="Collected By"
          options={[
            { label: "Agent collected", value: "agent" },
            { label: "HQ collected", value: "hq" },
          ]}
          selected={selectedCollectors}
          onSelectionChange={setSelectedCollectors}
        />
        <DateRangeFilter
          title="Date"
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>}

      <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[40px]" />
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort("date")}>
                Date
                {sortCol === "date" ? (
                  sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />
                ) : (
                  <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />
                )}
              </Button>
            </TableHead>
            <TableHead>Customer</TableHead>
            {showAgent && <TableHead>Agent</TableHead>}
            <TableHead>Items</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">
              <Button variant="ghost" size="sm" className="-mr-3 h-8" onClick={() => handleSort("amount")}>
                {sortCol === "amount" ? (
                  sortDir === "asc" ? <ArrowUpIcon className="mr-2 h-4 w-4" /> : <ArrowDownIcon className="mr-2 h-4 w-4" />
                ) : (
                  <ArrowUpDownIcon className="mr-2 h-4 w-4 opacity-40" />
                )}
                Amount
              </Button>
            </TableHead>
            <TableHead className="w-[90px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedSales.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showAgent ? 8 : 7}
                className="py-12 text-center text-muted-foreground"
              >
                No sales match the selected filters.
              </TableCell>
            </TableRow>
          ) : null}
          {sortedSales.map((sale) => {
          const isExpanded = expandedSales.has(sale._id);
          const agent = sale.sellerId ? agentMap.get(sale.sellerId) : null;
          const offer = sale.offerId ? offerMap.get(sale.offerId) : null;
          const hasOffer = !!(sale.offerSnapshot || offer);

          const itemsSummary =
            sale.totalQuantity === 1
              ? `1 unit`
              : `${sale.totalQuantity} units`;

          return (
            <Fragment key={sale._id}>
              <TableRow
                className="cursor-pointer"
                onClick={() => toggleExpanded(sale._id)}
              >
                <TableCell className="w-[40px] pr-0">
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell>
                  {new Date(sale.saleDate).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {sale.customerDetail?.name ?? (sale.buyerId ? agentMap.get(sale.buyerId)?.name ?? "Agent" : "-")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {sale.customerDetail?.phone ?? ""}
                  </div>
                </TableCell>
                {showAgent && (
                  <TableCell>
                    {agent?.nickname || agent?.name || agent?.email || "HQ"}
                  </TableCell>
                )}
                <TableCell>{itemsSummary}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{CHANNEL_LABELS[sale.saleChannel] ?? sale.saleChannel}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <PaymentBadge status={sale.paymentStatus} />
                    <FulfillmentBadge status={sale.fulfillmentStatus} />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {hasOffer && (
                        <Badge variant="outline" className="text-xs">
                        Offer
                      </Badge>
                    )}
                    <span className="font-medium">
                      RM{sale.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="pl-0 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {sale.paymentStatus !== "paid" && sale.saleChannel !== "internal" && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label="Record payment"
                              className={
                                sale.paymentStatus === "unpaid"
                                  ? "h-7 w-7 p-0 relative border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive after:absolute after:-top-0.5 after:-right-0.5 after:h-2 after:w-2 after:rounded-full after:bg-destructive after:animate-pulse"
                                  : "h-7 w-7 p-0 relative border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-400 after:absolute after:-top-0.5 after:-right-0.5 after:h-2 after:w-2 after:rounded-full after:bg-amber-500"
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                setPaymentSale(sale);
                              }}
                            >
                              <BanknoteIcon className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          {sale.paymentStatus === "unpaid"
                            ? `Record payment — RM${sale.totalAmount.toFixed(2)} outstanding`
                            : `Record payment — RM${(sale.totalAmount - sale.amountPaid).toFixed(2)} remaining`}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSale(sale);
                      }}
                    >
                      <PencilIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>

              {isExpanded && (
                <>
                  <SaleLineItems
                    saleId={sale._id}
                    sale={sale}
                    products={productMap}
                    batches={batchMap}
                    showAgent={showAgent}
                    offer={offer}
                  />
                  <SalePaymentDetails
                    sale={sale}
                    totalCols={showAgent ? 9 : 8}
                  />
                </>
              )}
            </Fragment>
          );
        })}
        </TableBody>
      </Table>
      </div>

      {editingSale && (
        <EditSaleDialog
          sale={editingSale}
          open={!!editingSale}
          onOpenChange={(open) => {
            if (!open) setEditingSale(null);
          }}
        />
      )}

      {paymentSale && (
        <RecordPaymentDialog
          sale={paymentSale}
          open={!!paymentSale}
          onOpenChange={(open) => {
            if (!open) setPaymentSale(null);
          }}
        />
      )}
    </div>
  );
}
