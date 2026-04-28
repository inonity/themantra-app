"use client";

import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { UploadIcon, CameraIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useStoreUserEffect";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  qr: "QR Payment",
  bank_transfer: "Bank Transfer",
  online: "Online",
  other: "Other",
};

type PaymentMethod = "cash" | "qr" | "bank_transfer" | "online" | "other";

export function RecordPaymentDialog({
  sale,
  open,
  onOpenChange,
}: {
  sale: Doc<"sales">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const markPaid = useMutation(api.sales.markPaid);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const currentUser = useCurrentUser();
  const sellerProfile = useQuery(
    api.agentProfiles.getByAgentId,
    sale.sellerId ? { agentId: sale.sellerId } : "skip"
  );
  const sellerDisplayName = useQuery(
    api.users.getDisplayNameById,
    sale.sellerId ? { userId: sale.sellerId } : "skip"
  );

  const remaining = Math.round((sale.totalAmount - sale.amountPaid) * 100) / 100;

  // Resolve who collects this payment. Default to "agent" when not set (hold_paid).
  const paymentCollector = sale.paymentCollector ?? "agent";
  const hqCollects = paymentCollector === "hq";
  const sellerCollects = !hqCollects;

  // Allowed methods mirror the record-sale form rules.
  const allowedMethods = useMemo<PaymentMethod[]>(
    () => (sellerCollects ? ["cash", "qr"] : ["cash", "qr", "bank_transfer"]),
    [sellerCollects]
  );

  const [amount, setAmount] = useState<string>(remaining.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>(
    (sale.paymentMethod as PaymentMethod | undefined) ?? "cash"
  );
  const [customerPaidMore, setCustomerPaidMore] = useState(false);
  const [overpaymentRecipient, setOverpaymentRecipient] = useState<"seller" | "hq">("hq");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isNonCash = method === "qr" || method === "bank_transfer";
  const isSalesperson = currentUser?.role === "sales";

  // Compute overpayment in real time when "customer paid more" is checked
  const parsedAmount = parseFloat(amount);
  const overpaymentAmt = customerPaidMore && !isNaN(parsedAmount) && parsedAmount > remaining
    ? Math.round((parsedAmount - remaining) * 100) / 100
    : 0;
  // Recipient picker only matters when overpayment exists AND user is sales role
  // (sales role explicitly chooses; for agents the default "seller" applies).
  const showOverpaymentRecipient = overpaymentAmt > 0 && isSalesperson;

  // Determine the receiver label
  const isCurrentUserSeller =
    !!currentUser && !!sale.sellerId && currentUser._id === sale.sellerId;
  const sellerName = sellerDisplayName ?? "the seller";
  const receiverLabel = hqCollects
    ? "HQ"
    : isCurrentUserSeller
      ? "You"
      : sellerName;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Max 5MB.");
      return;
    }
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = () => setProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearProof() {
    setProofFile(null);
    setProofPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    // Without "customer paid more" checked, cap at remaining balance
    if (!customerPaidMore && parsed > remaining) {
      toast.error(`Amount exceeds outstanding balance of RM${remaining.toFixed(2)}`);
      return;
    }
    // With "customer paid more" checked, the amount must clear the full balance
    if (customerPaidMore && parsed < remaining) {
      toast.error(`Overpayment requires clearing the full RM${remaining.toFixed(2)} balance`);
      return;
    }

    // Split the typed amount into the payment-against-balance + overpayment
    const paymentAgainstBalance = customerPaidMore ? remaining : parsed;
    const overpayment = customerPaidMore ? Math.round((parsed - remaining) * 100) / 100 : 0;

    setSubmitting(true);
    try {
      let paymentProofStorageId: Id<"_storage"> | undefined;
      if (proofFile && isNonCash) {
        setUploadingProof(true);
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": proofFile.type },
          body: proofFile,
        });
        if (!result.ok) throw new Error("Failed to upload proof of payment");
        const { storageId } = await result.json();
        paymentProofStorageId = storageId;
        setUploadingProof(false);
      }

      await markPaid({
        saleId: sale._id,
        amountPaid: paymentAgainstBalance,
        paymentMethod: method,
        paymentProofStorageId,
        overpaymentAmount: overpayment > 0 ? overpayment : undefined,
        overpaymentRecipient: overpayment > 0
          ? (isSalesperson ? overpaymentRecipient : "seller")
          : undefined,
      });
      toast.success(
        overpayment > 0
          ? `Sale fully paid, overpayment of RM${overpayment.toFixed(2)} recorded`
          : paymentAgainstBalance >= remaining
            ? "Sale marked as fully paid"
            : `Recorded RM${paymentAgainstBalance.toFixed(2)} payment`
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to record payment"));
    } finally {
      setSubmitting(false);
      setUploadingProof(false);
    }
  }

  const phoneLast4 = (sale.customerDetail?.phone ?? "").replace(/\D/g, "").slice(-4) || "XXXX";
  const bankReference = (() => {
    const d = new Date(sale.saleDate);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `TM-BT-${yy}${mm}${dd}-${phoneLast4}`;
  })();

  const enlargedQrSrc =
    sellerCollects && sellerProfile?.paymentQrUrl
      ? sellerProfile.paymentQrUrl
      : "/qr-payment.png";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="flex flex-col gap-4 sm:max-w-md">
          <DialogTitle>QR Payment</DialogTitle>
          <div className="flex flex-1 items-center justify-center px-4 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="QR Payment" src={enlargedQrSrc} className="h-auto block" />
          </div>
        </DialogContent>
      </Dialog>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            {sale.customerDetail?.name
              ? `Payment from ${sale.customerDetail.name}`
              : "Customer payment"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Outstanding summary */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">RM{sale.totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Already paid</span>
              <span className="font-medium">RM{sale.amountPaid.toFixed(2)}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Outstanding</span>
              <span className="font-semibold">RM{remaining.toFixed(2)}</span>
            </div>
          </div>

          {/* Receiver indicator */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Payment received by</span>
            <Badge variant="outline">{receiverLabel}</Badge>
          </div>

          {/* Payment method + amount */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2 flex-1 min-w-[150px]">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={method} onValueChange={(v) => v && setMethod(v as PaymentMethod)}>
                <SelectTrigger id="payment-method">
                  <SelectValue>{METHOD_LABELS[method]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {allowedMethods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex-1 min-w-[150px]">
              <Label htmlFor="payment-amount">Amount Received (RM)</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min={0}
                max={customerPaidMore ? undefined : remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {customerPaidMore
                  ? `Min: RM${remaining.toFixed(2)} (full balance)`
                  : `Max: RM${remaining.toFixed(2)}`}
              </p>
            </div>
          </div>

          {/* Overpayment toggle */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="customer-paid-more"
                checked={customerPaidMore}
                onCheckedChange={(checked) => {
                  const next = !!checked;
                  setCustomerPaidMore(next);
                  if (next) {
                    // Pre-fill with the remaining balance so they can edit upward
                    setAmount(remaining.toFixed(2));
                  } else {
                    setAmount(remaining.toFixed(2));
                  }
                }}
              />
              <Label htmlFor="customer-paid-more" className="cursor-pointer text-sm">
                Customer paid more than RM{remaining.toFixed(2)}
              </Label>
            </div>
            {overpaymentAmt > 0 && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Overpayment</span>
                  <span className="font-semibold">RM{overpaymentAmt.toFixed(2)}</span>
                </div>
                {showOverpaymentRecipient ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Overpayment goes to</Label>
                    <Select
                      value={overpaymentRecipient}
                      onValueChange={(v) => v && setOverpaymentRecipient(v as "seller" | "hq")}
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
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {hqCollects
                      ? isCurrentUserSeller
                        ? "Will be transferred to you as commission."
                        : `Will be transferred to ${sellerName} as commission.`
                      : isCurrentUserSeller
                        ? "Stays with you (you collected the payment)."
                        : `Stays with ${sellerName} (they collected the payment).`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* HQ QR */}
          {hqCollects && method === "qr" && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium">HQ QR — show to customer</p>
              <button
                type="button"
                onClick={() => setShowQrDialog(true)}
                className="block rounded-lg border overflow-hidden hover:opacity-75 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring mx-auto"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/qr-payment.png"
                  alt="HQ QR Payment"
                  className="h-48 w-48 object-contain"
                />
              </button>
              <p className="text-xs text-muted-foreground text-center">Tap to enlarge</p>
            </div>
          )}

          {/* Seller's own QR */}
          {sellerCollects && method === "qr" && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              {sellerProfile?.paymentQrUrl ? (
                <>
                  <p className="text-sm font-medium">
                    {isCurrentUserSeller ? "Your QR" : `${sellerName}'s QR`} — show to customer
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowQrDialog(true)}
                    className="block rounded-lg border overflow-hidden hover:opacity-75 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring mx-auto"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sellerProfile.paymentQrUrl}
                      alt="Seller QR"
                      className="h-48 w-48 object-contain"
                    />
                  </button>
                  <p className="text-xs text-muted-foreground text-center">Tap to enlarge</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center">
                  {isCurrentUserSeller
                    ? "No QR uploaded yet. Add one in Settings → Payment Preferences."
                    : `${sellerName} hasn't uploaded a QR.`}
                </p>
              )}
            </div>
          )}

          {/* HQ Bank Transfer */}
          {hqCollects && method === "bank_transfer" && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Transfer to
                </p>
                <p className="font-semibold text-base">Inonity Sdn Bhd</p>
                <p className="text-sm text-muted-foreground">RHB Bank</p>
                <p className="font-mono font-semibold text-base tracking-widest">
                  2660 1600 025125
                </p>
              </div>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Payment Reference
                </p>
                <p className="font-mono font-bold text-base tracking-widest">{bankReference}</p>
              </div>
            </div>
          )}

          {/* Proof of payment — optional */}
          {isNonCash && (
            <div className="space-y-2">
              <Label>Proof of Payment</Label>
              <p className="text-xs text-muted-foreground">
                Optional — upload a receipt or screenshot for your records.
              </p>
              {proofPreview ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofPreview}
                    alt="Payment proof preview"
                    className="max-h-40 rounded-lg border object-contain"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 size-6"
                    onClick={clearProof}
                  >
                    <XIcon />
                  </Button>
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
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadIcon data-icon="inline-start" />
                    Upload File
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting || uploadingProof}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || uploadingProof}>
            {uploadingProof
              ? "Uploading..."
              : submitting
                ? "Saving..."
                : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
