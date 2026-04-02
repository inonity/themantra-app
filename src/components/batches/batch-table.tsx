"use client";

import { useMutation } from "convex/react";
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

export function BatchTable({ batches }: { batches: Doc<"batches">[] }) {
  const updateStatus = useMutation(api.batches.updateStatus);

  async function handleStatusChange(batchId: Doc<"batches">["_id"], newStatus: BatchStatus) {
    try {
      await updateStatus({ id: batchId, status: newStatus });
      toast.success(`Status changed to ${capitalize(newStatus)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      toast.error(message);
    }
  }

  if (batches.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No batches yet. Create your first batch to get started.
      </div>
    );
  }

  return (
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
          return (
            <TableRow key={batch._id}>
              <TableCell className="font-medium">{batch.batchCode}</TableCell>
              <TableCell>{batch.manufacturedDate}</TableCell>
              <TableCell>{batch.expectedReadyDate ?? "—"}</TableCell>
              <TableCell>{batch.totalQuantity}</TableCell>
              <TableCell>
                {allowedNext.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Badge
                        variant={statusVariant[batch.status]}
                        className="cursor-pointer"
                      >
                        {capitalize(batch.status)}
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
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
