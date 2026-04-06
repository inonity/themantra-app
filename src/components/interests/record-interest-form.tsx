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
import { Card, CardContent } from "@/components/ui/card";
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
import { PhoneInput } from "@/components/ui/phone-input";

interface InterestLineItem {
  productId: Id<"products">;
  variantId?: Id<"productVariants">;
  quantity: number;
  productName: string;
  variantName?: string;
  isFutureRelease: boolean;
}

export function RecordInterestForm() {
  const recordInterest = useMutation(api.interests.record);
  const products = useQuery(api.products.list);
  const allVariants = useQuery(api.productVariants.listAll);
  const router = useRouter();

  const [lineItems, setLineItems] = useState<InterestLineItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeProducts = (products ?? []).filter((p) => p.status === "active" || p.status === "future_release");
  const activeVariants = (allVariants ?? []).filter((v) => v.status === "active");

  const variantsByProduct = new Map<string, typeof activeVariants>();
  for (const v of activeVariants) {
    const existing = variantsByProduct.get(v.productId) ?? [];
    variantsByProduct.set(v.productId, [...existing, v]);
  }
  const variantMap = new Map(activeVariants.map((v) => [v._id, v]));

  // Track used product+variant combos
  const usedKeys = new Set(lineItems.map((li) => li.variantId ? `${li.productId}__${li.variantId}` : li.productId));

  function addLineItem(value: string) {
    // value is "productId" or "productId__variantId"
    const [productId, variantId] = value.split("__");
    const product = activeProducts.find((p) => p._id === productId);
    if (!product) return;
    const variant = variantId ? variantMap.get(variantId as Id<"productVariants">) : undefined;

    setLineItems([
      ...lineItems,
      {
        productId: product._id,
        variantId: variant?._id,
        quantity: 1,
        productName: product.name,
        variantName: variant?.name,
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
          variantId: li.variantId,
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
      <Card className="max-w-3xl mx-auto">
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
                  <TableRow key={li.variantId ?? li.productId}>
                    <TableCell className="font-medium">
                      <span>{li.productName}{li.variantName ? ` — ${li.variantName}` : ""}</span>
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

                {(() => {
                  const options = activeProducts.flatMap((product) => {
                    const variants = variantsByProduct.get(product._id) ?? [];
                    const suffix = product.status === "future_release" ? " (Future Release)" : "";
                    if (variants.length === 0) {
                      if (usedKeys.has(product._id)) return [];
                      return [{
                        value: product._id,
                        label: `${product.name}${product.price != null ? ` — RM${product.price.toFixed(2)}` : ""}${suffix}`,
                      }];
                    }
                    return variants
                      .filter((v) => !usedKeys.has(`${product._id}__${v._id}`))
                      .map((v) => ({
                        value: `${product._id}__${v._id}`,
                        label: `${product.name} — ${v.name} — RM${v.price.toFixed(2)}${suffix}`,
                      }));
                  });
                  if (options.length === 0) return null;
                  return (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={3}>
                        <Select value="" onValueChange={(v) => v && addLineItem(v)}>
                          <SelectTrigger className="w-full md:w-[300px]">
                            <SelectValue placeholder="Add a product..." />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })()}

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
