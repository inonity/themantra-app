"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  PlusIcon,
  MinusIcon,
  PencilIcon,
  ShoppingBagIcon,
  UsersIcon,
  TrendingUpIcon,
  CheckIcon,
} from "lucide-react";

type Product = { _id: Id<"products">; name: string; price?: number; status: string };
type EntryItem = { productId: Id<"products">; variantId?: Id<"productVariants">; quantity: number };
type Entry = {
  _id: Id<"interests">;
  customerDetail: { name: string; phone?: string };
  items: EntryItem[];
  createdAt: number;
};
type PageData = {
  form: {
    _id: Id<"interestForms">;
    slug: string;
    title?: string;
    stockModel: string;
    date: string;
    notes?: string;
    status: string;
  };
  entries: Entry[];
  productMap: Record<string, { name: string; price?: number }>;
  activeProducts: Product[];
  offer: { name: string; minQuantity: number; bundlePrice: number } | null;
  topProducts: { productId: string; name: string; total: number }[];
  totalEntries: number;
};

interface LineItem {
  productId: Id<"products">;
  variantId?: Id<"productVariants">;
  quantity: number;
  productName: string;
  variantName?: string;
}

type PublicVariant = { _id: Id<"productVariants">; productId: Id<"products">; name: string; price: number };

