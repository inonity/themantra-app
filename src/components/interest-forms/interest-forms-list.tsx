"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { QrCodeIcon, LinkIcon, PowerOffIcon, PlayIcon, ListIcon, DownloadIcon } from "lucide-react";
import Link from "next/link";

type Form = {
  _id: Id<"interestForms">;
  slug: string;
  title?: string;
  notes?: string;
  stockModel: string;
  date: string;
  offerId?: Id<"offers">;
  status: "active" | "closed";
  createdAt: number;
};

const STOCK_MODEL_LABELS: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

function FormCard({ form }: { form: Form }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const closeForm = useMutation(api.interestForms.close);
  const reopenForm = useMutation(api.interestForms.reopen);

  const formUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/form/${form.slug}`
      : `/form/${form.slug}`;

  function copyLink() {
    navigator.clipboard.writeText(formUrl).then(() => toast.success("Link copied!"));
  }

  async function toggleStatus() {
    try {
      if (form.status === "active") {
        await closeForm({ formId: form._id });
        toast.success("Form closed.");
      } else {
        await reopenForm({ formId: form._id });
        toast.success("Form reopened.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update form status.");
    }
  }

  async function downloadA4() {
    const svgEl = qrContainerRef.current?.querySelector("svg");
    if (!svgEl) return;
    setDownloading(true);

    // A4 at 150 dpi
    const W = 1240;
    const H = 1754;
    const PAD = 100;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Header stripe
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, W, 140);

    // Title in header
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 60px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      form.title ?? "Interest Form",
      PAD,
      70,
      W - PAD * 2
    );

    // Date below header
    ctx.fillStyle = "#555555";
    ctx.font = "38px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(form.date, PAD, 215);

    // Notes
    let notesEndY = 240;
    if (form.notes) {
      ctx.fillStyle = "#333333";
      ctx.font = "34px system-ui, -apple-system, sans-serif";
      notesEndY = wrapText(ctx, form.notes, PAD, 270, W - PAD * 2, 50);
      notesEndY += 20;
    }

    // QR code: render SVG → canvas
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const qrSize = 640;
        const qrX = (W - qrSize) / 2;
        const qrY = Math.max(notesEndY + 40, 360);

        // White box behind QR
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40);

        ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
        URL.revokeObjectURL(svgUrl);

        // "Scan to place your order" label
        ctx.fillStyle = "#111111";
        ctx.font = "bold 40px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Scan to place your order", W / 2, qrY + qrSize + 70);

        // URL
        ctx.fillStyle = "#888888";
        ctx.font = "28px monospace, system-ui";
        ctx.fillText(formUrl, W / 2, qrY + qrSize + 120);

        // Footer line
        ctx.fillStyle = "#eeeeee";
        ctx.fillRect(PAD, H - 80, W - PAD * 2, 1);
        ctx.fillStyle = "#aaaaaa";
        ctx.font = "24px system-ui, -apple-system, sans-serif";
        ctx.fillText("TheMantra · Interest Form", W / 2, H - 44);

        resolve();
      };
      img.src = svgUrl;
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `form-${form.slug}.png`;
      a.click();
      setDownloading(false);
    }, "image/png");
  }

  return (
    <>
      <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium truncate">{form.title ?? "Interest Form"}</p>
            <p className="text-sm text-muted-foreground">{form.date}</p>
          </div>
          <Badge variant={form.status === "active" ? "default" : "secondary"} className="shrink-0">
            {form.status === "active" ? "Active" : "Closed"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs bg-muted rounded px-2 py-0.5">
            {STOCK_MODEL_LABELS[form.stockModel] ?? form.stockModel}
          </span>
        </div>

        {form.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">{form.notes}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}>
            <QrCodeIcon className="h-3.5 w-3.5 mr-1.5" />
            QR Code
          </Button>
          <Button size="sm" variant="outline" onClick={copyLink}>
            <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
            Copy Link
          </Button>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/dashboard/interests?formId=${form._id}`} />}
            nativeButton={false}
          >
            <ListIcon className="h-3.5 w-3.5 mr-1.5" />
            See List
          </Button>
          <Button size="sm" variant="outline" onClick={toggleStatus}>
            {form.status === "active" ? (
              <>
                <PowerOffIcon className="h-3.5 w-3.5 mr-1.5" />
                Close
              </>
            ) : (
              <>
                <PlayIcon className="h-3.5 w-3.5 mr-1.5" />
                Reopen
              </>
            )}
          </Button>
        </div>
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{form.title ?? "Interest Form"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {/* Visible QR + hidden large one for download */}
            <div className="bg-white p-4 rounded-lg">
              <QRCode value={formUrl} size={200} />
            </div>
            {/* Hidden large QR used for canvas export */}
            <div ref={qrContainerRef} className="sr-only" aria-hidden>
              <QRCode value={formUrl} size={600} />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all">{formUrl}</p>
            <div className="flex gap-2 w-full">
              <Button size="sm" variant="outline" className="flex-1" onClick={copyLink}>
                <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                Copy Link
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={downloadA4}
                disabled={downloading}
              >
                <DownloadIcon className="h-3.5 w-3.5 mr-1.5" />
                {downloading ? "Generating..." : "Download"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function InterestFormsList({ forms }: { forms: Form[] }) {
  if (forms.length === 0) {
    return (
      <div className="border border-border rounded-lg p-12 text-center text-muted-foreground">
        <QrCodeIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No forms yet. Create your first form to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {forms.map((form) => (
        <FormCard key={form._id} form={form} />
      ))}
    </div>
  );
}
