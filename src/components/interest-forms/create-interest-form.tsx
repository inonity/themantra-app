"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STOCK_MODEL_LABELS: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
};

export function CreateInterestFormForm() {
  const createForm = useMutation(api.interestForms.create);
  const offers = useQuery(api.offers.listActive);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [stockModel, setStockModel] = useState<"hold_paid" | "consignment" | "presell">("presell");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [offerId, setOfferId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createForm({
        title: title.trim() || undefined,
        stockModel,
        date,
        offerId: offerId !== "none" ? (offerId as Id<"offers">) : undefined,
        notes: notes.trim() || undefined,
      });
      router.push("/dashboard/interest-forms");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="max-w-xl mx-auto">
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Form Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. April Collection Launch"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Stock Model</Label>
            <Select
              value={stockModel}
              onValueChange={(v) => setStockModel(v as "hold_paid" | "consignment" | "presell")}
            >
              <SelectTrigger>
                <SelectValue>
                  {STOCK_MODEL_LABELS[stockModel]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hold_paid">Hold &amp; Paid</SelectItem>
                <SelectItem value="consignment">Consignment</SelectItem>
                <SelectItem value="presell">Pre-sell</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Offer (optional)</Label>
            <Select value={offerId} onValueChange={(v) => setOfferId(v ?? "none")}>
              <SelectTrigger>
                <SelectValue>
                  {offerId === "none"
                    ? "No offer"
                    : offers?.find((o) => o._id === offerId)?.name ?? "Select offer"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No offer</SelectItem>
                {(offers ?? []).map((offer) => (
                  <SelectItem key={offer._id} value={offer._id}>
                    {offer.name} — RM{offer.bundlePrice.toFixed(2)} for {offer.minQuantity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details to show on the form, e.g. collection info, deadline..."
              rows={3}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Form"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