function ProductSelector({
  activeProducts,
  variantsByProduct,
  lineItems,
  setLineItems,
}: {
  activeProducts: Product[];
  variantsByProduct: Map<string, PublicVariant[]>;
  lineItems: LineItem[];
  setLineItems: (items: LineItem[]) => void;
}) {
  const usedKeys = new Set(lineItems.map((li) => li.variantId ? `${li.productId}__${li.variantId}` : li.productId));

  const options = activeProducts.flatMap((p) => {
    const variants = variantsByProduct.get(p._id) ?? [];
    if (variants.length === 0) {
      if (usedKeys.has(p._id)) return [];
      return [{ productId: p._id, variantId: undefined as Id<"productVariants"> | undefined, label: p.name, productName: p.name, variantName: undefined as string | undefined }];
    }
    return variants
      .filter((v) => !usedKeys.has(`${p._id}__${v._id}`))
      .map((v) => ({ productId: p._id, variantId: v._id, label: `${p.name} — ${v.name}`, productName: p.name, variantName: v.name }));
  });

  return (
    <div className="space-y-2">
      {lineItems.map((li, idx) => (
        <div key={li.variantId ?? li.productId} className="flex items-center gap-2">
          <span className="flex-1 text-sm font-medium">{li.productName}{li.variantName ? ` — ${li.variantName}` : ""}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-accent"
              onClick={() => {
                if (li.quantity <= 1) {
                  setLineItems(lineItems.filter((_, i) => i !== idx));
                } else {
                  setLineItems(
                    lineItems.map((l, i) =>
                      i === idx ? { ...l, quantity: l.quantity - 1 } : l
                    )
                  );
                }
              }}
            >
              <MinusIcon className="h-3 w-3" />
            </button>
            <span className="w-6 text-center text-sm font-semibold">{li.quantity}</span>
            <button
              type="button"
              className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-accent"
              onClick={() =>
                setLineItems(
                  lineItems.map((l, i) =>
                    i === idx ? { ...l, quantity: l.quantity + 1 } : l
                  )
                )
              }
            >
              <PlusIcon className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}

      {options.length > 0 && (
        <div className="pt-1">
          <p className="text-xs text-muted-foreground mb-1">Add product:</p>
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt.variantId ?? opt.productId}
                type="button"
                className="text-xs border border-border rounded-full px-3 py-1 hover:bg-accent transition-colors"
                onClick={() =>
                  setLineItems([
                    ...lineItems,
                    { productId: opt.productId, variantId: opt.variantId, quantity: 1, productName: opt.productName, variantName: opt.variantName },
                  ])
                }
              >
                + {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {lineItems.length === 0 && options.length === 0 && (
        <p className="text-xs text-muted-foreground">No products available.</p>
      )}
    </div>
  );
}

export function PublicFormView({ data }: { data: PageData }) {
  const { form, entries, productMap, activeProducts, offer, topProducts, totalEntries } = data;

  const recordViaForm = useMutation(api.interests.recordViaForm);
  const updateViaForm = useMutation(api.interests.updateViaForm);

  const publicVariants = useQuery(api.productVariants.listAllPublic) ?? [];
  const variantsByProduct = new Map<string, PublicVariant[]>();
  const variantMap = new Map<string, PublicVariant>();
  for (const v of publicVariants) {
    const existing = variantsByProduct.get(v.productId) ?? [];
    variantsByProduct.set(v.productId, [...existing, v]);
    variantMap.set(v._id, v);
  }

  const isClosed = form.status === "closed";

  // ── Order dialog state ───────────────────────────────────────────────────
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderName, setOrderName] = useState("");
  const [orderPhone, setOrderPhone] = useState("+60");
  const [orderItems, setOrderItems] = useState<LineItem[]>([]);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // ── Edit dialog state ────────────────────────────────────────────────────
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [editPhone, setEditPhone] = useState("+60");
  const [editPhoneVerified, setEditPhoneVerified] = useState(false);
  const [editItems, setEditItems] = useState<LineItem[]>([]);
  const [phoneError, setPhoneError] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  function openOrder() {
    setOrderName("");
    setOrderPhone("+60");
    setOrderItems([]);
    setOrderSuccess(false);
    setOrderOpen(true);
  }

  function openEdit(entry: Entry) {
    setEditEntry(entry);
    setEditPhone("+60");
    setEditPhoneVerified(false);
    setEditItems([]);
    setPhoneError("");
  }

  function verifyPhone() {
    if (!editEntry) return;
    if (editEntry.customerDetail.phone === editPhone) {
      setEditPhoneVerified(true);
      setPhoneError("");
      setEditItems(
        editEntry.items.map((item) => {
          const variant = item.variantId ? variantMap.get(item.variantId) : undefined;
          return {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            productName: productMap[item.productId]?.name ?? "Unknown",
            variantName: variant?.name,
          };
        })
      );
    } else {
      setPhoneError("Phone number does not match. Please try again.");
    }
  }

  async function handleOrder() {
    if (orderItems.length === 0) {
      toast.error("Please add at least one product.");
      return;
    }
    setOrderSubmitting(true);
    try {
      await recordViaForm({
        formId: form._id,
        customerDetail: { name: orderName, phone: orderPhone },
        items: orderItems.map((li) => ({ productId: li.productId, variantId: li.variantId, quantity: li.quantity })),
      });
      setOrderSuccess(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit. Please try again.");
    } finally {
      setOrderSubmitting(false);
    }
  }

  async function handleUpdate() {
    if (!editEntry || editItems.length === 0) return;
    setEditSubmitting(true);
    try {
      await updateViaForm({
        interestId: editEntry._id,
        phone: editPhone,
        items: editItems.map((li) => ({ productId: li.productId, variantId: li.variantId, quantity: li.quantity })),
      });
      toast.success("Your order has been updated.");
      setEditEntry(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update. Please try again.");
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Paper header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Order Interest Form
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {form.title ?? "Interest Form"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{form.date}</p>
          {form.notes && (
            <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{form.notes}</p>
          )}
          {offer && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium rounded-full px-3 py-1">
              {offer.name} — RM{offer.bundlePrice.toFixed(2)} for {offer.minQuantity}
            </div>
          )}
          {isClosed && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-destructive/10 text-destructive text-xs font-medium rounded-full px-3 py-1">
              Form closed
            </div>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="border-b border-border bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            <span>
              <span className="font-bold text-foreground">{totalEntries}</span>{" "}
              <span className="text-muted-foreground">
                {totalEntries === 1 ? "person" : "people"} interested
              </span>
            </span>
          </div>
          {topProducts.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Top:{" "}
                {topProducts
                  .slice(0, 2)
                  .map((p) => p.name)
                  .join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Entries table */}
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-3xl mx-auto sm:px-4 py-4">
          {entries.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ShoppingBagIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No orders yet. Be the first!</p>
            </div>
          ) : (
            <div className="border-y sm:border sm:rounded-md border-border overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[45%]">Name</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-12">Qty</th>
                    {!isClosed && <th className="w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, idx) =>
                    entry.items.map((item, itemIdx) => (
                      <tr
                        key={`${entry._id}-${item.productId}`}
                        className="border-b border-border/50 last:border-b-0 hover:bg-muted/30"
                      >
                        <td className="px-3 py-2 text-muted-foreground">
                          {itemIdx === 0 ? idx + 1 : ""}
                        </td>
                        <td className="px-3 py-2 font-medium max-w-0">
                          <span className="block truncate">
                            {itemIdx === 0 ? entry.customerDetail.name : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-0">
                          <span className="block truncate">
                            {productMap[item.productId]?.name ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.quantity}
                        </td>
                        {!isClosed && (
                          <td className="px-2 py-2 text-right">
                            {itemIdx === 0 && (
                              <button
                                className="text-muted-foreground hover:text-foreground p-1 rounded"
                                onClick={() => openEdit(entry)}
                                title="Edit"
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom CTA */}
      {!isClosed && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border px-4 py-4">
          <div className="max-w-3xl mx-auto flex justify-center">
            <Button className="w-full sm:w-auto sm:min-w-120 h-12 text-base font-semibold" onClick={openOrder}>
              <ShoppingBagIcon className="h-5 w-5 mr-2" />
              Place an Order
            </Button>
          </div>
        </div>
      )}

      {/* ── Place an Order Dialog ── */}
      <Dialog open={orderOpen} onOpenChange={(open) => { if (!open) setOrderOpen(false); }}>
        <DialogContent className="max-w-sm">
          {orderSuccess ? (
            <>
              <DialogHeader>
                <DialogTitle>Order Submitted!</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="bg-green-50 dark:bg-green-950 rounded-full p-3">
                  <CheckIcon className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Your interest has been recorded.
                </p>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={() => setOrderOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Place an Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="order-name">Your Name</Label>
                  <Input
                    id="order-name"
                    value={orderName}
                    onChange={(e) => setOrderName(e.target.value)}
                    placeholder="e.g. Aishah Rahman"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="order-phone">WhatsApp Number</Label>
                  <PhoneInput
                    id="order-phone"
                    value={orderPhone}
                    onChange={setOrderPhone}
                    placeholder="123456789"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Products</Label>
                  <ProductSelector
                    activeProducts={activeProducts}
                    variantsByProduct={variantsByProduct}
                    lineItems={orderItems}
                    setLineItems={setOrderItems}
                  />
                  {orderItems.length === 0 && (
                    <p className="text-xs text-muted-foreground">Tap a product above to add it.</p>
                  )}
                </div>
                {offer && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                    <p className="font-medium">{offer.name}</p>
                    <p className="text-muted-foreground">
                      Buy {offer.minQuantity} for RM{offer.bundlePrice.toFixed(2)} bundle price
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOrderOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleOrder}
                  disabled={orderSubmitting || orderItems.length === 0 || !orderName || !orderPhone}
                >
                  {orderSubmitting ? "Submitting..." : "Submit Order"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Order Dialog ── */}
      <Dialog open={!!editEntry} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Your Order</DialogTitle>
          </DialogHeader>
          {!editPhoneVerified ? (
            <>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Verify your WhatsApp number to edit this order.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="verify-phone">Your WhatsApp Number</Label>
                  <PhoneInput
                    id="verify-phone"
                    value={editPhone}
                    onChange={(v) => { setEditPhone(v); setPhoneError(""); }}
                    placeholder="123456789"
                  />
                  {phoneError && (
                    <p className="text-sm text-destructive">{phoneError}</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditEntry(null)}>
                  Cancel
                </Button>
                <Button onClick={verifyPhone} disabled={!editPhone || editPhone === "+60"}>
                  Verify
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Editing order for <span className="font-medium text-foreground">{editEntry?.customerDetail.name}</span>
                </p>
                <div className="space-y-2">
                  <Label>Products</Label>
                  <ProductSelector
                    activeProducts={activeProducts}
                    variantsByProduct={variantsByProduct}
                    lineItems={editItems}
                    setLineItems={setEditItems}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditEntry(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={editSubmitting || editItems.length === 0}
                >
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
