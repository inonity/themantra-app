"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { useCurrentUser } from "@/hooks/useStoreUserEffect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  BanknoteIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react";
import { useState, useMemo } from "react";

type SortCol = "direction" | "amount" | "status" | "payment_date" | "confirmed";
type SortDir = "asc" | "desc";

function SortableHead({
  label,
  column,
  sortCol,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortCol;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
}) {
  const isActive = sortCol === column;
  return (
    <TableHead>
      <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => onSort(column)}>
        {label}
        {isActive ? (
          sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />
        ) : (
          <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />
        )}
      </Button>
    </TableHead>
  );
}
import type { Doc } from "../../../../../convex/_generated/dataModel";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? (
        <>
          <CheckIcon className="h-4 w-4 mr-1" />
          Copied
        </>
      ) : (
        <>
          <CopyIcon className="h-4 w-4 mr-1" />
          Copy
        </>
      )}
    </Button>
  );
}

function paymentStatusBadge(status: string) {
  const variant =
    status === "paid"
      ? "default"
      : status === "submitted"
        ? "secondary"
        : "destructive";
  const label =
    status === "paid"
      ? "Confirmed"
      : status === "submitted"
        ? "Awaiting Confirmation"
        : "Pending";
  return <Badge variant={variant}>{label}</Badge>;
}

const CHANNEL_LABELS: Record<string, string> = {
  direct: "Direct",
  agent: "Agent",
  tiktok: "TikTok",
  shopee: "Shopee",
  other: "Other",
};

function stockModelLabel(model?: string) {
  switch (model) {
    case "hold_paid":
      return "Hold & Paid";
    case "consignment":
      return "Consignment";
    case "presell":
    case "dropship":
      return "Pre-sell";
    default:
      return "—";
  }
}

