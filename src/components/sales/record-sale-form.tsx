"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { TrashIcon, UploadIcon, XIcon, CameraIcon, UserIcon, ShoppingBagIcon, CreditCardIcon, CalendarIcon, TagIcon, PlusIcon, MinusIcon } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { PhoneInput } from "@/components/ui/phone-input";
import { Checkbox } from "@/components/ui/checkbox";
import { AddItemPickerDialog, type PickerSource } from "@/components/sales/add-item-picker-dialog";

type FulfillmentSource = "agent_stock" | "hq_transfer" | "hq_direct" | "pending_batch" | "future_release";

interface UnifiedLineItem {
  productId: Id<"products">;
  productName: string;
  variantId?: Id<"productVariants">;
  variantName?: string;
  source: FulfillmentSource;
  // Only set for agent_stock items
  batchId?: Id<"batches">;
  inventoryId?: string;
  batchCode?: string;
  // Set when agent picks an HQ batch for auto-fulfill on record
  hqBatchId?: Id<"batches">;
  hqBatchCode?: string;
  // Max available from this inventory/batch (for limiting adds)
  inventoryMax?: number;
}

const SALE_CHANNEL_LABELS: Record<string, string> = {
  direct: "Direct",
  tiktok: "TikTok",
  shopee: "Shopee",
  other: "Other",
};

const COLLECTOR_LABELS: Record<string, string> = {
  agent: "I collect from customer",
  hq: "HQ collects directly",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  qr: "QR Payment",
  bank_transfer: "Bank Transfer",
  online: "Online",
  other: "Other",
};

function formatDateForInput(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseInputDateToTimestamp(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).getTime();
}

const SOURCE_BADGES: Record<FulfillmentSource, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; tooltip: string }> = {
  agent_stock: { label: "In Stock", variant: "default", tooltip: "You have this item in your own stock. It will be deducted from your inventory when the sale is recorded." },
  hq_transfer: { label: "Pending HQ Transfer", variant: "secondary", tooltip: "This item will be sourced from HQ stock. HQ will transfer the product to you, and you will deliver it to the customer." },
  hq_direct: { label: "Fulfilled by HQ", variant: "secondary", tooltip: "This item will be fulfilled directly by HQ. HQ will ship the product to the customer on your behalf." },
  pending_batch: { label: "Pending Batch", variant: "outline", tooltip: "This product has an upcoming batch being prepared. The sale will be fulfilled once the batch is ready and stock is available." },
  future_release: { label: "Future Release", variant: "destructive", tooltip: "This product hasn't been manufactured yet. The sale is a pre-order and will be fulfilled when the product is released." },
};

const HQ_AUTO_FULFILL_TOOLTIP = "HQ has automatically assigned a specific batch to fulfill this item. Stock will be sent from that batch directly.";

