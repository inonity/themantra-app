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

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  upcoming: "secondary",
  available: "default",
  depleted: "destructive",
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const allStatuses = ["upcoming", "available", "depleted"] as const;

export function BatchTable({ batches }: { batches: Doc<"batches">[] }) {
  const updateStatus = useMutation(api.batches.updateStatus);

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
        {batches.map((batch) => (
          <TableRow key={batch._id}>
            <TableCell className="font-medium">{batch.batchCode}</TableCell>
            <TableCell>{batch.manufacturedDate}</TableCell>
            <TableCell>{batch.expectedReadyDate ?? "—"}</TableCell>
            <TableCell>{batch.totalQuantity}</TableCell>
            <TableCell>
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
                  {allStatuses.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() =>
                        updateStatus({
                          id: batch._id,
                          status: s,
                        })
                      }
                    >
                      <Badge variant={statusVariant[s]} className="mr-2">
                        {capitalize(s)}
                      </Badge>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