function CommissionBreakdownRow({
  sale,
}: {
  sale: {
    _id: string;
    saleDate: number;
    customerDetail?: { name: string } | null;
    saleChannel: string;
    stockModel?: string;
    totalAmount: number;
    hqPrice?: number;
    agentCommission?: number;
    offerId?: string;
    offerName?: string;
    offerBundlePrice?: number;
    offerMinQuantity?: number;
    offerHqBundlePrice?: number;
    offerSizeMl?: number;
    lineItemsWithProducts?: {
      productId: string;
      variantId?: string;
      productName: string;
      variantName?: string;
      quantity: number;
      unitPrice?: number;
      retailPrice: number;
      hqUnitPrice?: number;
      variantSizeMl?: number;
    }[];
    hqUnitPriceMap?: Record<string, number>;
    overpaymentAmount?: number;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const items = sale.lineItemsWithProducts ?? [];

  // Build hqMap keyed by variantId ?? productId to correctly handle
  // multiple variants of the same product with different HQ prices
  const hqMap: Record<string, number> = { ...(sale.hqUnitPriceMap ?? {}) };
  for (const item of items) {
    const key = item.variantId ?? item.productId;
    if (!(key in hqMap) && item.hqUnitPrice !== undefined) {
      hqMap[key] = item.hqUnitPrice;
    }
  }

  const isOffer = !!sale.offerName;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="w-8">
          {expanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell className="text-sm">
          {new Date(sale.saleDate).toLocaleDateString()}
        </TableCell>
        <TableCell className="text-sm">
          {sale.customerDetail?.name ?? "—"}
        </TableCell>
        <TableCell className="text-sm">
          {items.length > 0 ? (
            <div className="space-y-0.5">
              {items.map(
                (item, i) => (
                  <div key={i} className="text-xs">
                    {item.productName}{item.variantName ? ` — ${item.variantName}` : ""}{" "}
                    <span className="text-muted-foreground">
                      x{item.quantity}
                    </span>
                  </div>
                )
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant="outline">{CHANNEL_LABELS[sale.saleChannel] ?? sale.saleChannel}</Badge>
        </TableCell>
        <TableCell className="text-sm">
          {stockModelLabel(sale.stockModel)}
        </TableCell>
        <TableCell className="text-right text-sm">
          RM {sale.totalAmount.toFixed(2)}
        </TableCell>
        <TableCell className="text-right text-sm">
          RM {((sale as { computedHqPrice?: number }).computedHqPrice ?? sale.hqPrice ?? 0).toFixed(2)}
        </TableCell>
        <TableCell className="text-right text-sm text-green-600">
          RM {(((sale as { computedCommission?: number }).computedCommission ?? sale.agentCommission ?? 0) + (sale.overpaymentAmount ?? 0)).toFixed(2)}
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30 px-6 py-4">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Commission Breakdown</h4>

              {isOffer ? (
                /* Offer sale: split bundled vs non-bundled items */
                (() => {
                  const minQty = sale.offerMinQuantity ?? 1;
                  const bundlePrice = sale.offerBundlePrice ?? 0;
                  const offerSizeMl = sale.offerSizeMl;

                  type ExpandedUnit = { itemIdx: number; productName: string; variantName?: string; productId: string; variantId?: string; retailPrice: number; eligible: boolean };

                  // Expand items into individual units, marking each as eligible (matches offer sizeMl) or not
                  const expandedUnits: ExpandedUnit[] = [];
                  for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const eligible = offerSizeMl == null
                      || item.variantSizeMl == null
                      || item.variantSizeMl === offerSizeMl;
                    for (let u = 0; u < item.quantity; u++) {
                      expandedUnits.push({
                        itemIdx: i,
                        productName: item.productName,
                        variantName: item.variantName,
                        productId: item.productId,
                        variantId: item.variantId,
                        retailPrice: item.retailPrice,
                        eligible,
                      });
                    }
                  }

                  const eligibleUnits = expandedUnits.filter((u) => u.eligible);
                  const bundleCount = Math.floor(eligibleUnits.length / minQty);
                  const bundledQty = bundleCount * minQty;

                  // Collect bundled items from the first bundledQty eligible units
                  const bundledItems: { productName: string; variantName?: string; quantity: number; retailPrice: number }[] = [];
                  const bundledMap = new Map<string, { productName: string; variantName?: string; quantity: number; retailPrice: number }>();
                  for (let i = 0; i < bundledQty; i++) {
                    const unit = eligibleUnits[i];
                    const mapKey = unit.variantId ?? unit.productId;
                    const existing = bundledMap.get(mapKey);
                    if (existing) {
                      existing.quantity += 1;
                    } else {
                      const entry = { productName: unit.productName, variantName: unit.variantName, quantity: 1, retailPrice: unit.retailPrice };
                      bundledMap.set(mapKey, entry);
                      bundledItems.push(entry);
                    }
                  }

                  // Collect remainder: eligible units past bundledQty + all ineligible units
                  const remainderItems: { productName: string; variantName?: string; productId: string; variantId?: string; quantity: number; retailPrice: number }[] = [];
                  const remainderMap = new Map<string, { productName: string; variantName?: string; productId: string; variantId?: string; quantity: number; retailPrice: number }>();
                  const remainderUnits = [
                    ...eligibleUnits.slice(bundledQty),
                    ...expandedUnits.filter((u) => !u.eligible),
                  ];
                  for (const unit of remainderUnits) {
                    const mapKey = unit.variantId ?? unit.productId;
                    const existing = remainderMap.get(mapKey);
                    if (existing) {
                      existing.quantity += 1;
                    } else {
                      const entry = { productName: unit.productName, variantName: unit.variantName, productId: unit.productId, variantId: unit.variantId, quantity: 1, retailPrice: unit.retailPrice };
                      remainderMap.set(mapKey, entry);
                      remainderItems.push(entry);
                    }
                  }

                  const bundledAmount = bundleCount * bundlePrice;
                  // Use offer's HQ bundle price; default to full bundle price (no offer pricing = HQ takes all)
                  const hqPerBundle = sale.offerHqBundlePrice ?? bundlePrice;
                  const bundledHqShare = Math.round(bundleCount * hqPerBundle * 100) / 100;
                  const bundledCommission = Math.round((bundledAmount - bundledHqShare) * 100) / 100;

                  // Pre-compute remainder HQ totals so we can sum for the totals row
                  const remainderHqTotal = remainderItems.reduce((sum, item) => {
                    const hqKey = item.variantId ?? item.productId;
                    return hqMap[hqKey] !== undefined
                      ? sum + Math.round(item.quantity * hqMap[hqKey] * 100) / 100
                      : sum;
                  }, 0);
                  const computedHqTotal = Math.round((bundledHqShare + remainderHqTotal) * 100) / 100;
                  const computedCommission = Math.round((sale.totalAmount - computedHqTotal) * 100) / 100;

                  return (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">HQ Share</TableHead>
                            <TableHead className="text-right">Commission</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Offer bundle header */}
                          <TableRow className="bg-muted/40">
                            <TableCell className="text-sm font-semibold">
                              <Badge variant="secondary" className="mr-2">Offer</Badge>
                              {sale.offerName}
                              <span className="text-muted-foreground font-normal ml-1">
                                ({minQty} for RM {bundlePrice.toFixed(2)})
                              </span>
                            </TableCell>
                            <TableCell />
                            <TableCell className="text-right text-sm font-semibold">
                              RM {bundledAmount.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {bundledHqShare !== null ? `RM ${bundledHqShare.toFixed(2)}` : ""}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium text-green-600">
                              {bundledCommission !== null ? `RM ${bundledCommission.toFixed(2)}` : ""}
                            </TableCell>
                          </TableRow>
                          {/* Bundled products (indented, no individual pricing) */}
                          {bundledItems.map((item, i) => (
                            <TableRow key={`b-${i}`}>
                              <TableCell className="text-sm pl-8 text-muted-foreground">
                                {item.productName}{item.variantName ? ` — ${item.variantName}` : ""}
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {item.quantity}
                              </TableCell>
                              <TableCell />
                              <TableCell />
                              <TableCell />
                            </TableRow>
                          ))}

                          {/* Remainder items (not in the offer) */}
                          {remainderItems.map((item, i) => {
                            const itemAmount = item.quantity * item.retailPrice;
                            const hqKey = item.variantId ?? item.productId;
                            const itemHq = hqMap[hqKey] !== undefined
                              ? Math.round(item.quantity * hqMap[hqKey] * 100) / 100
                              : null;
                            const itemCommission = itemHq !== null
                              ? Math.round((itemAmount - itemHq) * 100) / 100
                              : null;

                            return (
                              <TableRow key={`r-${i}`}>
                                <TableCell className="text-sm font-medium">
                                  {item.productName}{item.variantName ? ` — ${item.variantName}` : ""}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  {item.quantity}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  RM {itemAmount.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  {itemHq !== null ? `RM ${itemHq.toFixed(2)}` : ""}
                                </TableCell>
                                <TableCell className="text-right text-sm text-green-600 font-medium">
                                  {itemCommission !== null ? `RM ${itemCommission.toFixed(2)}` : ""}
                                </TableCell>
                              </TableRow>
                            );
                          })}

                          {/* Totals */}
                          <TableRow className="border-t">
                            <TableCell colSpan={2} className="text-sm text-right font-medium">
                              Sale Total
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              RM {sale.totalAmount.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              RM {computedHqTotal.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold text-green-600">
                              RM {computedCommission.toFixed(2)}
                            </TableCell>
                          </TableRow>
                          {sale.overpaymentAmount != null && sale.overpaymentAmount > 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-sm text-right font-medium text-green-600">
                                + Overpayment
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium text-green-600">
                                RM {sale.overpaymentAmount.toFixed(2)}
                              </TableCell>
                              <TableCell />
                              <TableCell />
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()
              ) : items.length > 0 ? (
                /* Non-offer sale: show per-item HQ price and commission */
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Retail Price</TableHead>
                        <TableHead className="text-right">Sale Price</TableHead>
                        <TableHead className="text-right">HQ Price</TableHead>
                        <TableHead className="text-right">Margin/Unit</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, i) => {
                        const saleUnitPrice = item.unitPrice ?? 0;
                        const hqUnitPrice = hqMap[item.variantId ?? item.productId] ?? 0;
                        const marginPerUnit = Math.round((saleUnitPrice - hqUnitPrice) * 100) / 100;
                        const lineCommission = Math.round(marginPerUnit * item.quantity * 100) / 100;

                        return (
                          <TableRow key={i}>
                            <TableCell className="text-sm font-medium">
                              {item.productName}{item.variantName ? ` — ${item.variantName}` : ""}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {item.quantity}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              RM {item.retailPrice.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              RM {saleUnitPrice.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              RM {hqUnitPrice.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              RM {marginPerUnit.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-green-600 font-medium">
                              RM {lineCommission.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals */}
                      <TableRow className="border-t">
                        <TableCell colSpan={6} className="text-sm text-right font-medium">
                          Sale Total
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          RM {sale.totalAmount.toFixed(2)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={6} className="text-sm text-right font-medium">
                          HQ Share
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          RM {(sale.hqPrice ?? 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={6} className="text-sm text-right font-semibold text-green-600">
                          Your Commission
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold text-green-600">
                          RM {(sale.agentCommission ?? 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                      {sale.overpaymentAmount != null && sale.overpaymentAmount > 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-sm text-right font-medium text-green-600">
                            + Overpayment
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-green-600">
                            RM {sale.overpaymentAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Sale Total: RM {sale.totalAmount.toFixed(2)}</p>
                  <p>HQ Share: RM {(sale.hqPrice ?? 0).toFixed(2)}</p>
                  <p className="font-medium text-green-600">
                    Your Commission = RM {(sale.agentCommission ?? 0).toFixed(2)}
                  </p>
                  {sale.overpaymentAmount != null && sale.overpaymentAmount > 0 && (
                    <p className="font-medium text-green-600">
                      + Overpayment = RM {sale.overpaymentAmount.toFixed(2)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function SettlementSalesTable({
  settlementId,
}: {
  settlementId: Doc<"agentSettlements">["_id"];
}) {
  const detail = useQuery(api.agentSettlements.getWithSales, { settlementId });

  if (!detail) {
    return <p className="text-sm text-muted-foreground py-4">Loading...</p>;
  }

  if (detail.sales.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No sales found.</p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-8" />
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Products</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Stock Model</TableHead>
            <TableHead className="text-right">Sale Total</TableHead>
            <TableHead className="text-right">HQ Share</TableHead>
            <TableHead className="text-right">You Receive</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.sales.map((sale) => (
            <CommissionBreakdownRow key={sale._id} sale={sale} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SettlementRow({
  settlement,
}: {
  settlement: Doc<"agentSettlements">;
}) {
  const [expanded, setExpanded] = useState(false);
  const detail = useQuery(
    api.agentSettlements.getWithSales,
    expanded ? { settlementId: settlement._id } : "skip"
  );

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell>
          {expanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell>
          <span className="font-mono text-sm font-semibold">
            {settlement.referenceId}
          </span>
          <CopyButton text={settlement.referenceId} />
        </TableCell>
        <TableCell>
          <Badge variant={settlement.direction === "hq_to_agent" ? "default" : "outline"}>
            {settlementDirectionLabel(settlement.direction)}
          </Badge>
        </TableCell>
        <TableCell>RM {settlement.totalAmount.toFixed(2)}</TableCell>
        <TableCell>{paymentStatusBadge(settlement.paymentStatus)}</TableCell>
        <TableCell>
          {settlement.paymentDate
            ? new Date(settlement.paymentDate).toLocaleDateString()
            : "—"}
        </TableCell>
        <TableCell>
          {settlement.confirmedAt
            ? new Date(settlement.confirmedAt).toLocaleDateString()
            : "—"}
        </TableCell>
      </TableRow>

      {expanded && detail && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/50 p-4">
            <div className="space-y-2">
              {settlement.agentNotes && (
                <p className="text-sm text-muted-foreground">
                  Your note: {settlement.agentNotes}
                </p>
              )}
              <h4 className="font-semibold text-sm">
                Included Sales ({detail.sales.length})
              </h4>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-8" />
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Stock Model</TableHead>
                      <TableHead className="text-right">Sale Total</TableHead>
                      <TableHead className="text-right">HQ Share</TableHead>
                      <TableHead className="text-right">You Receive</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.sales.map((sale) => (
                      <CommissionBreakdownRow key={sale._id} sale={sale} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function settlementDirectionLabel(direction?: string) {
  return direction === "hq_to_agent" ? "HQ → You" : "You → HQ";
}

function RecordPaymentDialog({
  settlement,
}: {
  settlement: Doc<"agentSettlements">;
}) {
  const submitPayment = useMutation(api.agentSettlements.submitPayment);
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [agentNotes, setAgentNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await submitPayment({
        settlementId: settlement._id,
        paymentDate: new Date(paymentDate).getTime(),
        agentNotes: agentNotes.trim() || undefined,
      });
      setOpen(false);
      setAgentNotes("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" onClick={() => setOpen(true)} />
        }
      >
        <BanknoteIcon className="h-4 w-4 mr-1" />
        Record Payment
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment to HQ</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p className="text-sm text-muted-foreground">Amount</p>
            <p className="text-2xl font-bold">
              RM {settlement.totalAmount.toFixed(2)}
            </p>
          </div>

          <div>
            <Label>Payment Date</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Textarea
              value={agentNotes}
              onChange={(e) => setAgentNotes(e.target.value)}
              placeholder="e.g. transferred via Maybank"
              rows={2}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Confirm Payment Made"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentPaymentsPage() {
  const user = useCurrentUser();
  const activeSettlement = useQuery(api.agentSettlements.getActiveSettlement);
  const activeCommission = useQuery(api.agentSettlements.getActiveCommission);
  const settlements = useQuery(api.agentSettlements.listMy);

  const [historySortCol, setHistorySortCol] = useState<SortCol>("payment_date");
  const [historySortDir, setHistorySortDir] = useState<SortDir>("desc");

  function handleHistorySort(col: SortCol) {
    if (historySortCol === col) {
      setHistorySortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setHistorySortCol(col);
      setHistorySortDir("asc");
    }
  }

  const isLoading =
    user === undefined ||
    activeSettlement === undefined ||
    activeCommission === undefined ||
    settlements === undefined;

  // History = submitted + paid settlements (not the active pending ones)
  const historySettlements = useMemo(() => {
    const base = (settlements ?? []).filter((s) => s.paymentStatus !== "pending");
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (historySortCol === "direction") {
        cmp = (a.direction ?? "").localeCompare(b.direction ?? "");
      } else if (historySortCol === "amount") {
        cmp = a.totalAmount - b.totalAmount;
      } else if (historySortCol === "status") {
        cmp = a.paymentStatus.localeCompare(b.paymentStatus);
      } else if (historySortCol === "payment_date") {
        cmp = (a.paymentDate ?? 0) - (b.paymentDate ?? 0);
      } else {
        cmp = (a.confirmedAt ?? 0) - (b.confirmedAt ?? 0);
      }
      return historySortDir === "asc" ? cmp : -cmp;
    });
  }, [settlements, historySortCol, historySortDir]);

  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Track what you owe HQ, commissions owed to you, and view payment history.
          </p>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Active Settlement Card — Agent owes HQ */}
              <Card>
                <CardHeader>
                  <CardTitle>Amount to Transfer to HQ</CardTitle>
                </CardHeader>
                <CardContent>
                  {activeSettlement ? (
                    <div className="space-y-3">
                      <div className="text-4xl font-bold text-destructive">
                        RM {activeSettlement.totalAmount.toFixed(2)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        From {activeSettlement.saleIds.length} sale
                        {activeSettlement.saleIds.length !== 1 ? "s" : ""} where you collected payment
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Reference ID:
                        </p>
                        <span className="font-mono text-sm font-bold">
                          {activeSettlement.referenceId}
                        </span>
                        <CopyButton text={activeSettlement.referenceId} />
                      </div>

                      <RecordPaymentDialog settlement={activeSettlement} />
                    </div>
                  ) : (
                    <div className="text-4xl font-bold text-green-600">
                      RM 0.00
                      <p className="text-sm font-normal text-muted-foreground mt-1">
                        All settled! No pending payments.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Commission from HQ Card — HQ owes agent */}
              <Card>
                <CardHeader>
                  <CardTitle>Commission from HQ</CardTitle>
                </CardHeader>
                <CardContent>
                  {activeCommission ? (
                    <div className="space-y-3">
                      <div className="text-4xl font-bold text-green-600">
                        RM {activeCommission.totalAmount.toFixed(2)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        From {activeCommission.saleIds.length} sale
                        {activeCommission.saleIds.length !== 1 ? "s" : ""} where
                        HQ collected payment
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Reference ID:
                        </p>
                        <span className="font-mono text-sm font-bold">
                          {activeCommission.referenceId}
                        </span>
                        <CopyButton text={activeCommission.referenceId} />
                      </div>
                    </div>
                  ) : (
                    <div className="text-4xl font-bold text-muted-foreground">
                      RM 0.00
                      <p className="text-sm font-normal text-muted-foreground mt-1">
                        No pending commissions.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sales Breakdown */}
            {(activeSettlement || activeCommission) && (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">Sales Breakdown</h2>
                <Tabs defaultValue={activeSettlement ? "to_hq" : "from_hq"}>
                  <TabsList>
                    <TabsTrigger value="to_hq" disabled={!activeSettlement}>
                      Payment to HQ
                      {activeSettlement && (
                        <Badge variant="secondary" className="ml-2">
                          {activeSettlement.saleIds.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="from_hq" disabled={!activeCommission}>
                      Commission from HQ
                      {activeCommission && (
                        <Badge variant="secondary" className="ml-2">
                          {activeCommission.saleIds.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="to_hq">
                    {activeSettlement && (
                      <SettlementSalesTable settlementId={activeSettlement._id} />
                    )}
                  </TabsContent>
                  <TabsContent value="from_hq">
                    {activeCommission && (
                      <SettlementSalesTable settlementId={activeCommission._id} />
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {/* Payment History */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Payment History</h2>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-8" />
                      <TableHead>Reference ID</TableHead>
                      <SortableHead label="Direction" column="direction" sortCol={historySortCol} sortDir={historySortDir} onSort={handleHistorySort} />
                      <SortableHead label="Total" column="amount" sortCol={historySortCol} sortDir={historySortDir} onSort={handleHistorySort} />
                      <SortableHead label="Status" column="status" sortCol={historySortCol} sortDir={historySortDir} onSort={handleHistorySort} />
                      <SortableHead label="Payment Date" column="payment_date" sortCol={historySortCol} sortDir={historySortDir} onSort={handleHistorySort} />
                      <SortableHead label="Confirmed" column="confirmed" sortCol={historySortCol} sortDir={historySortDir} onSort={handleHistorySort} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historySettlements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No payment history yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historySettlements.map((s) => (
                        <SettlementRow key={s._id} settlement={s} />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
