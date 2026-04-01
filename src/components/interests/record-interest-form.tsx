"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { TrashIcon } from "lucide-react";

interface InterestLineItem {
  productId: Id<"products">;
  quantity: number;
  productName: string;
  isFutureRelease: boolean;
}

export function RecordInterestForm() {
  const recordInterest = useMutation(api.interests.record);
  const products = useQuery(api.products.list);
  const router = useRouter();

  const [lineItems, setLineItems] = useState<InterestLineItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeProducts = (products ?? []).filter((p) => p.status === "active" || p.status === "future_release");
  const usedProductIds = new Set(lineItems.map((li) => li.productId));
  const availableProducts = activeProducts.filter((p) => !usedProductIds.has(p._id));

  function addLineItem(productId: string) {
    const product = activeProducts.find((p) => p._id === productId);
    if (!product) return;

    setLineItems([
      ...lineItems,
      {
        productId: product._id,
        quantity: 1,
        productName: product.name,
        isFutureRelease: product.status === "future_release",
      },
    ]);
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  function updateQuantity(index: number, qty: number) {
    setLineItems(
      lineItems.map((li, i) =>
        i === index ? { ...li, quantity: Math.max(1, qty) } : li
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lineItems.length === 0) return;

    setSubmitting(true);
    try {
      await recordInterest({
        customerDetail: {
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
        },
        items: lineItems.map((li) => ({
          productId: li.productId,
          quantity: li.quantity,
        })),
        notes: notes || undefined,
      });
      router.push("/dashboard/interests");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Record Customer Interest</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Customer Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          <Separator />

          {/* Items */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Products of Interest</Label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-[120px]">Quantity</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((li, index) => (
                  <TableRow key={li.productId}>
                    <TableCell className="font-medium">
                      <span>{li.productName}</span>
                      {li.isFutureRelease && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground border border-border rounded px-1 py-0.5">
                          Future Release
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={li.quantity}
                        onChange={(e) =>
                          updateQuantity(index, parseInt(e.target.value) || 1)
                        }
                        className="w-20 h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeLineItem(index)}
                      >
                        <TrashIcon className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {availableProducts.length > 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3}>
                      <Select value="" onValueChange={(v) => v && addLineItem(v)}>
                        <SelectTrigger className="w-full md:w-[300px]">
                          <SelectValue placeholder="Add a product..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableProducts.map((product) => (
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

                {lineItems.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground h-16"
                    >
                      Add at least one product the customer is interested in.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about the customer's interest..."
            />
          </div>

          <Separator />

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                lineItems.length === 0 ||
                !customerName ||
                !customerPhone ||
                !customerEmail ||
                submitting
              }
            >
              {submitting ? "Recording..." : "Record Interest"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
