"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

const stockModelLabel: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
  dropship: "Dropship",
};

export function CorrectionsTable() {
  const corrections = useQuery(api.saleCorrections.listAll);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!corrections) return [];
    if (!search) return corrections;
    const term = search.toLowerCase();
    return corrections.filter(
      (c) =>
        c.productName.toLowerCase().includes(term) ||
        c.oldBatchCode.toLowerCase().includes(term) ||
        c.newBatchCode.toLowerCase().includes(term) ||
        c.correctedByName.toLowerCase().includes(term) ||
        (c.holderName ?? "").toLowerCase().includes(term) ||
        (c.reason ?? "").toLowerCase().includes(term)
    );
  }, [corrections, search]);

  if (corrections === undefined) {
    return <div className="text-sm text-muted-foreground">Loading corrections...</div>;
  }

  const hasActiveFilters = search !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search product, batch, person..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[180px] lg:w-[260px]"
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearch("")}
            className="h-8"
          >
            Reset <XIcon className="ml-2 size-4" />
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>From batch</TableHead>
              <TableHead>To batch</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Holder</TableHead>
              <TableHead>Stock model</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  {hasActiveFilters
                    ? "No corrections match the current filter."
                    : "No corrections recorded yet."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c._id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(c.correctedAt).toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell className="font-medium">{c.productName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-red-600 border-red-200">
                      {c.oldBatchCode}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-green-700 border-green-300">
                      {c.newBatchCode}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{c.quantity}</TableCell>
                  <TableCell className="text-sm">
                    {c.holderType === "business" ? "HQ" : c.holderName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.stockModel ? stockModelLabel[c.stockModel] ?? c.stockModel : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{c.correctedByName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                    {c.reason || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
