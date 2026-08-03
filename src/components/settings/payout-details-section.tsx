"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CameraIcon, UploadIcon, XIcon } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";
import {
  MALAYSIAN_BANK_GROUPS,
  OTHER_BANK_VALUE,
  isKnownBank,
} from "@/lib/malaysian-banks";

const PAYOUT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  qr: "QR / e-Wallet",
};

type PayoutMethod = "bank_transfer" | "qr";

export function PayoutDetailsSection({
  agentProfile,
  payoutQrUrl,
}: {
  agentProfile: Doc<"agentProfiles"> | null;
  payoutQrUrl: string | null;
}) {
  const updatePayoutDetails = useMutation(
    api.agentProfiles.updateMyPayoutDetails
  );
  const removeQr = useMutation(api.agentProfiles.removeMyPayoutQr);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const savedMethod = agentProfile?.payoutMethod ?? "";
  const savedBank = agentProfile?.payoutBankName ?? "";
  const savedAccountNo = agentProfile?.payoutBankAccountNumber ?? "";
  const savedHolder = agentProfile?.payoutBankAccountHolder ?? "";

  const [method, setMethod] = useState<PayoutMethod | "">(savedMethod);
  // The select holds either a known bank name or the "Other" sentinel; when it's
  // the sentinel the free-text field below carries the actual name.
  const [bankSelection, setBankSelection] = useState<string>(
    savedBank ? (isKnownBank(savedBank) ? savedBank : OTHER_BANK_VALUE) : ""
  );
  const [customBank, setCustomBank] = useState<string>(
    savedBank && !isKnownBank(savedBank) ? savedBank : ""
  );
  const [accountNo, setAccountNo] = useState(savedAccountNo);
  const [holder, setHolder] = useState(savedHolder);
  const [qrPreview, setQrPreview] = useState<string | null>(payoutQrUrl);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMethod(savedMethod);
    setBankSelection(
      savedBank ? (isKnownBank(savedBank) ? savedBank : OTHER_BANK_VALUE) : ""
    );
    setCustomBank(savedBank && !isKnownBank(savedBank) ? savedBank : "");
    setAccountNo(savedAccountNo);
    setHolder(savedHolder);
  }, [savedMethod, savedBank, savedAccountNo, savedHolder]);

  useEffect(() => {
    if (!pendingFile) setQrPreview(payoutQrUrl);
  }, [payoutQrUrl, pendingFile]);

  const bankName =
    bankSelection === OTHER_BANK_VALUE ? customBank.trim() : bankSelection;

  const dirty =
    method !== savedMethod ||
    bankName !== savedBank ||
    accountNo.trim() !== savedAccountNo ||
    holder.trim() !== savedHolder ||
    pendingFile !== null;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Max 5MB.");
      return;
    }
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = () => setQrPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearPendingFile() {
    setPendingFile(null);
    setQrPreview(payoutQrUrl);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRemoveExistingQr() {
    try {
      await removeQr();
      setQrPreview(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Payout QR removed");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove QR code"));
    }
  }

  async function handleSave() {
    const trimmedAccountNo = accountNo.replace(/[\s-]/g, "");
    if (trimmedAccountNo && !/^[0-9]{5,20}$/.test(trimmedAccountNo)) {
      toast.error("Account number must be 5–20 digits");
      return;
    }
    if (method === "bank_transfer" && (!bankName || !trimmedAccountNo)) {
      toast.error("Add your bank name and account number for bank transfers");
      return;
    }
    if (bankSelection === OTHER_BANK_VALUE && !customBank.trim()) {
      toast.error("Enter your bank name");
      return;
    }

    setSaving(true);
    try {
      let storageId: Id<"_storage"> | undefined;
      if (pendingFile) {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": pendingFile.type },
          body: pendingFile,
        });
        if (!result.ok) throw new Error("Failed to upload QR image");
        const { storageId: id } = (await result.json()) as {
          storageId: Id<"_storage">;
        };
        storageId = id;
      }
      await updatePayoutDetails({
        payoutMethod: method === "" ? undefined : method,
        payoutBankName: bankName || undefined,
        payoutBankAccountNumber: trimmedAccountNo || undefined,
        payoutBankAccountHolder: holder.trim() || undefined,
        payoutQrStorageId: storageId,
      });
      setAccountNo(trimmedAccountNo);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Payout details updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update payout details"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Commission Payout Details</CardTitle>
        <CardDescription>
          How HQ pays your commission to you. Bank details are only visible to
          you and HQ.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 sm:max-w-xs">
          <Label>Preferred payout method</Label>
          <Select
            value={method || "none"}
            onValueChange={(v) => {
              if (!v) return;
              setMethod(v === "none" ? "" : (v as PayoutMethod));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {method ? PAYOUT_METHOD_LABELS[method] : "No preference"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No preference</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="qr">QR / e-Wallet</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            HQ sees this when paying you out — fill in whichever details apply.
          </p>
        </div>

        <Separator />

        <div className="space-y-4">
          <div>
            <Label>Bank account</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Where HQ transfers your commission.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payout-bank">Bank name</Label>
              <Select
                value={bankSelection || "none"}
                onValueChange={(v) => {
                  if (!v) return;
                  setBankSelection(v === "none" ? "" : v);
                  if (v !== OTHER_BANK_VALUE) setCustomBank("");
                }}
              >
                <SelectTrigger id="payout-bank" className="w-full">
                  <SelectValue>
                    {bankSelection === OTHER_BANK_VALUE
                      ? "Other bank"
                      : bankSelection || "Select bank"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">Select bank</SelectItem>
                  {MALAYSIAN_BANK_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.banks.map((bank) => (
                        <SelectItem key={bank} value={bank}>
                          {bank}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  <SelectItem value={OTHER_BANK_VALUE}>Other bank</SelectItem>
                </SelectContent>
              </Select>
              {bankSelection === OTHER_BANK_VALUE && (
                <Input
                  value={customBank}
                  onChange={(e) => setCustomBank(e.target.value)}
                  placeholder="Enter bank name"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payout-account-no">Account number</Label>
              <Input
                id="payout-account-no"
                inputMode="numeric"
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value)}
                placeholder="e.g. 162034567890"
              />
              <p className="text-xs text-muted-foreground">
                Digits only — no spaces or dashes.
              </p>
            </div>
          </div>

          <div className="space-y-2 sm:max-w-sm">
            <Label htmlFor="payout-holder">Account holder name</Label>
            <Input
              id="payout-holder"
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder="Name as per bank account"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div>
            <Label>Payout QR (optional)</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Your DuitNow or e-wallet QR. HQ scans this when paying you by QR.
              Max 5MB image.
            </p>
          </div>

          {qrPreview ? (
            <div className="space-y-2">
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrPreview}
                  alt="Payout QR preview"
                  className="max-h-64 rounded-lg border object-contain"
                />
                {pendingFile && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 size-6"
                    onClick={clearPendingFile}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
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
                  Replace
                </Button>
                {!pendingFile && agentProfile?.payoutQrStorageId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveExistingQr}
                  >
                    <XIcon data-icon="inline-start" />
                    Remove
                  </Button>
                )}
              </div>
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

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
