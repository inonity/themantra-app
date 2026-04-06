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
import { FacetedFilter } from "@/components/stock/faceted-filter";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { XIcon } from "lucide-react";

type InterestForm = { _id: Id<"interestForms">; title?: string; slug: string; date: string };

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
  forms,
  defaultFormId,
}: {
  interests: Doc<"interests">[];
  products: Doc<"products">[];
  showAgent?: boolean;
  agents?: Doc<"users">[];
  forms?: InterestForm[];
  defaultFormId?: string;
}) {
  const cancelInterest = useMutation(api.interests.cancel);
  const router = useRouter();
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [formFilter, setFormFilter] = useState<Set<string>>(
    defaultFormId ? new Set([defaultFormId]) : new Set()
  );

  const productMap = new Map(products.map((p) => [p._id, p]));
  const agentMap = new Map((agents ?? []).map((a) => [a._id, a]));
  const formMap = new Map((forms ?? []).map((f) => [f._id, f]));

  const formOptions = (forms ?? []).map((f) => ({
    label: f.title ?? `Form ${f.date}`,
    value: f._id,
  }));

  const hasActiveFilters = search !== "" || statusFilter.size > 0 || formFilter.size > 0;

  const filtered = useMemo(() => {
    return interests.filter((i) => {
      if (search) {
        const term = search.toLowerCase();
        const name = i.customerDetail.name.toLowerCase();
        const phone = (i.customerDetail.phone ?? "").toLowerCase();
        if (!name.includes(term) && !phone.includes(term)) return false;
      }
      if (statusFilter.size > 0 && !statusFilter.has(i.status)) return false;
      if (formFilter.size > 0) {
        const fid = i.formId ?? "__none__";
        if (!formFilter.has(fid)) return false;
      }
      return true;
    });
  }, [interests, search, statusFilter, formFilter]);

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
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[150px] lg:w-[220px]"
        />
        <FacetedFilter
          title="Status"
          options={[
            { label: "Active", value: "active" },
            { label: "Converted", value: "converted" },
            { label: "Cancelled", value: "cancelled" },
          ]}
          selected={statusFilter}
          onSelectionChange={setStatusFilter}
        />
        {formOptions.length > 0 && (
          <FacetedFilter
            title="Form"
            options={formOptions}
            selected={formFilter}
            onSelectionChange={setFormFilter}
          />
        )}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            onClick={() => { setSearch(""); setStatusFilter(new Set()); setFormFilter(new Set()); }}
          >
            Reset
            <XIcon className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {interests.length}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-border rounded-md">
          No interests match the current filters.
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                {showAgent && <TableHead>Agent</TableHead>}
                <TableHead>Products</TableHead>
                {formOptions.length > 0 && <TableHead>Form</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((interest) => {
                const productLineItems = interest.items.map((item) => {
                  const product = productMap.get(item.productId);
                  return {
                    label: `${product?.name ?? "Unknown"} x${item.quantity}`,
                    isFutureRelease: product?.status === "future_release",
                  };
                });

                const agent = interest.agentId ? agentMap.get(interest.agentId) : null;
                const form = interest.formId ? formMap.get(interest.formId) : null;

                return (
                  <TableRow key={interest._id}>
                    <TableCell>
                      {new Date(interest.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{interest.customerDetail.name}</div>
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
                    {formOptions.length > 0 && (
                      <TableCell>
                        {form ? (
                          <span className="text-xs text-muted-foreground">
                            {form.title ?? `Form ${form.date}`}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
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
                              {cancelling === interest._id ? "Cancelling..." : "Cancel"}
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Cancel this interest?</DialogTitle>
                                <DialogDescription>
                                  This will mark the interest from{" "}
                                  {interest.customerDetail.name} as cancelled. This cannot be
                                  undone.
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
        </div>
      )}
    </div>
  );
}
