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
import { TrashIcon, UploadIcon, XIcon, CameraIcon } from "lucide-react";
import { toast } from "sonner";

type FulfillmentSource = "agent_stock" | "hq_transfer" | "pending_batch" | "future_release";

interface UnifiedLineItem {
  productId: Id<"products">;
  quantity: number;
  productName: string;
  source: FulfillmentSource;
  // Only set for agent_stock items
  batchId?: Id<"batches">;
  inventoryId?: string;
  maxQuantity?: number;
  batchCode?: string;
  // Set when agent picks an HQ batch for auto-fulfill on record
  hqBatchId?: Id<"batches">;
  hqBatchCode?: string;
  hqMaxQuantity?: number;
}

const SALE_CHANNEL_LABELS: Record<string, string> = {
  direct: "Direct",
  tiktok: "TikTok",
  shopee: "Shopee",
  other: "Other",
};

const STOCK_MODEL_LABELS: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  dropship: "Dropship",
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
  return d.toISOString().split("T")[0];
}

function parseInputDateToTimestamp(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).getTime();
}

const SOURCE_BADGES: Record<FulfillmentSource, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; tooltip: string }> = {
  agent_stock: { label: "In Stock", variant: "default", tooltip: "You have this item in your own stock. It will be deducted from your inventory when the sale is recorded." },
  hq_transfer: { label: "HQ Transfer", variant: "secondary", tooltip: "This item will be fulfilled from HQ stock. Admin will process the transfer to the customer on your behalf." },
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
  agentProfile?: { defaultStockModel?: string } | null;
  userRole?: string;
}) {
  const recordSale = useMutation(api.sales.recordB2CSale);
  const recordDropship = useMutation(api.sales.recordDropshipSale);
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

  const defaultModel = (agentProfile?.defaultStockModel ?? "hold_paid") as
    | "hold_paid"
    | "consignment"
    | "dropship";

  const [unifiedItems, setUnifiedItems] = useState<UnifiedLineItem[]>([]);
  const [saleChannel, setSaleChannel] = useState<string>("direct");
  const [stockModel, setStockModel] = useState<string>(defaultModel);
  const [paymentCollector, setPaymentCollector] = useState<"agent" | "hq">("agent");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [saleDate, setSaleDate] = useState<string>(formatDateForInput(Date.now()));
  const [interestPreFilled, setInterestPreFilled] = useState(false);

  // Payment flow state
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [amountReceived, setAmountReceived] = useState<string>("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const isDropship = stockModel === "dropship";
  const isConsignment = stockModel === "consignment";
  const showCollectorOption = isDropship || isConsignment;

  const isNonCashPayment = paymentMethod === "qr" || paymentMethod === "bank_transfer";
  const isHqCollector = paymentCollector === "hq";
  const needsProofOfPayment = isNonCashPayment && isHqCollector && showCollectorOption;

  // Use allProducts for product map (includes all statuses for display), sellable for dropdown
  const productMap = new Map((allProducts ?? []).map((p) => [p._id, p]));
  const batchMap = new Map((batches ?? []).map((b) => [b._id, b]));
  const activeInventory = isDropship ? (businessInventory ?? []) : inventory;

  // Auto-detect fulfillment source for a product
  function detectSource(productId: Id<"products">): {
    source: FulfillmentSource;
    inv?: Doc<"inventory">;
  } {
    const product = productMap.get(productId);

    // Check agent inventory first (even for future_release)
    const agentInv = activeInventory.find(
      (i) =>
        i.productId === productId &&
        i.quantity > 0 &&
        !usedInventoryIds.has(i._id)
    );
    if (agentInv) {
      return { source: "agent_stock", inv: agentInv };
    }

    // Future release with no agent stock
    if (product?.status === "future_release") {
      const hqInv = (businessInventory ?? []).find(
        (i) => i.productId === productId && i.quantity > 0
      );
      return { source: hqInv ? "hq_transfer" : "future_release" };
    }

    // Check if HQ has inventory
    const hqInv = (businessInventory ?? []).find(
      (i) => i.productId === productId && i.quantity > 0
    );
    if (hqInv) {
      return { source: "hq_transfer" };
    }

    return { source: "pending_batch" };
  }

  // Pre-fill from interest
  useEffect(() => {
    if (interest && !interestPreFilled && allProducts && batches) {
      setCustomerName(interest.customerDetail.name);
      setCustomerPhone(interest.customerDetail.phone);
      setCustomerEmail(interest.customerDetail.email);
      if (interest.notes) setNotes(interest.notes);

      const pMap = new Map(allProducts.map((p) => [p._id, p]));
      const bMap = new Map(batches.map((b) => [b._id, b]));
      const items: UnifiedLineItem[] = [];
      const usedInvIds = new Set<string>();

      for (const item of interest.items) {
        const product = pMap.get(item.productId);

        // Try to match to agent inventory first (even for future_release)
        const inv = inventory.find(
          (i) =>
            i.productId === item.productId &&
            i.quantity >= item.quantity &&
            !usedInvIds.has(i._id)
        );

        if (inv) {
          usedInvIds.add(inv._id);
          const batch = bMap.get(inv.batchId);
          items.push({
            productId: item.productId,
            quantity: item.quantity,
            productName: product?.name ?? "Unknown",
            source: "agent_stock",
            batchId: inv.batchId,
            inventoryId: inv._id,
            maxQuantity: inv.quantity,
            batchCode: batch?.batchCode ?? "?",
          });
        } else if (product?.status === "future_release") {
          // Check HQ inventory, then fall back to future_release
          const hqInv = (businessInventory ?? []).find(
            (i) => i.productId === item.productId && i.quantity > 0
          );
          items.push({
            productId: item.productId,
            quantity: item.quantity,
            productName: product.name,
            source: hqInv ? "hq_transfer" : "future_release",
          });
        } else {
          // Check HQ
          const hqInv = (businessInventory ?? []).find(
            (i) => i.productId === item.productId && i.quantity > 0
          );
          items.push({
            productId: item.productId,
            quantity: item.quantity,
            productName: product?.name ?? "Unknown",
            source: hqInv ? "hq_transfer" : "pending_batch",
          });
        }
      }

      setUnifiedItems(items);
      setInterestPreFilled(true);
    }
  }, [interest, interestPreFilled, allProducts, batches, inventory, businessInventory]);

  // Track used inventory IDs
  const usedInventoryIds = new Set(
    unifiedItems.filter((li) => li.inventoryId).map((li) => li.inventoryId!)
  );
  const usedProductIds = new Set(
    unifiedItems.filter((li) => li.source !== "agent_stock").map((li) => li.productId)
  );

  // Items for pricing
  const currentItems = unifiedItems.map((li) => ({
    productId: li.productId,
    quantity: li.quantity,
  }));

  const lineItemProductIds = useMemo(
    () => [...new Set(currentItems.map((li) => li.productId))],
    [currentItems]
  );

  const applicableOffers = useQuery(
    api.offers.getApplicableOffers,
    lineItemProductIds.length > 0
      ? { productIds: lineItemProductIds }
      : "skip"
  );

  const totalQuantity = currentItems.reduce((sum, li) => sum + li.quantity, 0);

  // Pricing calculation
  const pricing = useMemo(() => {
    if (currentItems.length === 0) return null;

    const defaultTotal = currentItems.reduce((sum, li) => {
      const product = productMap.get(li.productId);
      return sum + li.quantity * (product?.price ?? 0);
    }, 0);

    const selectedOffer =
      selectedOfferId && applicableOffers
        ? applicableOffers.find((o) => o._id === selectedOfferId)
        : null;

    if (selectedOffer) {
      const eligibleIndices: number[] = [];
      const nonEligibleIndices: number[] = [];
      for (let idx = 0; idx < currentItems.length; idx++) {
        const li = currentItems[idx];
        const product = productMap.get(li.productId);
        let eligible = true;
        if (selectedOffer.productId) {
          eligible = li.productId === selectedOffer.productId;
        } else if (selectedOffer.productIds && selectedOffer.productIds.length > 0) {
          eligible = selectedOffer.productIds.includes(li.productId);
        } else if (selectedOffer.collection) {
          eligible = product?.collection === selectedOffer.collection;
        }
        if (eligible) {
          eligibleIndices.push(idx);
        } else {
          nonEligibleIndices.push(idx);
        }
      }

      const eligibleQty = eligibleIndices.reduce((s, idx) => s + currentItems[idx].quantity, 0);

      if (eligibleQty >= selectedOffer.minQuantity) {
        const bundleCount = Math.floor(eligibleQty / selectedOffer.minQuantity);
        const bundledUnitCount = bundleCount * selectedOffer.minQuantity;
        const eligibleRemainder = eligibleQty - bundledUnitCount;

        // Expand eligible items to assign bundle vs remainder
        const expanded: { idx: number }[] = [];
        for (const idx of eligibleIndices) {
          for (let u = 0; u < currentItems[idx].quantity; u++) {
            expanded.push({ idx });
          }
        }

        // Track which items are bundled vs remainder, and assign to specific bundles
        const bundledPerIdx = new Map<number, number>();
        const remainderPerIdx = new Map<number, number>();
        // Per-bundle grouping: bundle index → { itemIndices, originalPrice }
        const bundles: { itemIndices: Set<number>; originalPrice: number }[] = [];
        for (let b = 0; b < bundleCount; b++) {
          bundles.push({ itemIndices: new Set(), originalPrice: 0 });
        }

        for (let i = 0; i < expanded.length; i++) {
          const { idx } = expanded[i];
          if (i < bundledUnitCount) {
            bundledPerIdx.set(idx, (bundledPerIdx.get(idx) ?? 0) + 1);
            const bundleIdx = Math.floor(i / selectedOffer.minQuantity);
            bundles[bundleIdx].itemIndices.add(idx);
            const regularPrice = productMap.get(currentItems[idx].productId)?.price ?? 0;
            bundles[bundleIdx].originalPrice += regularPrice;
          } else {
            remainderPerIdx.set(idx, (remainderPerIdx.get(idx) ?? 0) + 1);
          }
        }

        // Calculate total using whole bundle price (no per-unit division = no rounding errors)
        const bundleTotal = bundleCount * selectedOffer.bundlePrice;
        let bundledOriginalPrice = 0;
        let remainderTotal = 0;
        for (const idx of eligibleIndices) {
          const bundled = bundledPerIdx.get(idx) ?? 0;
          const remainder = remainderPerIdx.get(idx) ?? 0;
          const regularPrice = productMap.get(currentItems[idx].productId)?.price ?? 0;
          bundledOriginalPrice += bundled * regularPrice;
          remainderTotal += remainder * regularPrice;
        }
        let nonEligibleTotal = 0;
        for (const idx of nonEligibleIndices) {
          const li = currentItems[idx];
          const regularPrice = productMap.get(li.productId)?.price ?? 0;
          nonEligibleTotal += li.quantity * regularPrice;
        }
        const offerTotal = bundleTotal + remainderTotal + nonEligibleTotal;

        // Non-bundled indices: remainder-only eligible + non-eligible
        const bundledSet = new Set<number>();
        for (const idx of eligibleIndices) {
          if ((bundledPerIdx.get(idx) ?? 0) > 0) bundledSet.add(idx);
        }
        const nonBundledIndices: number[] = [];
        for (let i = 0; i < currentItems.length; i++) {
          if (!bundledSet.has(i)) nonBundledIndices.push(i);
        }

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
          remainder: eligibleRemainder,
          bundledPerIdx,
          remainderPerIdx,
          eligibleIndices,
          nonEligibleIndices,
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
      remainder: 0,
      bundledPerIdx: new Map<number, number>(),
      remainderPerIdx: new Map<number, number>(),
      eligibleIndices: [] as number[],
      nonEligibleIndices: [] as number[],
    };
  }, [currentItems, selectedOfferId, applicableOffers, productMap]);

  function addItem(value: string) {
    // Value could be an inventory ID (for agent_stock) or a product ID (for pending/future)
    const inv = activeInventory.find((i) => i._id === value);
    if (inv) {
      const product = productMap.get(inv.productId);
      const batch = batchMap.get(inv.batchId);
      if (isDropship) {
        // HQ inventory — mark as hq_transfer (pending), admin fulfills later
        setUnifiedItems([
          ...unifiedItems,
          {
            productId: inv.productId,
            quantity: 1,
            productName: product?.name ?? "Unknown",
            source: "hq_transfer",
            batchId: inv.batchId,
            inventoryId: inv._id,
            maxQuantity: inv.quantity,
            batchCode: batch?.batchCode ?? "?",
          },
        ]);
      } else {
        // Agent's own inventory — fulfill from stock
        setUnifiedItems([
          ...unifiedItems,
          {
            productId: inv.productId,
            quantity: 1,
            productName: product?.name ?? "Unknown",
            source: "agent_stock",
            batchId: inv.batchId,
            inventoryId: inv._id,
            maxQuantity: inv.quantity,
            batchCode: batch?.batchCode ?? "?",
          },
        ]);
      }
    }
  }

  function addFromOwnInventory(value: string) {
    // Add from salesperson's own inventory (even in dropship mode)
    const inv = inventory.find((i) => i._id === value);
    if (inv) {
      const product = productMap.get(inv.productId);
      const batch = batchMap.get(inv.batchId);
      setUnifiedItems([
        ...unifiedItems,
        {
          productId: inv.productId,
          quantity: 1,
          productName: product?.name ?? "Unknown",
          source: "agent_stock",
          batchId: inv.batchId,
          inventoryId: inv._id,
          maxQuantity: inv.quantity,
          batchCode: batch?.batchCode ?? "?",
        },
      ]);
    }
  }

  function addPendingProduct(productId: string) {
    const product = productMap.get(productId as Id<"products">);
    if (!product) return;
    // "No stock needed" = always pending. Determine source based on availability.
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
        quantity: 1,
        productName: product.name,
        source,
      },
    ]);
  }

  function addFromHQAutoFulfill(invId: string) {
    const inv = (businessInventory ?? []).find((i) => i._id === invId);
    if (!inv) return;
    const product = productMap.get(inv.productId);
    const batch = batchMap.get(inv.batchId);
    setUnifiedItems([
      ...unifiedItems,
      {
        productId: inv.productId,
        quantity: 1,
        productName: product?.name ?? "Unknown",
        source: "hq_transfer",
        hqBatchId: inv.batchId,
        hqBatchCode: batch?.batchCode ?? "?",
        hqMaxQuantity: inv.quantity,
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

  function removeItem(index: number) {
    const updated = unifiedItems.filter((_, i) => i !== index);
    setUnifiedItems(updated);
    if (updated.length === 0) setSelectedOfferId("");
  }

  function updateQuantity(index: number, qty: number) {
    setUnifiedItems(
      unifiedItems.map((li, i) => {
        if (i !== index) return li;
        const max = li.maxQuantity ?? Infinity;
        return { ...li, quantity: Math.max(1, Math.min(qty, max)) };
      })
    );
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (unifiedItems.length === 0) return;

    // If agent collects payment directly, show confirmation dialog
    const agentCollects = !isHqCollector || (!showCollectorOption);
    if (agentCollects && paymentMethod) {
      setShowConfirmDialog(true);
      return;
    }

    submitSale();
  }

  async function submitSale() {
    setSubmitting(true);
    try {
      // Upload proof of payment if provided
      let paymentProofStorageId: Id<"_storage"> | undefined;
      if (paymentProofFile && needsProofOfPayment) {
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

      const paymentMethodValue = paymentMethod
        ? (paymentMethod as "cash" | "qr" | "bank_transfer" | "online" | "other")
        : undefined;
      const amountReceivedValue = amountReceived
        ? parseFloat(amountReceived)
        : undefined;

      let saleId: Id<"sales">;

      if (isDropship) {
        const fulfilledItems = unifiedItems
          .filter((li) => li.source === "agent_stock" && li.batchId)
          .map((li) => ({
            batchId: li.batchId!,
            productId: li.productId,
            quantity: li.quantity,
            fulfillmentSource: "agent_stock" as const,
          }));

        const pendingItems = unifiedItems
          .filter((li) => li.source !== "agent_stock")
          .map((li) => ({
            productId: li.productId,
            quantity: li.quantity,
            fulfillmentSource: li.source,
          }));

        saleId = await recordDropship({
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
        });
      } else {
        const fulfilledItems = unifiedItems
          .filter((li) => li.source === "agent_stock" && li.batchId)
          .map((li) => ({
            batchId: li.batchId!,
            productId: li.productId,
            quantity: li.quantity,
          }));

        const pendingItems = unifiedItems
          .filter((li) => li.source !== "agent_stock")
          .map((li) => ({
            productId: li.productId,
            quantity: li.quantity,
            fulfillmentSource: li.source,
          }));

        saleId = await recordSale({
          fulfilledItems: fulfilledItems.length > 0 ? fulfilledItems : undefined,
          pendingItems: pendingItems.length > 0 ? pendingItems : undefined,
          saleChannel: channel,
          customerDetail,
          stockModel: stockModel as "hold_paid" | "consignment" | "dropship",
          paymentCollector: isConsignment ? paymentCollector : undefined,
          offerId,
          notes: notes || undefined,
          saleDate: saleDateTs,
          interestId: interestId ?? undefined,
          paymentMethod: paymentMethodValue,
          paymentProofStorageId,
          amountReceived: amountReceivedValue,
        });
      }

      // Auto-fulfill items that the agent selected from HQ inventory
      const hqAutoFulfillItems = unifiedItems.filter(
        (li) => li.source !== "agent_stock" && li.hqBatchId
      );
      if (hqAutoFulfillItems.length > 0) {
        // LineItems in the sale: fulfilled items first, then pending items (in order).
        // We need to find the index of each hq_transfer item in the pending group.
        const fulfilledCount = unifiedItems.filter(
          (li) => li.source === "agent_stock" && li.batchId
        ).length;
        const pendingItemsList = unifiedItems.filter(
          (li) => li.source !== "agent_stock"
        );
        const autoFulfillPayload: { lineItemIndex: number; batchId: Id<"batches">; quantity: number }[] = [];
        pendingItemsList.forEach((li, pendingIdx) => {
          if (li.hqBatchId) {
            autoFulfillPayload.push({
              lineItemIndex: fulfilledCount + pendingIdx,
              batchId: li.hqBatchId,
              quantity: li.quantity,
            });
          }
        });
        if (autoFulfillPayload.length > 0) {
          await selfFulfillFromHQ({ saleId, items: autoFulfillPayload });
        }
      }

      if (interestId) {
        await markConverted({ interestId, saleId });
      }

      toast.success("Sale recorded successfully");
      router.push("/dashboard/my-sales");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record sale");
    } finally {
      setSubmitting(false);
      setUploadingProof(false);
    }
  }

  // Available items for the "Add" dropdown
  const availableInventory = activeInventory.filter(
    (inv) => !usedInventoryIds.has(inv._id) && inv.quantity > 0
  );

  // Agent's own inventory (available even in dropship mode)
  const availableAgentInventory = isDropship
    ? inventory.filter(
        (inv) => !usedInventoryIds.has(inv._id) && inv.quantity > 0
      )
    : [];

  // HQ inventory available for auto-fulfill (salesperson only, non-dropship)
  const isSalesperson = userRole === "sales";
  const usedHQBatchIds = new Set(
    unifiedItems.filter((li) => li.hqBatchId).map((li) => li.hqBatchId!)
  );
  const availableHQInventory = isSalesperson && !isDropship
    ? (businessInventory ?? []).filter(
        (inv) => inv.quantity > 0 && !usedHQBatchIds.has(inv.batchId)
      )
    : [];

  // Sellable products not already added as pending items
  const sellableProducts = (products ?? []).filter(
    (p) => !usedProductIds.has(p._id)
  );

  const hasPendingItems = unifiedItems.some((li) => li.source !== "agent_stock");
  const hasItems = unifiedItems.length > 0;

  return (
    <form onSubmit={handleFormSubmit}>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>
            {interestId ? "Convert Interest to Sale" : "Record a Sale"}
          </CardTitle>
          {interest && (
            <p className="text-sm text-muted-foreground">
              Interest from {interest.customerDetail.name}:{" "}
              {interest.items
                .map((item) => {
                  const product = productMap.get(item.productId);
                  return `${product?.name ?? "Unknown"} x${item.quantity}`;
                })
                .join(", ")}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sale Details + Customer Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="saleDate">Sale Date</Label>
                <Input
                  id="saleDate"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  max={formatDateForInput(Date.now())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="saleChannel">Sale Channel</Label>
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
              <div className="space-y-2">
                <Label>Stock Model</Label>
                <Select
                  value={stockModel}
                  onValueChange={(v) => {
                    if (!v) return;
                    setStockModel(v);
                    setSelectedOfferId("");
                    setPaymentCollector("agent");

                    // Re-detect fulfillment sources for existing items instead of clearing
                    const newIsDropship = v === "dropship";
                    const newActiveInventory = newIsDropship ? (businessInventory ?? []) : inventory;
                    const newUsedInvIds = new Set<string>();

                    setUnifiedItems((prev) =>
                      prev.map((item) => {
                        // Try to find matching inventory in the new active inventory
                        const inv = newActiveInventory.find(
                          (i) =>
                            i.productId === item.productId &&
                            i.quantity > 0 &&
                            !newUsedInvIds.has(i._id)
                        );

                        if (inv) {
                          newUsedInvIds.add(inv._id);
                          const batch = batchMap.get(inv.batchId);
                          return {
                            ...item,
                            source: newIsDropship ? "hq_transfer" as FulfillmentSource : "agent_stock" as FulfillmentSource,
                            batchId: inv.batchId,
                            inventoryId: inv._id,
                            maxQuantity: inv.quantity,
                            batchCode: batch?.batchCode ?? "?",
                            quantity: Math.min(item.quantity, inv.quantity),
                            hqBatchId: undefined,
                            hqBatchCode: undefined,
                            hqMaxQuantity: undefined,
                          };
                        }

                        // No inventory available — re-detect source without inventory
                        const product = productMap.get(item.productId);
                        if (product?.status === "future_release") {
                          const hqInv = (businessInventory ?? []).find(
                            (i) => i.productId === item.productId && i.quantity > 0
                          );
                          return {
                            ...item,
                            source: (hqInv ? "hq_transfer" : "future_release") as FulfillmentSource,
                            batchId: undefined,
                            inventoryId: undefined,
                            maxQuantity: undefined,
                            batchCode: undefined,
                            hqBatchId: undefined,
                            hqBatchCode: undefined,
                            hqMaxQuantity: undefined,
                          };
                        }

                        const hqInv = (businessInventory ?? []).find(
                          (i) => i.productId === item.productId && i.quantity > 0
                        );
                        return {
                          ...item,
                          source: (hqInv ? "hq_transfer" : "pending_batch") as FulfillmentSource,
                          batchId: undefined,
                          inventoryId: undefined,
                          maxQuantity: undefined,
                          batchCode: undefined,
                          hqBatchId: undefined,
                          hqBatchCode: undefined,
                          hqMaxQuantity: undefined,
                        };
                      })
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {STOCK_MODEL_LABELS[stockModel] ?? "Select model"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hold_paid">Hold &amp; Paid</SelectItem>
                    <SelectItem value="consignment">Consignment</SelectItem>
                    <SelectItem value="dropship">Dropship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {showCollectorOption && (
                <div className="space-y-2">
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
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes..."
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Full name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone number"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Email address"
                  required
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Unified Items Table */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Items</Label>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="w-[100px]">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const hasActiveOffer = pricing?.offer != null && pricing.offerTotal !== null && pricing.bundles.length > 0;

                  // Helper to render an item row
                  const renderItemRow = (
                    li: UnifiedLineItem,
                    index: number,
                    options: { indented?: boolean; showPrice?: boolean }
                  ) => {
                    const product = productMap.get(li.productId);
                    const basePrice = product?.price ?? 0;
                    const badge = SOURCE_BADGES[li.source];
                    return (
                      <TableRow
                        key={`${li.productId}-${li.inventoryId ?? li.source}-${index}`}
                        className={options.indented ? "bg-muted/30" : undefined}
                      >
                        <TableCell className={options.indented ? "pl-8 font-medium" : "font-medium"}>
                          {li.productName}
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
                          {li.source === "agent_stock" || li.hqBatchId ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min={1}
                                max={li.maxQuantity ?? li.hqMaxQuantity}
                                value={li.quantity}
                                onChange={(e) =>
                                  updateQuantity(index, parseInt(e.target.value) || 1)
                                }
                                className="w-16 h-8"
                              />
                              <span className="text-xs text-muted-foreground">
                                / {li.maxQuantity ?? li.hqMaxQuantity}
                              </span>
                            </div>
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              value={li.quantity}
                              onChange={(e) =>
                                updateQuantity(index, parseInt(e.target.value) || 1)
                              }
                              className="w-20 h-8"
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {options.showPrice
                            ? `RM${(basePrice * li.quantity).toFixed(2)}`
                            : ""}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeItem(index)}
                          >
                            <TrashIcon className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  };

                  const rows: React.ReactNode[] = [];

                  if (hasActiveOffer) {
                    // Render each bundle as its own group
                    pricing.bundles.forEach((bundle, bIdx) => {
                      // Bundle header row
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

                      // Bundled items under this bundle (indented, no price)
                      for (const idx of bundle.itemIndices) {
                        rows.push(renderItemRow(unifiedItems[idx], idx, { indented: true, showPrice: false }));
                      }
                    });

                    // Non-bundled items (remainder + non-eligible) at regular price
                    for (const idx of pricing.nonBundledIndices) {
                      rows.push(renderItemRow(unifiedItems[idx], idx, { showPrice: true }));
                    }
                  } else {
                    // No offer — show all items with regular prices
                    unifiedItems.forEach((li, index) => {
                      rows.push(renderItemRow(li, index, { showPrice: true }));
                    });
                  }

                  return rows;
                })()}

                {/* Add from agent's own inventory (all modes) */}
                {(isDropship ? availableAgentInventory : availableInventory).length > 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6}>
                      <Select value="" onValueChange={(v) => v && (isDropship ? addFromOwnInventory(v) : addItem(v))}>
                        <SelectTrigger className="w-full md:w-[350px]">
                          <SelectValue placeholder="Add from your inventory..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(isDropship ? availableAgentInventory : availableInventory).map((inv) => {
                            const product = productMap.get(inv.productId);
                            const batch = batchMap.get(inv.batchId);
                            return (
                              <SelectItem key={inv._id} value={inv._id}>
                                {product?.name ?? "Unknown"} — Batch{" "}
                                {batch?.batchCode ?? "?"} (avail: {inv.quantity})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                )}

                {/* Add from HQ inventory — auto-fulfill (non-dropship: pull from HQ + fulfill in 1 click) */}
                {!isDropship && availableHQInventory.length > 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6}>
                      <Select value="" onValueChange={(v) => v && addFromHQAutoFulfill(v)}>
                        <SelectTrigger className="w-full md:w-[350px]">
                          <SelectValue placeholder="Add from HQ stock (auto-fulfill)..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableHQInventory.map((inv) => {
                            const product = productMap.get(inv.productId);
                            const batch = batchMap.get(inv.batchId);
                            return (
                              <SelectItem key={inv._id} value={inv._id}>
                                {product?.name ?? "Unknown"} — Batch{" "}
                                {batch?.batchCode ?? "?"} (HQ: {inv.quantity})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                )}

                {/* Add from HQ inventory (dropship — pending hq_transfer) */}
                {isDropship && availableInventory.length > 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6}>
                      <Select value="" onValueChange={(v) => v && addItem(v)}>
                        <SelectTrigger className="w-full md:w-[350px]">
                          <SelectValue placeholder="Add from HQ inventory (pending transfer)..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableInventory.map((inv) => {
                            const product = productMap.get(inv.productId);
                            const batch = batchMap.get(inv.batchId);
                            return (
                              <SelectItem key={inv._id} value={inv._id}>
                                {product?.name ?? "Unknown"} — Batch{" "}
                                {batch?.batchCode ?? "?"} (avail: {inv.quantity})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                )}

                {/* Add product without stock (pending/future release) */}
                {sellableProducts.length > 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6}>
                      <Select value="" onValueChange={(v) => v && addPendingProduct(v)}>
                        <SelectTrigger className="w-full md:w-[350px]">
                          <SelectValue placeholder="Add product (no stock needed)..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sellableProducts.map((product) => (
                            <SelectItem key={product._id} value={product._id}>
                              {product.name} — RM{product.price.toFixed(2)}
                              {product.status === "future_release" && " (Future Release)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                )}

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
          </div>

          {/* Offer selection */}
          {applicableOffers && applicableOffers.length > 0 && (
            <div className="space-y-2">
              <Label>Apply Offer</Label>
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
          )}

          <Separator />

          {/* Payment Details */}
          {hasItems && (
            <div className="space-y-4">
              <Label className="text-base font-medium">Payment</Label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Payment Method</Label>
                  <Select
                    value={paymentMethod || "none"}
                    onValueChange={(v) => {
                      setPaymentMethod(v === "none" || !v ? "" : v);
                      if (v === "cash" || v === "none" || !v) {
                        clearPaymentProof();
                        setAmountReceived("");
                      }
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
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="qr">QR Payment</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount received — shown when HQ collects via non-cash */}
                {isHqCollector && showCollectorOption && needsProofOfPayment && pricing && (
                  <div className="space-y-2">
                    <Label htmlFor="amountReceived">Amount Received (RM)</Label>
                    <Input
                      id="amountReceived"
                      type="number"
                      step="0.01"
                      min={0}
                      value={amountReceived || (pricing.offerTotal ?? pricing.defaultTotal).toFixed(2)}
                      onChange={(e) => setAmountReceived(e.target.value)}
                    />
                    {(() => {
                      const total = pricing.offerTotal ?? pricing.defaultTotal;
                      const received = parseFloat(amountReceived);
                      if (!isNaN(received) && received > total) {
                        const overpayment = (received - total).toFixed(2);
                        return (
                          <p className="text-sm text-muted-foreground">
                            Overpayment of <span className="font-medium text-foreground">RM{overpayment}</span> — company keeps the change.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>

              {/* Proof of payment upload — shown for QR/bank transfer, required only when HQ collects */}
              {isNonCashPayment && (
                <div className="space-y-2">
                  <Label>
                    Proof of Payment
                    {needsProofOfPayment && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {needsProofOfPayment
                      ? "Upload a receipt or screenshot of the payment."
                      : "Optional — upload a receipt or screenshot for your records."}
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
            </div>
          )}

          <Separator />

          {/* Submit */}
          <div className="flex justify-end gap-3">
            {hasPendingItems && (
              <p className="text-sm text-muted-foreground self-center mr-auto">
                Some items need fulfillment later. Settlement created now.
              </p>
            )}
            <Button
              type="submit"
              disabled={
                !hasItems ||
                !saleChannel ||
                !customerName ||
                !customerPhone ||
                !customerEmail ||
                (needsProofOfPayment && !paymentProofFile) ||
                submitting ||
                uploadingProof
              }
            >
              {uploadingProof
                ? "Uploading..."
                : submitting
                  ? "Recording..."
                  : "Record Sale"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation dialog when agent/salesperson collects payment */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Sale</AlertDialogTitle>
            <AlertDialogDescription>
              You are recording a sale where you collected the payment directly
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
              . The total amount is{" "}
              <span className="font-medium">
                RM{pricing ? (pricing.offerTotal ?? pricing.defaultTotal).toFixed(2) : "0.00"}
              </span>
              . Please confirm this is correct.
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
              Confirm &amp; Record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
