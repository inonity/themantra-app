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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CameraIcon, UploadIcon, XIcon } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";

const COLLECTOR_LABELS: Record<string, string> = {
  agent: "I collect from customer",
  hq: "HQ collects directly",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  qr: "QR Payment",
  bank_transfer: "Bank Transfer",
};

type Collector = "agent" | "hq";
type PreferredMethod = "cash" | "qr" | "bank_transfer";

export function PaymentPreferencesSection({
  agentProfile,
  paymentQrUrl,
}: {
  agentProfile: Doc<"agentProfiles"> | null;
  paymentQrUrl: string | null;
}) {
  const updatePreferences = useMutation(
    api.agentProfiles.updateMyPaymentPreferences
  );
  const removeQr = useMutation(api.agentProfiles.removeMyPaymentQr);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [collector, setCollector] = useState<Collector | "">(
    agentProfile?.paymentCollectorPreference ?? ""
  );
  const [method, setMethod] = useState<PreferredMethod | "">(
    (agentProfile?.preferredPaymentMethod as PreferredMethod | undefined) ?? ""
  );
  const [qrPreview, setQrPreview] = useState<string | null>(paymentQrUrl);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCollector(agentProfile?.paymentCollectorPreference ?? "");
    setMethod(
      (agentProfile?.preferredPaymentMethod as PreferredMethod | undefined) ?? ""
    );
  }, [agentProfile?.paymentCollectorPreference, agentProfile?.preferredPaymentMethod]);

  useEffect(() => {
    if (!pendingFile) setQrPreview(paymentQrUrl);
  }, [paymentQrUrl, pendingFile]);

  // If collector switches to "agent" and method is bank_transfer, clear it
  useEffect(() => {
    if (collector === "agent" && method === "bank_transfer") {
      setMethod("");
    }
  }, [collector, method]);

  const showQrUpload = collector === "agent" && method === "qr";
  const allowedMethods: PreferredMethod[] =
    collector === "agent" ? ["cash", "qr"] : ["cash", "qr", "bank_transfer"];

  const dirty =
    collector !== (agentProfile?.paymentCollectorPreference ?? "") ||
    method !== (agentProfile?.preferredPaymentMethod ?? "") ||
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
    setQrPreview(paymentQrUrl);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRemoveExistingQr() {
    try {
      await removeQr();
      setQrPreview(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("QR code removed");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove QR code"));
    }
  }

  async function handleSave() {
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
      await updatePreferences({
        paymentCollectorPreference:
          collector === "" ? undefined : (collector as Collector),
        preferredPaymentMethod: method === "" ? undefined : method,
        paymentQrStorageId: storageId,
      });
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Payment preferences updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update payment preferences"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Preferences</CardTitle>
        <CardDescription>
          Set your default payment collector and method. These will be
          pre-selected when recording a sale — you can still change them per
          order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Who collects payment?</Label>
            <Select
              value={collector || "none"}
              onValueChange={(v) => {
                if (!v) return;
                setCollector(v === "none" ? "" : (v as Collector));
              }}
            >
              <SelectTrigger>
                <SelectValue>
                  {collector
                    ? COLLECTOR_LABELS[collector]
                    : "No preference"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                <SelectItem value="agent">I collect from customer</SelectItem>
                <SelectItem value="hq">HQ collects directly</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only applies for consignment and pre-sell orders. Hold &amp; Paid
              orders are always collected by you.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Preferred payment method</Label>
            <Select
              value={method || "none"}
              onValueChange={(v) => {
                if (!v) return;
                setMethod(v === "none" ? "" : (v as PreferredMethod));
              }}
            >
              <SelectTrigger>
                <SelectValue>
                  {method ? PAYMENT_METHOD_LABELS[method] : "No preference"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                {allowedMethods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {collector === "agent"
                ? "When you collect: Cash or QR only."
                : collector === "hq"
                  ? "When HQ collects: Cash, QR, or Bank Transfer."
                  : "Choose a collector first to see all options."}
            </p>
          </div>
        </div>

        {showQrUpload && (
          <>
            <Separator />
            <div className="space-y-3">
              <div>
                <Label>Your QR code</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Shown to customers when you collect via QR. Max 5MB image.
                </p>
              </div>

              {qrPreview ? (
                <div className="space-y-2">
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrPreview}
                      alt="QR preview"
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
                    {!pendingFile && agentProfile?.paymentQrStorageId && (
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
          </>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
