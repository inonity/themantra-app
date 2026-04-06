"use client";

import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OfferFormDialog } from "./offer-form-dialog";
import { OfferPricingDialog } from "./offer-pricing-dialog";
import { FacetedFilter } from "@/components/stock/faceted-filter";
import {
  MoreHorizontalIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  XIcon,
} from "lucide-react";

type SortCol = "name" | "status";
type SortDir = "asc" | "desc";

function SortableHead({
  label,
  column,
  sortCol,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortCol;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
}) {
  const isActive = sortCol === column;
  return (
    <TableHead>
      <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => onSort(column)}>
        {label}
        {isActive ? (
          sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />
        ) : (
          <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />
        )}
      </Button>
    </TableHead>
  );
}

function OfferRowActions({ offer }: { offer: Doc<"offers"> }) {
  const toggleActive = useMutation(api.offers.toggleActive);
  const [editOpen, setEditOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setPricingOpen(true)}>
            Set HQ Pricing
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            Edit Offer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={offer.isActive ? "destructive" : "default"}
            onClick={() => toggleActive({ id: offer._id })}
          >
            {offer.isActive ? "Disable Offer" : "Enable Offer"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OfferPricingDialog
        offerId={offer._id}
        offerName={offer.name}
        open={pricingOpen}
        onOpenChange={setPricingOpen}
      />

      <OfferFormDialog
        offer={offer}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

export function OffersTable({ offers }: { offers: Doc<"offers">[] }) {
  const products = useQuery(api.products.list) ?? [];
  const agents = useQuery(api.users.listSellers) ?? [];
  const productMap = new Map(products.map((p) => [p._id, p]));
  const agentMap = new Map(agents.map((a) => [a._id, a]));

  const [search, setSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const hasActiveFilters = search !== "" || selectedStatuses.size > 0;

  const filtered = useMemo(() => {
    let result = offers;

    if (search) {
      const term = search.toLowerCase();
      result = result.filter((o) => o.name.toLowerCase().includes(term));
    }

    if (selectedStatuses.size > 0) {
      result = result.filter((o) =>
        selectedStatuses.has(o.isActive ? "active" : "inactive")
      );
    }

    return [...result].sort((a, b) => {
      const aVal = sortCol === "name" ? a.name : a.isActive ? "active" : "inactive";
      const bVal = sortCol === "name" ? b.name : b.isActive ? "active" : "inactive";
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [offers, search, selectedStatuses, sortCol, sortDir]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Filter offers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[150px] lg:w-[250px]"
        />
        <FacetedFilter
          title="Status"
          options={[
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
          ]}
          selected={selectedStatuses}
          onSelectionChange={setSelectedStatuses}
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(""); setSelectedStatuses(new Set()); }}
            className="h-8"
          >
            Reset
            <XIcon className="ml-2 size-4" />
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <SortableHead label="Name" column="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <TableHead>Bundle</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Agents</TableHead>
              <SortableHead label="Status" column="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {hasActiveFilters
                    ? "No offers match the current filters."
                    : "No offers yet. Create your first offer to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((offer) => (
                <TableRow key={offer._id}>
                  <TableCell className="font-medium">
                    <div>{offer.name}</div>
                    {offer.description && (
                      <div className="text-xs text-muted-foreground">
                        {offer.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {offer.minQuantity} for RM{offer.bundlePrice.toFixed(2)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {offer.productId ? (
                      <Badge variant="secondary" className="text-xs">
                        {productMap.get(offer.productId)?.name ?? "Unknown"}
                      </Badge>
                    ) : offer.productIds && offer.productIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {offer.productIds.map((pid) => (
                          <Badge key={pid} variant="secondary" className="text-xs">
                            {productMap.get(pid)?.name ?? "Unknown"}
                          </Badge>
                        ))}
                      </div>
                    ) : offer.collection ? (
                      <Badge variant="outline" className="text-xs">
                        {offer.collection}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">All products</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {offer.agentIds && offer.agentIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {offer.agentIds.map((aid) => (
                          <Badge key={aid} variant="secondary" className="text-xs">
                            {agentMap.get(aid)?.name ?? "Unknown"}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">All agents</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={offer.isActive ? "default" : "secondary"}>
                      {offer.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <OfferRowActions offer={offer} />
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
