"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

function StatusBadge({ status }: { status: Doc<"interests">["status"] }) {
  const variant =
    status === "active"
      ? "default"
      : status === "converted"
        ? "secondary"
        : "outline";
  const label =
    status === "active"
      ? "Active"
      : status === "converted"
        ? "Converted"
        : "Cancelled";
  return <Badge variant={variant}>{label}</Badge>;
}

export function InterestsTable({
  interests,
  products,
  showAgent = false,
  agents,
}: {
  interests: Doc<"interests">[];
  products: Doc<"products">[];
  showAgent?: boolean;
  agents?: Doc<"users">[];
}) {
  const cancelInterest = useMutation(api.interests.cancel);
  const router = useRouter();
  const [cancelling, setCancelling] = useState<string | null>(null);

  const productMap = new Map(products.map((p) => [p._id, p]));
  const agentMap = new Map((agents ?? []).map((a) => [a._id, a]));

  if (interests.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No interests recorded yet.
      </div>
    );
  }

  async function handleCancel(interestId: Id<"interests">) {
    setCancelling(interestId);
    try {
      await cancelInterest({ interestId });
    } finally {
      setCancelling(null);
    }
  }

  function handleConvert(interestId: Id<"interests">) {
    router.push(`/dashboard/record-sale?interestId=${interestId}`);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Customer</TableHead>
          {showAgent && <TableHead>Agent</TableHead>}
          <TableHead>Products</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {interests.map((interest) => {
          const productLineItems = interest.items.map((item) => {
            const product = productMap.get(item.productId);
            return {
              label: `${product?.name ?? "Unknown"} x${item.quantity}`,
              isFutureRelease: product?.status === "future_release",
            };
          });

          const agent = interest.agentId
            ? agentMap.get(interest.agentId)
            : null;

          return (
            <TableRow key={interest._id}>
              <TableCell>
                {new Date(interest.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <div className="font-medium">
                  {interest.customerDetail.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {interest.customerDetail.phone}
                </div>
              </TableCell>
              {showAgent && (
                <TableCell>
                  {agent?.nickname || agent?.name || agent?.email || "—"}
                </TableCell>
              )}
              <TableCell className="max-w-[250px]">
                <div className="flex flex-wrap gap-1">
                  {productLineItems.map((item, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <span className="text-sm">{item.label}</span>
                      {item.isFutureRelease && (
                        <span className="text-xs text-muted-foreground border border-border rounded px-1 py-0.5">
                          Future
                        </span>
                      )}
                      {i < productLineItems.length - 1 && (
                        <span className="text-muted-foreground">,</span>
                      )}
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={interest.status} />
              </TableCell>
              <TableCell className="text-right">
                {interest.status === "active" && (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleConvert(interest._id)}
                    >
                      Convert to Sale
                    </Button>
                    <Dialog>
                      <DialogTrigger
                        render={
                          <button
                            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium h-7 gap-1 px-2.5 hover:bg-muted hover:text-foreground transition-all disabled:pointer-events-none disabled:opacity-50"
                            disabled={cancelling === interest._id}
                          />
                        }
                      >
                        {cancelling === interest._id
                          ? "Cancelling..."
                          : "Cancel"}
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Cancel this interest?</DialogTitle>
                          <DialogDescription>
                            This will mark the interest from{" "}
                            {interest.customerDetail.name} as cancelled.
                            This cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose
                            render={
                              <button className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium h-8 gap-1.5 px-2.5 hover:bg-muted hover:text-foreground transition-all" />
                            }
                          >
                            Keep
                          </DialogClose>
                          <DialogClose
                            render={
                              <button
                                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-destructive/10 text-destructive text-sm font-medium h-8 gap-1.5 px-2.5 hover:bg-destructive/20 transition-all"
                                onClick={() => handleCancel(interest._id)}
                              />
                            }
                          >
                            Cancel Interest
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
