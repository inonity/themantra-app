"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FulfillSaleDialog } from "@/components/sales/fulfill-sale-dialog";
import { useCurrentUser } from "@/hooks/useStoreUserEffect";
import { PlusIcon, PackageIcon, XIcon } from "lucide-react";
import { useState } from "react";

const SOURCE_LABELS: Record<string, string> = {
  agent_stock: "In Stock",
  hq_transfer: "Pending HQ Transfer",
  hq_direct: "Fulfilled by HQ",
  pending_batch: "Pending Batch",
  future_release: "Future Release",
};

const SOURCE_STYLES: Record<string, string> = {
  agent_stock: "bg-green-100 text-green-700",
  hq_transfer: "text-orange-600 border-orange-300",
  hq_direct: "text-blue-600 border-blue-300",
  pending_batch: "text-yellow-600 border-yellow-300",
  future_release: "text-purple-600 border-purple-300",
};

function RequestStockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const products = useQuery(api.products.listSellable) ?? [];
  const createRequest = useMutation(api.stockRequests.create);
  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !quantity) return;
    setSubmitting(true);
    try {
      await createRequest({
        productId: productId as Id<"products">,
        quantity: parseInt(quantity),
        notes: notes || undefined,
      });
      setProductId("");
      setQuantity("");
      setNotes("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Stock from HQ</DialogTitle>
          <DialogDescription>
            Request products to be transferred to your inventory. HQ will review
            and transfer stock to you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <Select
              value={productId}
              onValueChange={(v) => {
                if (v) setProductId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                    {p.status === "future_release" ? " (Future Release)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reqQty">Quantity</Label>
            <Input
              id="reqQty"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 10"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reqNotes">Notes (optional)</Label>
            <Textarea
              id="reqNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for HQ..."
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={!productId || !quantity || submitting}>
              {submitting ? "Requesting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingSalesSection({
  sales,
  products,
  userRole,
}: {
  sales: Doc<"sales">[];
  products: Map<Id<"products">, Doc<"products">>;
  userRole?: string;
}) {
  if (sales.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No pending fulfillment. All sales are fulfilled.
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Items</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Sale Date</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sales.map((sale) => {
          const pendingCount = (sale.lineItems ?? []).filter(
            (li) => (li.fulfilledQuantity ?? 0) < li.quantity
          ).length;
          const totalItems = (sale.lineItems ?? []).length;

          return (
            <TableRow key={sale._id}>
              <TableCell className="font-medium">
                {sale.customerDetail?.name ?? "Unknown"}
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  {(sale.lineItems ?? []).map((li, i) => {
                    const fulfilled = li.fulfilledQuantity ?? 0;
                    const remaining = li.quantity - fulfilled;
                    const product = products.get(li.productId);
                    const source = li.fulfillmentSource ?? "pending_batch";
                    const isDone = remaining <= 0;

                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-2 text-sm ${isDone ? "opacity-40 line-through" : ""}`}
                      >
                        <span>{product?.name ?? "Unknown"}</span>
                        <span className="text-muted-foreground">
                          x{isDone ? fulfilled : remaining}
                        </span>
                        {!isDone && (
                          <Badge
                            variant="outline"
                            className={`text-xs ${SOURCE_STYLES[source] ?? ""}`}
                          >
                            {SOURCE_LABELS[source] ?? source}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    sale.fulfillmentStatus === "partial"
                      ? "text-blue-600 border-blue-300"
                      : "text-yellow-600 border-yellow-300"
                  }
                >
                  {pendingCount}/{totalItems} pending
                </Badge>
              </TableCell>
              <TableCell>
                {new Date(sale.saleDate).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <FulfillSaleDialog
                  sale={sale}
                  products={products}
                  userRole={userRole}
                  trigger={
                    <Button size="sm" variant="outline">
                      Fulfill
                    </Button>
                  }
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function StockRequestsSection() {
  const requests = useQuery(api.stockRequests.listMy, {}) ?? [];
  const products = useQuery(api.products.list) ?? [];
  const cancelRequest = useMutation(api.stockRequests.cancel);

  const productMap = new Map(products.map((p) => [p._id, p]));
  const pending = requests.filter((r) => r.status === "pending");
  const past = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-4">
      {pending.length === 0 && past.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No stock requests yet. Request products from HQ when you need stock.
          </CardContent>
        </Card>
      )}

      {pending.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((req) => (
              <TableRow key={req._id}>
                <TableCell className="font-medium">
                  {productMap.get(req.productId)?.name ?? "Unknown"}
                </TableCell>
                <TableCell>{req.quantity}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {req.notes || "—"}
                </TableCell>
                <TableCell>
                  {new Date(req.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancelRequest({ requestId: req._id })}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {past.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground mb-2">
            Past requests ({past.length})
          </summary>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {past.map((req) => (
                <TableRow key={req._id}>
                  <TableCell>
                    {productMap.get(req.productId)?.name ?? "Unknown"}
                  </TableCell>
                  <TableCell>{req.quantity}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        req.status === "fulfilled"
                          ? "text-green-600 border-green-300"
                          : "text-muted-foreground"
                      }
                    >
                      {req.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(req.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      )}
    </div>
  );
}

export default function MyFulfillmentPage() {
  const user = useCurrentUser();
  const pendingSales = useQuery(api.sales.listMyPendingFulfillment) ?? [];
  const productsList = useQuery(api.products.list) ?? [];
  const [requestOpen, setRequestOpen] = useState(false);

  const productMap = new Map(
    productsList.map((p) => [p._id, p] as [Id<"products">, Doc<"products">])
  );

  // Summary counts
  const totalPendingItems = pendingSales.reduce((sum, sale) => {
    return (
      sum +
      (sale.lineItems ?? []).filter(
        (li) => (li.fulfilledQuantity ?? 0) < li.quantity
      ).length
    );
  }, 0);

  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Fulfillment
            </h1>
            <p className="text-muted-foreground">
              Fulfill pending sales from your inventory and request stock from
              HQ.
            </p>
          </div>
          <Button onClick={() => setRequestOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Request Stock
          </Button>
        </div>

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold mb-2">{pendingSales.length}</div>
              <p className="text-xs text-muted-foreground">
                {totalPendingItems} item{totalPendingItems !== 1 ? "s" : ""}{" "}
                awaiting fulfillment
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Stock Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold mb-2">
                <StockRequestCount />
              </div>
              <p className="text-xs text-muted-foreground">
                pending requests to HQ
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Sales */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Pending Sales</h2>
          <PendingSalesSection sales={pendingSales} products={productMap} userRole={user?.role} />
        </div>

        {/* Stock Requests */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Stock Requests</h2>
          <StockRequestsSection />
        </div>

        <RequestStockDialog open={requestOpen} onOpenChange={setRequestOpen} />
      </div>
    </RoleGuard>
  );
}

function StockRequestCount() {
  const requests = useQuery(api.stockRequests.listMy, { status: "pending" });
  return <>{requests?.length ?? 0}</>;
}
