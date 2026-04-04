"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Doc } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useMutation } from "convex/react";
import { PlusIcon, MoreHorizontalIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { BatchFormDialog } from "@/components/batches/batch-form-dialog";
import { StockAdjustmentDialog } from "@/components/batches/stock-adjustment-dialog";
import { useState } from "react";
import { toast } from "sonner";

type BatchStatus = "upcoming" | "available" | "depleted" | "cancelled";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  upcoming: "secondary",
  available: "default",
  depleted: "destructive",
  cancelled: "outline",
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ALLOWED_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  upcoming: ["available", "cancelled"],
  available: ["depleted", "cancelled"],
  depleted: ["cancelled"],
  cancelled: [],
};

export default function BatchesPage() {
  const batches = useQuery(api.batches.listAll);
  const products = useQuery(api.products.list);
  const updateStatus = useMutation(api.batches.updateStatus);

  const [editingBatch, setEditingBatch] = useState<Doc<"batches"> | null>(null);
  const [adjustingBatch, setAdjustingBatch] = useState<Doc<"batches"> | null>(null);

  const productMap = new Map(
    (products ?? []).map((p) => [p._id, p])
  );

  const isLoading = batches === undefined || products === undefined;

  async function handleStatusChange(batchId: Doc<"batches">["_id"], newStatus: BatchStatus) {
    try {
      await updateStatus({ id: batchId, status: newStatus });
      toast.success(`Status changed to ${capitalize(newStatus)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      toast.error(message);
    }
  }

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Batches</h1>
            <p className="text-muted-foreground">
              View and manage all batches across products.
            </p>
          </div>
          {products && (
            <BatchFormDialog products={products}>
              <Button className="w-full sm:w-auto">
                <PlusIcon className="h-4 w-4 mr-2" />
                New Batch
              </Button>
            </BatchFormDialog>
          )}
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : batches.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No batches yet. Click &quot;New Batch&quot; to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch Code</TableHead>
                <TableHead>Manufactured</TableHead>
                <TableHead>Expected Maturation</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Status</TableHead>
<TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => {
                const product = productMap.get(batch.productId);
                const allowedNext = ALLOWED_TRANSITIONS[batch.status as BatchStatus] ?? [];
                return (
                  <TableRow key={batch._id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/products/${batch.productId}`}
                        className="hover:underline"
                      >
                        {product?.name ?? "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell>{batch.batchCode}</TableCell>
                    <TableCell>{batch.manufacturedDate}</TableCell>
                    <TableCell>{batch.expectedReadyDate ?? "—"}</TableCell>
                    <TableCell>{batch.totalQuantity}</TableCell>
                    <TableCell>
                      {allowedNext.length > 0 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger>
                            <Badge
                              variant={statusVariant[batch.status]}
                              className="cursor-pointer gap-1"
                            >
                              {capitalize(batch.status)}
                              <ChevronDownIcon className="h-3 w-3" />
                            </Badge>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {allowedNext.map((s) => (
                              <DropdownMenuItem
                                key={s}
                                onClick={() => handleStatusChange(batch._id, s)}
                              >
                                <Badge variant={statusVariant[s]} className="mr-2">
                                  {capitalize(s)}
                                </Badge>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Badge variant={statusVariant[batch.status]}>
                          {capitalize(batch.status)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                          <MoreHorizontalIcon className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingBatch(batch)}>
                            Edit
                          </DropdownMenuItem>
                          {batch.status === "available" && (
                            <DropdownMenuItem onClick={() => setAdjustingBatch(batch)}>
                              Adjust Stock
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Edit dialog (controlled, no trigger) */}
        <BatchFormDialog
          batch={editingBatch ?? undefined}
          open={!!editingBatch}
          onOpenChange={(open) => {
            if (!open) setEditingBatch(null);
          }}
        />

        {/* Stock adjustment dialog */}
        {adjustingBatch && (
          <StockAdjustmentDialog
            batch={adjustingBatch}
            open={!!adjustingBatch}
            onOpenChange={(open) => {
              if (!open) setAdjustingBatch(null);
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}