export function RecordSaleForm({
  inventory,
  businessInventory,
  agentProfile,
  userRole,
}: {
  inventory: Doc<"inventory">[];
  businessInventory?: Doc<"inventory">[];
  agentProfile?: {
    defaultStockModel?: string;
    paymentCollectorPreference?: "agent" | "hq";
    preferredPaymentMethod?: "cash" | "qr" | "bank_transfer";
    paymentQrUrl?: string | null;
  } | null;
  userRole?: string;
}) {
  const recordSale = useMutation(api.sales.recordB2CSale);
  const recordPresell = useMutation(api.sales.recordPresellSale);
  const selfFulfillFromHQ = useMutation(api.sales.selfFulfillFromHQ);
  const markConverted = useMutation(api.interests.markConverted);
  const products = useQuery(api.products.listSellable);
  const allProducts = useQuery(api.products.list);
  const batches = useQuery(api.batches.listAll);
  const router = useRouter();
  const searchParams = useSearchParams();

  const interestId = searchParams.get("interestId") as Id<"interests"> | null;
  const interest = useQuery(
    api.interests.get,
    interestId ? { interestId } : "skip"
  );

  const rawModel = agentProfile?.defaultStockModel ?? "hold_paid";
  const defaultModel = (rawModel === "dropship" ? "presell" : rawModel) as
    | "hold_paid"
    | "consignment"
    | "presell";

  const [unifiedItems, setUnifiedItems] = useState<UnifiedLineItem[]>([]);
  const [saleChannel, setSaleChannel] = useState<string>("direct");
  const stockModel = defaultModel;
  const [paymentCollector, setPaymentCollector] = useState<"agent" | "hq">(
    agentProfile?.paymentCollectorPreference ?? "agent"
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [saleDate, setSaleDate] = useState<string>(formatDateForInput(Date.now()));
  const [interestPreFilled, setInterestPreFilled] = useState(false);

  // Payment flow state
  const [paymentTiming, setPaymentTiming] = useState<"paid" | "partial" | "unpaid">("paid");
  const [amountPaidNow, setAmountPaidNow] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>(
    agentProfile?.preferredPaymentMethod ?? ""
  );
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [amountReceived, setAmountReceived] = useState<string>("");
  const [customerPaidMore, setCustomerPaidMore] = useState(false);
  const [overpaymentRecipient, setOverpaymentRecipient] = useState<"seller" | "hq">("hq");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const isPresell = stockModel === "presell";
  const isConsignment = stockModel === "consignment";
  const showCollectorOption = isPresell || isConsignment;

  const isUnpaid = paymentTiming === "unpaid";
  const isPartial = paymentTiming === "partial";
  const isNonCashPayment = !isUnpaid && (paymentMethod === "qr" || paymentMethod === "bank_transfer");
  const isHqCollector = paymentCollector === "hq";
  const needsProofOfPayment = isNonCashPayment && isHqCollector && showCollectorOption;
  const isSalesperson = userRole === "sales";
  const isCashOrNonCash = !isUnpaid && (paymentMethod === "cash" || isNonCashPayment);
  const showAmountReceivedForSales = isSalesperson && isCashOrNonCash && !isPartial;

  // Whether the seller is the collector (always true for hold_paid; otherwise determined by collector dropdown)
  const sellerCollects = !showCollectorOption || paymentCollector === "agent";
  // Allowed payment methods based on who collects:
  // - Seller collects: cash, qr (hide bank_transfer, online, other)
  // - HQ collects: cash, qr, bank_transfer (hide online, other)
  const allowedPaymentMethods = useMemo(
    () =>
      sellerCollects
        ? (["cash", "qr"] as const)
        : (["cash", "qr", "bank_transfer"] as const),
    [sellerCollects]
  );

  // If the current selection becomes invalid after a collector change, clear it
  useEffect(() => {
    if (
      paymentMethod &&
      !(allowedPaymentMethods as readonly string[]).includes(paymentMethod)
    ) {
      setPaymentMethod("");
      setPaymentProofFile(null);
      setPaymentProofPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [allowedPaymentMethods, paymentMethod]);

  const allVariants = useQuery(api.productVariants.listAll);

  // Use allProducts for product map (includes all statuses for display), sellable for dropdown
  const productMap = useMemo(
    () => new Map((allProducts ?? []).map((p) => [p._id, p])),
    [allProducts]
  );
  const batchMap = new Map((batches ?? []).map((b) => [b._id, b]));
  const variantMap = useMemo(
    () => new Map((allVariants ?? []).map((v) => [v._id, v])),
    [allVariants]
  );
  const variantsByProduct = useMemo(() => {
    const map = new Map<string, Doc<"productVariants">[]>();
    for (const v of (allVariants ?? [])) {
      // In the sale order form (agent→customer), hide agent-only variants (testers, refills)
      if (v.status === "active" && v.forWho !== "agents") {
        const existing = map.get(v.productId) ?? [];
        map.set(v.productId, [...existing, v]);
      }
    }
    return map;
  }, [allVariants]);
  const activeInventory = isPresell ? (businessInventory ?? []) : inventory;

  // Pre-fill from interest
  useEffect(() => {
    if (interest && !interestPreFilled && allProducts && batches && allVariants) {
      setCustomerName(interest.customerDetail.name);
      setCustomerPhone(interest.customerDetail.phone ?? "");
      setCustomerEmail(interest.customerDetail.email ?? "");
      if (interest.notes) setNotes(interest.notes);

      const pMap = new Map(allProducts.map((p) => [p._id, p]));
      const bMap = new Map(batches.map((b) => [b._id, b]));
      const vMap = new Map(allVariants.map((v) => [v._id, v]));
      const items: UnifiedLineItem[] = [];
      const usedInvCounts = new Map<string, number>();

      for (const item of interest.items) {
        const product = pMap.get(item.productId);
        const interestVariant = item.variantId ? vMap.get(item.variantId) : undefined;

        for (let u = 0; u < item.quantity; u++) {
          // Try to match to agent inventory (has enough remaining, matching variant if set)
          const inv = inventory.find(
            (i) =>
              i.productId === item.productId &&
              (!item.variantId || i.variantId === item.variantId) &&
              (usedInvCounts.get(i._id) ?? 0) < i.quantity
          );

          if (inv) {
            usedInvCounts.set(inv._id, (usedInvCounts.get(inv._id) ?? 0) + 1);
            const batch = bMap.get(inv.batchId);
            const invVariant = inv.variantId ? vMap.get(inv.variantId) : undefined;
            items.push({
              productId: item.productId,
              productName: product?.name ?? "Unknown",
              variantId: inv.variantId,
              variantName: invVariant?.name,
              source: "agent_stock",
              batchId: inv.batchId,
              inventoryId: inv._id,
              inventoryMax: inv.quantity,
              batchCode: batch?.batchCode ?? "?",
            });
          } else if (product?.status === "future_release") {
            const hqInv = (businessInventory ?? []).find(
              (i) => i.productId === item.productId && i.quantity > 0
            );
            items.push({
              productId: item.productId,
              productName: product.name,
              variantId: item.variantId,
              variantName: interestVariant?.name,
              source: hqInv ? "hq_transfer" : "future_release",
            });
          } else {
            const hqInv = (businessInventory ?? []).find(
              (i) => i.productId === item.productId && i.quantity > 0
            );
            items.push({
              productId: item.productId,
              productName: product?.name ?? "Unknown",
              variantId: item.variantId,
              variantName: interestVariant?.name,
              source: hqInv ? "hq_transfer" : "pending_batch",
            });
          }
        }
      }

      setUnifiedItems(items);
      setInterestPreFilled(true);
    }
  }, [interest, interestPreFilled, allProducts, batches, allVariants, inventory, businessInventory]);

  // Track how many units from each inventory are used
  const usedInventoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const li of unifiedItems) {
      if (li.inventoryId) {
        counts.set(li.inventoryId, (counts.get(li.inventoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [unifiedItems]);
  // Track how many units from each HQ batch are used
  const usedHQBatchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const li of unifiedItems) {
      if (li.hqBatchId) {
        counts.set(li.hqBatchId, (counts.get(li.hqBatchId) ?? 0) + 1);
      }
    }
    return counts;
  }, [unifiedItems]);
  // Track pending (non-agent-stock) product+variant combos to avoid duplicates in the "add" dropdown
  const usedPendingKeys = useMemo(() => new Set(
    unifiedItems
      .filter((li) => li.source !== "agent_stock")
      .map((li) => li.variantId ? `${li.productId}__${li.variantId}` : li.productId)
  ), [unifiedItems]);

  const lineItemProductIds = useMemo(
    () => [...new Set(unifiedItems.map((li) => li.productId))],
    [unifiedItems]
  );

  const lineItemVariantIds = useMemo(
    () => [...new Set(unifiedItems.map((li) => li.variantId).filter((id): id is Id<"productVariants"> => !!id))],
    [unifiedItems]
  );

  const applicableOffers = useQuery(
    api.offers.getApplicableOffers,
    lineItemProductIds.length > 0
      ? {
          productIds: lineItemProductIds,
          variantIds: lineItemVariantIds.length > 0 ? lineItemVariantIds : undefined,
          saleContext: "customers" as const,
        }
      : "skip"
  );

  const totalQuantity = unifiedItems.length;

  function itemPrice(li: UnifiedLineItem): number {
    if (li.variantId) return variantMap.get(li.variantId)?.price ?? 0;
    return productMap.get(li.productId)?.price ?? 0;
  }

  // Pricing calculation — each item in unifiedItems is 1 unit
  const pricing = useMemo(() => {
    if (unifiedItems.length === 0) return null;

    const defaultTotal = unifiedItems.reduce((sum, li) => {
      const price = li.variantId ? (variantMap.get(li.variantId)?.price ?? 0) : (productMap.get(li.productId)?.price ?? 0);
      return sum + price;
    }, 0);

    const selectedOffer =
      selectedOfferId && applicableOffers
        ? applicableOffers.find((o) => o._id === selectedOfferId)
        : null;

    if (selectedOffer) {
      // Determine eligible vs non-eligible items
      const eligibleIndices: number[] = [];
      const nonEligibleIndices: number[] = [];
      for (let idx = 0; idx < unifiedItems.length; idx++) {
        const li = unifiedItems[idx];
        const product = productMap.get(li.productId);
        let eligible = true;
        if (selectedOffer.variantId) {
          eligible = li.variantId === selectedOffer.variantId;
        } else if (selectedOffer.variantIds && selectedOffer.variantIds.length > 0) {
          eligible = !!li.variantId && selectedOffer.variantIds.includes(li.variantId);
        } else if (selectedOffer.productId) {
          eligible = li.productId === selectedOffer.productId;
        } else if (selectedOffer.productIds && selectedOffer.productIds.length > 0) {
          eligible = selectedOffer.productIds.includes(li.productId);
        } else if (selectedOffer.collection) {
          eligible = product?.collection === selectedOffer.collection;
        }
        // Also apply sizeMl filter for new-style offers
        if (eligible && selectedOffer.sizeMl != null && !selectedOffer.variantId && !(selectedOffer.variantIds && selectedOffer.variantIds.length > 0)) {
          const variant = li.variantId ? variantMap.get(li.variantId) : undefined;
          eligible = variant?.sizeMl === selectedOffer.sizeMl;
        }
        if (eligible) {
          eligibleIndices.push(idx);
        } else {
          nonEligibleIndices.push(idx);
        }
      }

      const eligibleQty = eligibleIndices.length;

      if (eligibleQty >= selectedOffer.minQuantity) {
        const bundleCount = Math.floor(eligibleQty / selectedOffer.minQuantity);
        const bundledUnitCount = bundleCount * selectedOffer.minQuantity;

        // First N eligible items go into bundles, rest are non-bundled
        const bundledIndices = eligibleIndices.slice(0, bundledUnitCount);
        const remainderIndices = eligibleIndices.slice(bundledUnitCount);

        const getIdxPrice = (idx: number) => {
          const li = unifiedItems[idx];
          return li.variantId ? (variantMap.get(li.variantId)?.price ?? 0) : (productMap.get(li.productId)?.price ?? 0);
        };

        // Group bundled items into per-bundle sets
        const bundles: { itemIndices: Set<number>; originalPrice: number }[] = [];
        for (let b = 0; b < bundleCount; b++) {
          const start = b * selectedOffer.minQuantity;
          const end = start + selectedOffer.minQuantity;
          const indices = bundledIndices.slice(start, end);
          let originalPrice = 0;
          const itemIndices = new Set<number>();
          for (const idx of indices) {
            itemIndices.add(idx);
            originalPrice += getIdxPrice(idx);
          }
          bundles.push({ itemIndices, originalPrice });
        }

        // Totals
        const bundleTotal = bundleCount * selectedOffer.bundlePrice;
        const bundledOriginalPrice = bundledIndices.reduce((sum, idx) => sum + getIdxPrice(idx), 0);
        const remainderTotal = remainderIndices.reduce((sum, idx) => sum + getIdxPrice(idx), 0);
        const nonEligibleTotal = nonEligibleIndices.reduce((sum, idx) => sum + getIdxPrice(idx), 0);
        const offerTotal = bundleTotal + remainderTotal + nonEligibleTotal;

        // Non-bundled = remainder eligible + non-eligible
        const nonBundledIndices = [...remainderIndices, ...nonEligibleIndices];

        // Track which indices are bundled (for submission tagging)
        const bundledSet = new Set(bundledIndices);

        return {
          defaultTotal,
          offerTotal,
          savings: defaultTotal - offerTotal,
          offer: selectedOffer,
          bundleCount,
          bundleTotal,
          bundledOriginalPrice,
          bundles,
          nonBundledIndices,
          bundledSet,
        };
      }
    }

    return {
      defaultTotal,
      offerTotal: null,
      savings: 0,
      offer: null,
      bundleCount: 0,
      bundleTotal: 0,
      bundledOriginalPrice: 0,
      bundles: [] as { itemIndices: Set<number>; originalPrice: number }[],
      nonBundledIndices: [] as number[],
      bundledSet: new Set<number>(),
    };
  }, [unifiedItems, selectedOfferId, applicableOffers, productMap, variantMap]);

  const pricingTotal = pricing ? Math.round((pricing.offerTotal ?? pricing.defaultTotal) * 100) / 100 : 0;
  // Overpayment ("customer paid more") only makes sense for fully paid sales — hide when partial/unpaid.
  const showAmountReceivedCol = ((isHqCollector && showCollectorOption && needsProofOfPayment) || showAmountReceivedForSales) && !!pricing && !isPartial && !isUnpaid;

  function addItem(value: string) {
    // Value could be an inventory ID (for agent_stock) or a product ID (for pending/future)
    const inv = activeInventory.find((i) => i._id === value);
    if (inv) {
      const product = productMap.get(inv.productId);
      const batch = batchMap.get(inv.batchId);
      const variant = inv.variantId ? variantMap.get(inv.variantId) : undefined;
      const source: FulfillmentSource = isPresell ? "hq_transfer" : "agent_stock";
      setUnifiedItems([
        ...unifiedItems,
        {
          productId: inv.productId,
          productName: product?.name ?? "Unknown",
          variantId: inv.variantId,
          variantName: variant?.name,
          source,
          batchId: inv.batchId,
          inventoryId: inv._id,
          inventoryMax: inv.quantity,
          batchCode: batch?.batchCode ?? "?",
        },
      ]);
    }
  }

  function addFromOwnInventory(value: string) {
    // Add from salesperson's own inventory (even in pre-sell mode)
    const inv = inventory.find((i) => i._id === value);
    if (inv) {
      const product = productMap.get(inv.productId);
      const batch = batchMap.get(inv.batchId);
      const variant = inv.variantId ? variantMap.get(inv.variantId) : undefined;
      setUnifiedItems([
        ...unifiedItems,
        {
          productId: inv.productId,
          productName: product?.name ?? "Unknown",
          variantId: inv.variantId,
          variantName: variant?.name,
          source: "agent_stock",
          batchId: inv.batchId,
          inventoryId: inv._id,
          inventoryMax: inv.quantity,
          batchCode: batch?.batchCode ?? "?",
        },
      ]);
    }
  }

  function addPendingProduct(value: string) {
    // value is "productId" or "productId__variantId"
    const [productId, variantId] = value.split("__");
    const product = productMap.get(productId as Id<"products">);
    if (!product) return;
    const variant = variantId ? variantMap.get(variantId as Id<"productVariants">) : undefined;
    let source: FulfillmentSource;
    if (product.status === "future_release") {
      source = "future_release";
    } else {
      const hqHasStock = (businessInventory ?? []).some(
        (i) => i.productId === product._id && i.quantity > 0
      );
      source = hqHasStock ? "hq_transfer" : "pending_batch";
    }
    setUnifiedItems([
      ...unifiedItems,
      {
        productId: product._id,
        productName: product.name,
        variantId: variant?._id,
        variantName: variant?.name,
        source,
      },
    ]);
  }

  function addFromHQAutoFulfill(invId: string) {
    const inv = (businessInventory ?? []).find((i) => i._id === invId);
    if (!inv) return;
    const product = productMap.get(inv.productId);
    const batch = batchMap.get(inv.batchId);
    const variant = inv.variantId ? variantMap.get(inv.variantId) : undefined;
    setUnifiedItems([
      ...unifiedItems,
      {
        productId: inv.productId,
        productName: product?.name ?? "Unknown",
        variantId: inv.variantId,
        variantName: variant?.name,
        source: "hq_transfer",
        hqBatchId: inv.batchId,
        hqBatchCode: batch?.batchCode ?? "?",
        inventoryMax: inv.quantity,
      },
    ]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Max 5MB.");
      return;
    }
    setPaymentProofFile(file);
    const reader = new FileReader();
    reader.onload = () => setPaymentProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearPaymentProof() {
    setPaymentProofFile(null);
    setPaymentProofPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Add one more unit of the same product+source+batch (duplicates the given item)
  function addUnitLike(item: UnifiedLineItem) {
    // Check inventory limit
    if (item.inventoryId && item.inventoryMax != null) {
      const usedCount = usedInventoryCounts.get(item.inventoryId) ?? 0;
      if (usedCount >= item.inventoryMax) {
        toast.error("No more stock available for this item");
        return;
      }
    }
    if (item.hqBatchId && item.inventoryMax != null) {
      const usedCount = usedHQBatchCounts.get(item.hqBatchId) ?? 0;
      if (usedCount >= item.inventoryMax) {
        toast.error("No more HQ stock available for this item");
        return;
      }
    }
    // Insert adjacent to the last matching item so groupIndices keeps them consecutive
    let lastMatchIdx = -1;
    for (let i = unifiedItems.length - 1; i >= 0; i--) {
      const li = unifiedItems[i];
      if (
        li.productId === item.productId &&
        li.variantId === item.variantId &&
        li.source === item.source &&
        li.batchId === item.batchId &&
        li.hqBatchId === item.hqBatchId
      ) {
        lastMatchIdx = i;
        break;
      }
    }
    const updated = [...unifiedItems];
    updated.splice(lastMatchIdx + 1, 0, { ...item });
    setUnifiedItems(updated);
  }

  // Remove one unit matching the same product+variant+source+batch (removes last occurrence)
  function removeUnitLike(item: UnifiedLineItem) {
    // Find the last index matching this product+variant+source+batch
    for (let i = unifiedItems.length - 1; i >= 0; i--) {
      const li = unifiedItems[i];
      if (
        li.productId === item.productId &&
        li.variantId === item.variantId &&
        li.source === item.source &&
        li.batchId === item.batchId &&
        li.hqBatchId === item.hqBatchId
      ) {
        const updated = unifiedItems.filter((_, idx) => idx !== i);
        setUnifiedItems(updated);
        if (updated.length === 0) setSelectedOfferId("");
        return;
      }
    }
  }


  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (unifiedItems.length === 0) return;

    // Validate amount received is not less than the total (paid/overpayment scenario only)
    if (!isUnpaid && !isPartial && showAmountReceivedCol && amountReceived !== "") {
      const received = Math.round(parseFloat(amountReceived) * 100) / 100;
      if (isNaN(received) || received < pricingTotal) {
        toast.error(`Amount received must be at least RM${pricingTotal.toFixed(2)}`);
        return;
      }
    }

    // Validate partial payment amount
    if (isPartial) {
      const paidNow = parseFloat(amountPaidNow);
      if (isNaN(paidNow) || paidNow <= 0) {
        toast.error("Enter the amount paid now");
        return;
      }
      if (paidNow >= pricingTotal) {
        toast.error(`Partial payment must be less than the total (RM${pricingTotal.toFixed(2)})`);
        return;
      }
    }

    // If agent collects payment directly, show confirmation dialog
    const agentCollects = !isHqCollector || (!showCollectorOption);
    if (!isUnpaid && agentCollects && paymentMethod) {
      setShowConfirmDialog(true);
      return;
    }

    submitSale();
  }

  async function submitSale() {
    setSubmitting(true);
    try {
      // Upload proof of payment if provided (any non-cash method, regardless of collector)
      let paymentProofStorageId: Id<"_storage"> | undefined;
      if (paymentProofFile && isNonCashPayment) {
        setUploadingProof(true);
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": paymentProofFile.type },
          body: paymentProofFile,
        });
        if (!result.ok) throw new Error("Failed to upload proof of payment");
        const { storageId } = await result.json();
        paymentProofStorageId = storageId;
        setUploadingProof(false);
      }

      const channel = saleChannel as "direct" | "tiktok" | "shopee" | "other";
      const customerDetail = {
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
      };
      const offerId = selectedOfferId
        ? (selectedOfferId as Id<"offers">)
        : undefined;
      const saleDateTs = parseInputDateToTimestamp(saleDate);

      const paymentMethodValue = !isUnpaid && paymentMethod
        ? (paymentMethod as "cash" | "qr" | "bank_transfer" | "online" | "other")
        : undefined;
      const amountReceivedValue = !isUnpaid && !isPartial && amountReceived
        ? parseFloat(amountReceived)
        : undefined;
      const amountPaidNowValue = isPartial && amountPaidNow
        ? parseFloat(amountPaidNow)
        : undefined;

      // Group unit-based items into quantities, split by bundle status
      const bundledSet = pricing?.bundledSet ?? new Set<number>();

      // Helper: group items by key into { ...item, quantity }
      type GroupedFulfilled = { batchId: Id<"batches">; productId: Id<"products">; variantId?: Id<"productVariants">; quantity: number; inBundle?: boolean; fulfillmentSource?: FulfillmentSource };
      type GroupedPending = { productId: Id<"products">; variantId?: Id<"productVariants">; quantity: number; fulfillmentSource: FulfillmentSource; inBundle?: boolean };
      const fulfilledGroups = new Map<string, GroupedFulfilled>();
      const pendingGroups = new Map<string, GroupedPending>();

      for (let i = 0; i < unifiedItems.length; i++) {
        const li = unifiedItems[i];
        const inBundle = bundledSet.has(i);
        if (li.source === "agent_stock" && li.batchId) {
          const key = `${li.batchId}-${li.productId}-${li.variantId ?? ""}-${inBundle}`;
          const existing = fulfilledGroups.get(key);
          if (existing) {
            existing.quantity++;
          } else {
            fulfilledGroups.set(key, {
              batchId: li.batchId,
              productId: li.productId,
              variantId: li.variantId,
              quantity: 1,
              inBundle: inBundle || undefined,
              ...(isPresell ? { fulfillmentSource: "agent_stock" as const } : {}),
            });
          }
        } else {
          const key = `${li.productId}-${li.variantId ?? ""}-${li.source}-${inBundle}`;
          const existing = pendingGroups.get(key);
          if (existing) {
            existing.quantity++;
          } else {
            pendingGroups.set(key, {
              productId: li.productId,
              variantId: li.variantId,
              quantity: 1,
              fulfillmentSource: li.source,
              inBundle: inBundle || undefined,
            });
          }
        }
      }

      const fulfilledItems = [...fulfilledGroups.values()];
      const pendingItems = [...pendingGroups.values()];

      let saleId: Id<"sales">;

      // Determine overpayment recipient for sales role
      const hasOverpayment = amountReceivedValue != null && pricing &&
        amountReceivedValue > Math.round((pricing.offerTotal ?? pricing.defaultTotal) * 100) / 100;
      const overpaymentRecipientValue = isSalesperson && hasOverpayment ? overpaymentRecipient : undefined;

      if (isPresell) {
        saleId = await recordPresell({
          fulfilledItems: fulfilledItems.length > 0 ? fulfilledItems : undefined,
          pendingItems: pendingItems.length > 0 ? pendingItems : undefined,
          saleChannel: channel,
          customerDetail,
          dropshipCollector: paymentCollector,
          offerId,
          notes: notes || undefined,
          saleDate: saleDateTs,
          interestId: interestId ?? undefined,
          paymentMethod: paymentMethodValue,
          paymentProofStorageId,
          amountReceived: amountReceivedValue,
          overpaymentRecipient: overpaymentRecipientValue,
          paymentTiming,
          amountPaidNow: amountPaidNowValue,
        });
      } else {
        saleId = await recordSale({
          fulfilledItems: fulfilledItems.length > 0 ? fulfilledItems : undefined,
          pendingItems: pendingItems.length > 0 ? pendingItems : undefined,
          saleChannel: channel,
          customerDetail,
          stockModel: stockModel as "hold_paid" | "consignment" | "presell",
          paymentCollector: isConsignment ? paymentCollector : undefined,
          offerId,
          notes: notes || undefined,
          saleDate: saleDateTs,
          interestId: interestId ?? undefined,
          paymentMethod: paymentMethodValue,
          paymentProofStorageId,
          amountReceived: amountReceivedValue,
          overpaymentRecipient: overpaymentRecipientValue,
          paymentTiming,
          amountPaidNow: amountPaidNowValue,
        });
      }

      // Auto-fulfill items that the agent selected from HQ inventory
      const hqAutoFulfillItems = unifiedItems.filter(
        (li) => li.source !== "agent_stock" && li.hqBatchId
      );
      if (hqAutoFulfillItems.length > 0) {
        // Group HQ auto-fulfill items by batchId
        const hqGroups = new Map<string, { batchId: Id<"batches">; quantity: number }>();
        for (const li of hqAutoFulfillItems) {
          const key = li.hqBatchId!;
          const existing = hqGroups.get(key);
          if (existing) {
            existing.quantity++;
          } else {
            hqGroups.set(key, { batchId: li.hqBatchId!, quantity: 1 });
          }
        }
        // Find the line item indices in the stored sale for these pending items
        const fulfilledCount = fulfilledItems.length;
        const autoFulfillPayload: { lineItemIndex: number; batchId: Id<"batches">; quantity: number }[] = [];
        let pendingIdx = 0;
        for (const pending of pendingItems) {
          // Check if any HQ auto-fulfill items match this pending group
          for (const [, hqGroup] of hqGroups) {
            if (hqAutoFulfillItems.some((li) => li.hqBatchId === hqGroup.batchId && li.productId === pending.productId && li.source === pending.fulfillmentSource)) {
              autoFulfillPayload.push({
                lineItemIndex: fulfilledCount + pendingIdx,
                batchId: hqGroup.batchId,
                quantity: hqGroup.quantity,
              });
            }
          }
          pendingIdx++;
        }
        if (autoFulfillPayload.length > 0) {
          await selfFulfillFromHQ({ saleId, items: autoFulfillPayload });
        }
      }

      if (interestId) {
        await markConverted({ interestId, saleId });
      }

      toast.success("Sale order submitted successfully");
      router.push("/dashboard/my-sales");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to record sale"));
    } finally {
      setSubmitting(false);
      setUploadingProof(false);
    }
  }

  // Available items for the "Add" dropdown — show items that still have remaining stock
  const availableInventory = activeInventory.filter(
    (inv) => inv.quantity > 0 && (usedInventoryCounts.get(inv._id) ?? 0) < inv.quantity
  );

  // Agent's own inventory (available even in pre-sell mode)
  const availableAgentInventory = isPresell
    ? inventory.filter(
        (inv) => inv.quantity > 0 && (usedInventoryCounts.get(inv._id) ?? 0) < inv.quantity
      )
    : [];

  // HQ inventory available for auto-fulfill (salesperson only — works in any stock model)
  const availableHQInventory = isSalesperson
    ? (businessInventory ?? []).filter(
        (inv) => inv.quantity > 0 && (usedHQBatchCounts.get(inv.batchId) ?? 0) < inv.quantity
      )
    : [];

  // Picker-only lists: hide items already added (use +/- on the row to bump qty)
  const pickableInventory = availableInventory.filter(
    (inv) => (usedInventoryCounts.get(inv._id) ?? 0) === 0
  );
  const pickableAgentInventory = availableAgentInventory.filter(
    (inv) => (usedInventoryCounts.get(inv._id) ?? 0) === 0
  );
  const pickableHQInventory = availableHQInventory.filter(
    (inv) => (usedHQBatchCounts.get(inv.batchId) ?? 0) === 0
  );

  const sellableProducts = products ?? [];

  const hasPendingItems = unifiedItems.some((li) => li.source !== "agent_stock");
  const hasItems = unifiedItems.length > 0;

  // Overpayment calculation (used in payment section)
  const receivedNum = Math.round(parseFloat(amountReceived) * 100) / 100;
  const overpaymentAmt = showAmountReceivedCol && !isNaN(receivedNum) && receivedNum > pricingTotal
    ? (Math.round((receivedNum - pricingTotal) * 100) / 100).toFixed(2)
    : null;
  const showOverpaymentCol = isSalesperson && showAmountReceivedCol && !!overpaymentAmt;

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6 max-w-4xl mx-auto">
      {interest && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardContent className="py-3 px-4">
            <p className="text-sm text-muted-foreground">
              Converting interest from <span className="font-medium text-foreground">{interest.customerDetail.name}</span>:{" "}
              {interest.items
                .map((item) => {
                  const product = productMap.get(item.productId);
                  return `${product?.name ?? "Unknown"} x${item.quantity}`;
                })
                .join(", ")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Customer Details */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="h-4 w-4 text-muted-foreground" />
            Customer Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Name</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone (optional)</Label>
              <PhoneInput
                id="customerPhone"
                value={customerPhone}
                onChange={setCustomerPhone}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Email (optional)</Label>
              <Input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="Email address"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Details */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            Order Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 min-w-0 overflow-hidden">
              <Label htmlFor="saleDate">Date</Label>
              <Input
                id="saleDate"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                max={formatDateForInput(Date.now())}
                className="w-full min-w-0 max-w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="saleChannel">Channel</Label>
              <Select
                value={saleChannel}
                onValueChange={(v) => { if (v) setSaleChannel(v); }}
              >
                <SelectTrigger id="saleChannel">
                  <SelectValue placeholder="Select channel">
                    {SALE_CHANNEL_LABELS[saleChannel] ?? "Select channel"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="shopee">Shopee</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBagIcon className="h-4 w-4 text-muted-foreground" />
            Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const hasActiveOffer = pricing?.offer != null && pricing.offerTotal !== null && pricing.bundles.length > 0;

                  // Group consecutive units into visual groups by (productId, source, batchId, hqBatchId)
                  // For offer mode, group within bundled/non-bundled sections separately
                  type VisualGroup = {
                    item: UnifiedLineItem;
                    indices: number[]; // indices in unifiedItems
                    qty: number;
                    canAdd: boolean; // can add more units
                  };

                  function groupIndices(indices: number[]): VisualGroup[] {
                    const groups: VisualGroup[] = [];
                    for (const idx of indices) {
                      const li = unifiedItems[idx];
                      const lastGroup = groups[groups.length - 1];
                      if (
                        lastGroup &&
                        lastGroup.item.productId === li.productId &&
                        lastGroup.item.variantId === li.variantId &&
                        lastGroup.item.source === li.source &&
                        lastGroup.item.batchId === li.batchId &&
                        lastGroup.item.hqBatchId === li.hqBatchId
                      ) {
                        lastGroup.indices.push(idx);
                        lastGroup.qty++;
                      } else {
                        // Check if more can be added from this inventory/source
                        let canAdd = true;
                        if (li.inventoryId && li.inventoryMax != null) {
                          canAdd = (usedInventoryCounts.get(li.inventoryId) ?? 0) < li.inventoryMax;
                        } else if (li.hqBatchId && li.inventoryMax != null) {
                          canAdd = (usedHQBatchCounts.get(li.hqBatchId) ?? 0) < li.inventoryMax;
                        }
                        groups.push({ item: li, indices: [idx], qty: 1, canAdd });
                      }
                    }
                    return groups;
                  }

                  // Render a grouped item row
                  const renderGroupRow = (
                    group: VisualGroup,
                    options: { indented?: boolean; showPrice?: boolean; keyPrefix?: string }
                  ) => {
                    const basePrice = itemPrice(group.item);
                    const badge = SOURCE_BADGES[group.item.source];
                    const li = group.item;
                    return (
                      <TableRow
                        key={`${options.keyPrefix ?? ""}${group.indices[0]}`}
                        className={options.indented ? "bg-muted/30" : undefined}
                      >
                        <TableCell className={options.indented ? "pl-8 font-medium" : "font-medium"}>
                          {li.productName}{li.variantName ? ` — ${li.variantName}` : ""}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger render={<Badge variant={li.hqBatchId ? "secondary" : badge.variant} className="text-xs cursor-help" />}>
                                {li.hqBatchId ? "HQ Auto-Fulfill" : badge.label}
                              </TooltipTrigger>
                              <TooltipContent>
                                {li.hqBatchId ? HQ_AUTO_FULFILL_TOOLTIP : badge.tooltip}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                        <TableCell>
                          {li.hqBatchCode ?? li.batchCode ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removeUnitLike(li)}
                            >
                              <MinusIcon className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center text-sm font-medium">{group.qty}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              disabled={!group.canAdd}
                              onClick={() => addUnitLike(li)}
                            >
                              <PlusIcon className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {options.showPrice
                            ? `RM${(basePrice * group.qty).toFixed(2)}`
                            : ""}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              // Remove all units in this group
                              const toRemove = new Set(group.indices);
                              const updated = unifiedItems.filter((_, i) => !toRemove.has(i));
                              setUnifiedItems(updated);
                              if (updated.length === 0) setSelectedOfferId("");
                            }}
                          >
                            <TrashIcon className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  };

                  const rows: React.ReactNode[] = [];

                  if (hasActiveOffer) {
                    // Render each bundle group
                    pricing.bundles.forEach((bundle, bIdx) => {
                      rows.push(
                        <TableRow key={`offer-header-${bIdx}`} className="bg-muted/30">
                          <TableCell colSpan={4} className="font-semibold">
                            {pricing.offer!.name}
                            <span className="font-normal text-muted-foreground ml-2">
                              {pricing.offer!.minQuantity} for RM{pricing.offer!.bundlePrice.toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            <span className="text-muted-foreground line-through mr-2">
                              RM{bundle.originalPrice.toFixed(2)}
                            </span>
                            RM{pricing.offer!.bundlePrice.toFixed(2)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      );
                      const bundleGroups = groupIndices([...bundle.itemIndices]);
                      for (const group of bundleGroups) {
                        rows.push(renderGroupRow(group, { indented: true, showPrice: false, keyPrefix: `bundle-${bIdx}-` }));
                      }
                    });

                    // Non-bundled items at regular price
                    const nonBundledGroups = groupIndices(pricing.nonBundledIndices);
                    for (const group of nonBundledGroups) {
                      rows.push(renderGroupRow(group, { showPrice: true, keyPrefix: "non-bundled-" }));
                    }
                  } else {
                    // No offer — group all items
                    const allIndices = unifiedItems.map((_, i) => i);
                    const groups = groupIndices(allIndices);
                    for (const group of groups) {
                      rows.push(renderGroupRow(group, { showPrice: true }));
                    }
                  }

                  return rows;
                })()}

                {/* Single "Add item" trigger — opens picker dialog */}
                {(() => {
                  const ownInv = isPresell ? pickableAgentInventory : pickableInventory;
                  const presellHQInv = isPresell ? pickableInventory : [];
                  type PendingItem = { value: string; label: string; variant?: Doc<"productVariants"> };
                  type PendingGroupLocal = { product: Doc<"products">; futureSuffix: string; items: PendingItem[] };
                  const pendingGroups: PendingGroupLocal[] = sellableProducts.flatMap((product): PendingGroupLocal[] => {
                    const variants = variantsByProduct.get(product._id) ?? [];
                    const futureSuffix = product.status === "future_release" ? " (Future Release)" : "";
                    if (variants.length === 0) {
                      if (usedPendingKeys.has(product._id)) return [];
                      return [{
                        product,
                        futureSuffix,
                        items: [{
                          value: product._id as string,
                          label: `RM${(product.price ?? 0).toFixed(2)}`,
                        }],
                      }];
                    }
                    const filtered = variants.filter(
                      (v) => !usedPendingKeys.has(`${product._id}__${v._id}`)
                    );
                    if (filtered.length === 0) return [];
                    return [{
                      product,
                      futureSuffix,
                      items: filtered.map((v) => ({
                        value: `${product._id}__${v._id}`,
                        label: `${v.name} · RM${v.price.toFixed(2)}`,
                        variant: v,
                      })),
                    }];
                  });

                  const sources: PickerSource[] = [];
                  if (ownInv.length > 0) {
                    sources.push({
                      kind: "inventory",
                      key: "own",
                      label: "Your stock",
                      description: "Items in your own inventory — deducted on sale.",
                      inventory: ownInv,
                      qtyLabel: (q) => `avail: ${q}`,
                      onPick: (v) => (isPresell ? addFromOwnInventory(v) : addItem(v)),
                    });
                  }
                  if (pickableHQInventory.length > 0) {
                    sources.push({
                      kind: "inventory",
                      key: "hqAuto",
                      label: "From HQ",
                      description: "Pull from HQ stock and fulfill the sale in one click — no transfer needed.",
                      inventory: pickableHQInventory,
                      qtyLabel: (q) => `HQ: ${q}`,
                      onPick: (v) => addFromHQAutoFulfill(v),
                    });
                  }
                  if (presellHQInv.length > 0) {
                    sources.push({
                      kind: "inventory",
                      key: "hqPresell",
                      label: "Order from HQ",
                      description: "HQ will transfer the stock to you so you can deliver it to the customer.",
                      inventory: presellHQInv,
                      qtyLabel: (q) => `avail: ${q}`,
                      onPick: (v) => addItem(v),
                    });
                  }
                  if (pendingGroups.length > 0) {
                    sources.push({
                      kind: "pending",
                      key: "pending",
                      label: "Pre-orders",
                      description: "Products with no immediate stock — fulfilled when the next batch is ready or released.",
                      groups: pendingGroups,
                      onPick: (v) => addPendingProduct(v),
                    });
                  }

                  if (sources.length === 0) return null;
                  return (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6}>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setPickerOpen(true)}
                          className="w-full md:w-auto"
                        >
                          <PlusIcon />
                          Add item
                        </Button>
                        <AddItemPickerDialog
                          open={pickerOpen}
                          onOpenChange={setPickerOpen}
                          sources={sources}
                          productMap={productMap}
                          batchMap={batchMap}
                          variantMap={variantMap}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })()}

                {/* Empty state */}
                {unifiedItems.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground h-16"
                    >
                      {availableInventory.length > 0
                        ? "Add items from your inventory, or add products without stock."
                        : "No inventory available. You can still add products for pre-paid sales."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>

              {/* Footer with total */}
              {unifiedItems.length > 0 && pricing && (
                <TableFooter>
                  <TableRow className="font-semibold text-base">
                    <TableCell colSpan={4} className="text-right">
                      Total ({totalQuantity} items)
                    </TableCell>
                    <TableCell className="text-right">
                      RM{(pricing.offerTotal ?? pricing.defaultTotal).toFixed(2)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>

          {/* Offer selection */}
          {applicableOffers && applicableOffers.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TagIcon className="h-4 w-4 text-muted-foreground" />
                  Apply Offer
                </Label>
                <Select
                  value={selectedOfferId || "none"}
                  onValueChange={(v) =>
                    setSelectedOfferId(v === "none" || !v ? "" : v)
                  }
                >
                  <SelectTrigger className="w-full md:w-fit md:min-w-[350px]">
                    <SelectValue placeholder="Select an offer...">
                      {selectedOfferId
                        ? (() => {
                            const offer = applicableOffers?.find(
                              (o) => o._id === selectedOfferId
                            );
                            return offer
                              ? `${offer.name} — ${offer.minQuantity} for RM${offer.bundlePrice.toFixed(2)}`
                              : "Select an offer...";
                          })()
                        : "No offer (default pricing)"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No offer (default pricing)</SelectItem>
                    {applicableOffers.map((offer) => (
                      <SelectItem key={offer._id} value={offer._id}>
                        {offer.name} — {offer.minQuantity} for RM
                        {offer.bundlePrice.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedOfferId &&
                  pricing?.offer &&
                  totalQuantity < pricing.offer.minQuantity && (
                    <p className="text-sm text-destructive">
                      Need at least {pricing.offer.minQuantity} items for this
                      offer. You have {totalQuantity}.
                    </p>
                  )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment Details */}
      {hasItems && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
              Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Collector + Method + Amount + Overpayment in one row */}
            <div className="flex flex-col gap-4">
              {/* Row 1: Payment Status + Amount Paid Now + Collector + Method */}
              <div className="flex flex-wrap gap-4">
                <div className="space-y-2 min-w-[48px]">
                  <Label htmlFor="paymentTiming">Payment Status</Label>
                  <Select
                    value={paymentTiming}
                    onValueChange={(v) => {
                      if (!v) return;
                      const next = v as "paid" | "partial" | "unpaid";
                      setPaymentTiming(next);
                      if (next === "unpaid") {
                        setPaymentMethod("");
                        clearPaymentProof();
                        setAmountReceived("");
                        setCustomerPaidMore(false);
                        setAmountPaidNow("");
                      } else if (next === "partial") {
                        setAmountReceived("");
                        setCustomerPaidMore(false);
                      } else {
                        setAmountPaidNow("");
                      }
                    }}
                  >
                    <SelectTrigger id="paymentTiming" className="min-w-[180px]">
                      <SelectValue>
                        {paymentTiming === "paid"
                          ? "Fully paid"
                          : paymentTiming === "partial"
                            ? "Partial payment"
                            : "Unpaid (pay later)"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Fully paid</SelectItem>
                      <SelectItem value="partial">Partial payment</SelectItem>
                      <SelectItem value="unpaid">Unpaid (pay later)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isPartial && (
                  <div className="space-y-2 min-w-[48px]">
                    <Label htmlFor="amountPaidNow">Amount Paid Now (RM)</Label>
                    <Input
                      id="amountPaidNow"
                      type="number"
                      step="0.01"
                      min={0}
                      max={pricingTotal}
                      placeholder="0.00"
                      value={amountPaidNow}
                      onChange={(e) => setAmountPaidNow(e.target.value)}
                      className="max-w-48"
                    />
                    <p className="text-xs text-muted-foreground">
                      Outstanding: RM
                      {Math.max(
                        0,
                        Math.round((pricingTotal - (parseFloat(amountPaidNow) || 0)) * 100) / 100
                      ).toFixed(2)}
                    </p>
                  </div>
                )}
                {showCollectorOption && (
                  <div className="space-y-2 min-w-[48px]">
                    <Label>Who Collects Payment?</Label>
                    <Select
                      value={paymentCollector}
                      onValueChange={(v) => {
                        if (v) setPaymentCollector(v as "agent" | "hq");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {COLLECTOR_LABELS[paymentCollector] ?? "Select..."}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agent">
                          I collect from customer
                        </SelectItem>
                        <SelectItem value="hq">HQ collects directly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {!isUnpaid && (
                  <div className="space-y-2 min-w-[48px]">
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Select
                      value={paymentMethod || "none"}
                      onValueChange={(v) => {
                        setPaymentMethod(v === "none" || !v ? "" : v);
                        if (v === "cash" || v === "none" || !v) {
                          clearPaymentProof();
                          if (v !== "cash") { setAmountReceived(""); setCustomerPaidMore(false); }
                        }
                        setOverpaymentRecipient("hq");
                      }}
                    >
                      <SelectTrigger id="paymentMethod">
                        <SelectValue placeholder="Select payment method...">
                          {paymentMethod
                            ? PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod
                            : "Not specified"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not specified</SelectItem>
                        {allowedPaymentMethods.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {isUnpaid && (
                <p className="text-sm text-muted-foreground">
                  Customer will pay later. Record the payment from the sales history page once received.
                </p>
              )}

              {/* Row 2: Overpayment checkbox + amount + recipient */}
              {showAmountReceivedCol && (
                <div className="flex flex-wrap items-start gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="customerPaidMore"
                        checked={customerPaidMore}
                        onCheckedChange={(checked) => {
                          setCustomerPaidMore(!!checked);
                          if (!checked) setAmountReceived("");
                        }}
                      />
                      <Label htmlFor="customerPaidMore" className="cursor-pointer">
                        Customer paid more than RM{pricingTotal.toFixed(2)}
                      </Label>
                    </div>
                    {customerPaidMore && (
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1 pb-1">
                          <Label htmlFor="amountReceived">Amount Received (RM)</Label>
                          <Input
                            className="max-w-48"
                            id="amountReceived"
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder={pricingTotal.toFixed(2)}
                            value={amountReceived}
                            autoFocus
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "") { setAmountReceived(""); return; }
                              const num = parseFloat(raw);
                              if (!isNaN(num)) {
                                setAmountReceived((Math.round(num * 100) / 100).toString());
                              } else {
                                setAmountReceived(raw);
                              }
                            }}
                          />
                          {overpaymentAmt && !isSalesperson && (
                            <p className="text-sm text-muted-foreground">
                              Overpayment of <span className="font-medium text-foreground">RM{overpaymentAmt}</span> — will be transferred to you as commission.
                            </p>
                          )}
                        </div>
                        {showOverpaymentCol && (
                          <div className="space-y-1 min-w-[48px]">
                            <Label>Overpayment of RM{overpaymentAmt} goes to</Label>
                            <Select
                              value={overpaymentRecipient}
                              onValueChange={(v) => { if (v) setOverpaymentRecipient(v as "seller" | "hq"); }}
                            >
                              <SelectTrigger>
                                <SelectValue>
                                  {overpaymentRecipient === "hq" ? "HQ" : "Me (salesperson)"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hq">HQ</SelectItem>
                                <SelectItem value="seller">Me (salesperson)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* HQ QR Payment details */}
            {isHqCollector && showCollectorOption && paymentMethod === "qr" && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium">Show QR to customer</p>
                <button
                  type="button"
                  onClick={() => setShowQrDialog(true)}
                  className="block rounded-lg border overflow-hidden hover:opacity-75 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring mx-auto"
                >
                  <img
                    src="/qr-payment.png"
                    alt="QR Payment"
                    className="h-64 w-64 object-contain"
                  />
                </button>
                <p className="text-xs text-muted-foreground text-center">Tap to enlarge</p>
              </div>
            )}

            {/* Seller's own QR — when the seller collects via QR */}
            {sellerCollects && paymentMethod === "qr" && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                {agentProfile?.paymentQrUrl ? (
                  <>
                    <p className="text-sm font-medium">Show your QR to customer</p>
                    <button
                      type="button"
                      onClick={() => setShowQrDialog(true)}
                      className="block rounded-lg border overflow-hidden hover:opacity-75 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring mx-auto"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={agentProfile.paymentQrUrl}
                        alt="Your QR Payment"
                        className="h-64 w-64 object-contain"
                      />
                    </button>
                    <p className="text-xs text-muted-foreground text-center">Tap to enlarge</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    No QR uploaded yet. Add one in <span className="font-medium">Settings → Payment Preferences</span> to show it here.
                  </p>
                )}
              </div>
            )}

            {/* HQ Bank Transfer details */}
            {isHqCollector && showCollectorOption && paymentMethod === "bank_transfer" && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Transfer to</p>
                  <p className="font-semibold text-base">Inonity Sdn Bhd</p>
                  <p className="text-sm text-muted-foreground">RHB Bank</p>
                  <p className="font-mono font-semibold text-lg tracking-widest">2660 1600 025125</p>
                </div>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Payment Reference</p>
                  <p className="font-mono font-bold text-xl tracking-widest">
                    {(() => {
                      const d = new Date();
                      const dd = String(d.getDate()).padStart(2, "0");
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const yy = String(d.getFullYear()).slice(-2);
                      const last4 = customerPhone.replace(/\D/g, "").slice(-4) || "XXXX";
                      return `TM-BT-${yy}${mm}${dd}-${last4}`;
                    })()}
                  </p>
                  <p className="text-xs text-muted-foreground">Ask customer to include this reference when transferring.</p>
                </div>
              </div>
            )}

            {/* Proof of payment upload — optional, shown for QR/bank transfer */}
            {isNonCashPayment && (
              <div className="space-y-2">
                <Label>
                  Proof of Payment
                </Label>
                <p className="text-sm text-muted-foreground">
                  Optional — upload a receipt or screenshot for your records.
                </p>

                {paymentProofPreview ? (
                  <div className="relative inline-block">
                    <img
                      src={paymentProofPreview}
                      alt="Payment proof preview"
                      className="max-h-48 rounded-lg border object-contain"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 size-6"
                      onClick={clearPaymentProof}
                    >
                      <XIcon />
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      {paymentProofFile?.name}
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadIcon data-icon="inline-start" />
                      Upload File
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.setAttribute("capture", "environment");
                          fileInputRef.current.click();
                          fileInputRef.current.removeAttribute("capture");
                        }
                      }}
                    >
                      <CameraIcon data-icon="inline-start" />
                      Take Photo
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3">
        {hasPendingItems && (
          <p className="text-sm text-muted-foreground self-center mr-auto">
            Some items need fulfillment later. Settlement created now.
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={
            !hasItems ||
            !saleChannel ||
            !customerName ||
            submitting ||
            uploadingProof
          }
        >
          {uploadingProof
            ? "Uploading..."
            : submitting
              ? "Submitting..."
              : "Submit Order"}
        </Button>
      </div>

      {/* QR Payment */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="flex flex-col gap-4 sm:max-w-md">
          <DialogTitle>QR Payment</DialogTitle>
          <div className="flex flex-1 items-center justify-center px-4 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="QR Payment"
              src={
                sellerCollects && agentProfile?.paymentQrUrl
                  ? agentProfile.paymentQrUrl
                  : "/qr-payment.png"
              }
              className="h-auto block"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog when agent/salesperson collects payment */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Sale Order</AlertDialogTitle>
            <AlertDialogDescription>
              You are submitting a sale where you collected the payment directly
              from the customer via{" "}
              <span className="font-medium">
                {paymentMethod === "cash"
                  ? "cash"
                  : paymentMethod === "qr"
                    ? "QR payment"
                    : paymentMethod === "bank_transfer"
                      ? "bank transfer"
                      : paymentMethod}
              </span>
              .{" "}
              {isPartial ? (
                <>
                  You collected{" "}
                  <span className="font-medium">
                    RM{(parseFloat(amountPaidNow) || 0).toFixed(2)}
                  </span>{" "}
                  out of a total of{" "}
                  <span className="font-medium">RM{pricingTotal.toFixed(2)}</span>{" "}
                  (outstanding RM
                  {Math.max(0, pricingTotal - (parseFloat(amountPaidNow) || 0)).toFixed(2)}
                  ).
                </>
              ) : (
                <>
                  The total amount is{" "}
                  <span className="font-medium">RM{pricingTotal.toFixed(2)}</span>
                  {overpaymentAmt && (
                    <>
                      {" "}with an overpayment of{" "}
                      <span className="font-medium">RM{overpaymentAmt}</span>
                      {" "}(amount received:{" "}
                      <span className="font-medium">RM{parseFloat(amountReceived).toFixed(2)}</span>
                      )
                    </>
                  )}
                  .
                </>
              )}{" "}
              Please confirm this is correct.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowConfirmDialog(false);
                submitSale();
              }}
            >
              Confirm &amp; Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
