"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
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
import { ReleaseUnitsDialog } from "@/components/batches/release-units-dialog";
import { useState } from "react";
import { toast } from "sonner";

type BatchStatus = "upcoming" | "partial" | "available" | "depleted" | "cancelled";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  upcoming: "secondary",
  partial: "secondary",
  available: "default",
  depleted: "destructive",
  cancelled: "outline",
};

const statusLabel: Record<string, string> = {
  upcoming: "Upcoming",
  partial: "Partial",
  available: "Available",
  depleted: "Depleted",
  cancelled: "Cancelled",
};

const ALLOWED_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  upcoming: ["available", "cancelled"],
  partial: ["available", "cancelled"],
  available: ["depleted", "cancelled"],
  depleted: ["cancelled"],
  cancelled: [],
};

export function BatchTable({ batches }: { batches: Doc<"batches">[] }) {
  const updateStatus = useMutation(api.batches.updateStatus);
  const [releasingBatch, setReleasingBatch] = useState<Doc<"batches"> | null>(null);

  function handleStatusChange(batch: Doc<"batches">, newStatus: BatchStatus) {
    if ((batch.status === "upcoming" || batch.status === "partial") && newStatus === "available") {
      setReleasingBatch(batch);
      return;
    }
    updateStatus({ id: batch._id, status: newStatus })
      .then(() => toast.success(`Status changed to ${statusLabel[newStatus]}`))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to update status";
        toast.error(message);
      });
  }

  if (batches.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No batches yet. Create your first batch to get started.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch Code</TableHead>
            <TableHead>Manufactured</TableHead>
            <TableHead>Expected Maturation</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => {
            const allowedNext = ALLOWED_TRANSITIONS[batch.status as BatchStatus] ?? [];
            const isPartial = batch.status === "partial";
            const released = batch.releasedQuantity ?? 0;
            return (
              <TableRow key={batch._id}>
                <TableCell className="font-medium">{batch.batchCode}</TableCell>
                <TableCell>{batch.manufacturedDate}</TableCell>
                <TableCell>{batch.expectedReadyDate ?? "—"}</TableCell>
                <TableCell>
                  {isPartial ? (
                    <span>{released} / {batch.totalQuantity}</span>
                  ) : (
                    batch.totalQuantity
                  )}
                </TableCell>
                <TableCell>
                  {allowedNext.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Badge
                          variant={statusVariant[batch.status]}
                          className="cursor-pointer"
                        >
                          {statusLabel[batch.status] ?? batch.status}
                        </Badge>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {allowedNext.map((s) => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => handleStatusChange(batch, s)}
                          >
                            <Badge variant={statusVariant[s]} className="mr-2">
                              {statusLabel[s]}
                            </Badge>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Badge variant={statusVariant[batch.status]}>
                      {statusLabel[batch.status] ?? batch.status}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {releasingBatch && (
        <ReleaseUnitsDialog
          batch={releasingBatch}
          open={!!releasingBatch}
          onOpenChange={(open) => {
            if (!open) setReleasingBatch(null);
          }}
        />
      )}
    </>
  );
}
