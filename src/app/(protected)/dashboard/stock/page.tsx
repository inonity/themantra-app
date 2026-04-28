"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import { InventoryBreakdown } from "@/components/stock/inventory-breakdown";
import { ReportStockLossDialog } from "@/components/stock/report-loss-dialog";
import { ReturnFormDialog } from "@/components/stock/return-form-dialog";
import { MovementsTable } from "@/components/stock/movements-table";
import { StockLossesTable } from "@/components/stock/stock-losses-table";
import { TransferFormDialog } from "@/components/stock/transfer-form-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { FacetedFilter } from "@/components/stock/faceted-filter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowRightLeftIcon, CheckIcon, XIcon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon, Undo2Icon, AlertTriangleIcon, ChevronDownIcon } from "lucide-react";
import { useState, useMemo } from "react";

type EnrichedRequest = {
  _id: Id<"stockRequests">;
  agentId: Id<"users">;
  productId: Id<"products">;
  variantId?: Id<"productVariants">;
  variantName?: string;
  quantity: number;
  notes?: string;
  status: "pending" | "fulfilled" | "cancelled";
  createdAt: number;
  updatedAt?: number;
  agentName: string;
  productName: string;
  productStatus: string;
};

function RequestsTable({
  requests,
  showActions,
}: {
  requests: EnrichedRequest[];
  showActions?: boolean;
}) {
  const markFulfilled = useMutation(api.stockRequests.markFulfilled);

  const [search, setSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());

  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of requests) seen.set(r.agentId, r.agentName);
    return Array.from(seen.entries()).map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
  }, [requests]);

  const statusOptions = [
    { label: "Pending", value: "pending" },
    { label: "Fulfilled", value: "fulfilled" },
    { label: "Cancelled", value: "cancelled" },
  ];

  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<"agent" | "product" | "quantity" | "requested">("requested");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: "agent" | "product" | "quantity" | "requested") {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "quantity" || col === "requested" ? "desc" : "asc");
    }
  }

  const hasActiveFilters = search !== "" || selectedStatuses.size > 0 || selectedAgents.size > 0;

  const filtered = useMemo(() => {
    let result = requests;
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.agentName.toLowerCase().includes(term) ||
          r.productName.toLowerCase().includes(term) ||
          (r.variantName ?? "").toLowerCase().includes(term)
      );
    }
    if (selectedAgents.size > 0) {
      result = result.filter((r) => selectedAgents.has(r.agentId));
    }
    if (selectedStatuses.size > 0) {
      result = result.filter((r) => selectedStatuses.has(r.status));
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "agent") cmp = a.agentName.localeCompare(b.agentName);
      else if (sortCol === "product") cmp = a.productName.localeCompare(b.productName);
      else if (sortCol === "quantity") cmp = a.quantity - b.quantity;
      else cmp = a.createdAt - b.createdAt;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [requests, search, selectedAgents, selectedStatuses, sortCol, sortDir]);

  const colSpan = showActions ? 7 : 7;

  return (
    <div className="space-y-4">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search agent, product, variant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[180px] lg:w-[260px]"
        />
        <FacetedFilter
          title="Agent"
          options={agentOptions}
          selected={selectedAgents}
          onSelectionChange={setSelectedAgents}
        />
        {!showActions && (
          <FacetedFilter
            title="Status"
            options={statusOptions}
            selected={selectedStatuses}
            onSelectionChange={setSelectedStatuses}
          />
        )}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(""); setSelectedAgents(new Set()); setSelectedStatuses(new Set()); }}
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
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort("agent")}>
                  Agent
                  {sortCol === "agent" ? (sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />) : <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort("product")}>
                  Product
                  {sortCol === "product" ? (sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />) : <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />}
                </Button>
              </TableHead>
              <TableHead>Variant</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort("quantity")}>
                  Quantity
                  {sortCol === "quantity" ? (sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />) : <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />}
                </Button>
              </TableHead>
              <TableHead>Notes</TableHead>
              {!showActions && <TableHead>Status</TableHead>}
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort("requested")}>
                  Requested
                  {sortCol === "requested" ? (sortDir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />) : <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />}
                </Button>
              </TableHead>
              {showActions && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  {hasActiveFilters ? "No requests match the current filters." : "No requests found."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((req) => (
                <TableRow key={req._id}>
                  <TableCell className="font-medium">{req.agentName}</TableCell>
                  <TableCell>
                    {req.productName}
                    {req.productStatus === "future_release" && (
                      <Badge variant="outline" className="ml-2 text-xs text-purple-600 border-purple-300">
                        Future Release
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {req.variantName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">{req.quantity}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[250px] truncate">
                    {req.notes || "—"}
                  </TableCell>
                  {!showActions && (
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          req.status === "fulfilled"
                            ? "text-green-600 border-green-300"
                            : req.status === "cancelled"
                              ? "text-muted-foreground"
                              : "text-orange-600 border-orange-300"
                        }
                      >
                        {req.status}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell>{new Date(req.createdAt).toLocaleDateString()}</TableCell>
                  {showActions && (
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markFulfilled({ requestId: req._id })}
                        title="Mark as fulfilled after transferring stock"
                      >
                        <CheckIcon className="h-4 w-4 mr-1" />
                        Done
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function StockPage() {
  const inventory = useQuery(api.inventory.getBreakdown);
  const products = useQuery(api.products.list);
  const batches = useQuery(api.batches.listAll);
  const agents = useQuery(api.users.listSellers);
  const pending = useQuery(api.stockRequests.listPending) ?? [];
  const allRequests = useQuery(api.stockRequests.listAll) ?? [];

  const [activeDialog, setActiveDialog] = useState<
    null | "loss" | "return" | "transfer"
  >(null);

  const isLoading =
    inventory === undefined ||
    products === undefined ||
    batches === undefined ||
    agents === undefined;

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Stock Management
            </h1>
            <p className="text-muted-foreground">
              Manage inventory, transfer stock, and review agent requests.
            </p>
          </div>
          {products && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button className="w-full sm:w-auto">
                      Stock Actions
                      <ChevronDownIcon className="h-4 w-4 ml-1" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setActiveDialog("transfer")}>
                    <ArrowRightLeftIcon className="h-4 w-4" />
                    Distribute Stock
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveDialog("return")}>
                    <Undo2Icon className="h-4 w-4" />
                    Return Stock
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveDialog("loss")}>
                    <AlertTriangleIcon className="h-4 w-4" />
                    Report Loss
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <ReportStockLossDialog
                products={products}
                open={activeDialog === "loss"}
                onOpenChange={(v) => setActiveDialog(v ? "loss" : null)}
              />
              <ReturnFormDialog
                products={products}
                open={activeDialog === "return"}
                onOpenChange={(v) => setActiveDialog(v ? "return" : null)}
              />
              <TransferFormDialog
                products={products}
                open={activeDialog === "transfer"}
                onOpenChange={(v) => setActiveDialog(v ? "transfer" : null)}
              />
            </>
          )}
        </div>

        <Tabs defaultValue="stock">
          <TabsList>
            <TabsTrigger value="stock">Current Stock</TabsTrigger>
            <TabsTrigger value="requests">
              Stock Requests
              {pending.length > 0 && (
                <Badge variant="default" className="ml-2 bg-orange-500">
                  {pending.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="movements">Movements</TabsTrigger>
            <TabsTrigger value="losses">Stock Losses</TabsTrigger>
          </TabsList>

          <TabsContent value="stock" className="mt-4">
            {isLoading ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : (
              <InventoryBreakdown
                inventory={inventory}
                products={products}
                batches={batches}
                agents={agents}
              />
            )}
          </TabsContent>

          <TabsContent value="requests" className="mt-4 space-y-4">
            <Tabs defaultValue="pending">
              <TabsList>
                <TabsTrigger value="pending">
                  Pending
                  {pending.length > 0 && (
                    <Badge variant="default" className="ml-2 bg-orange-500">
                      {pending.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-4">
                <RequestsTable
                  requests={pending as EnrichedRequest[]}
                  showActions
                />
              </TabsContent>

              <TabsContent value="all" className="mt-4">
                <RequestsTable requests={allRequests as EnrichedRequest[]} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="movements" className="mt-4">
            <MovementsTable />
          </TabsContent>

          <TabsContent value="losses" className="mt-4">
            <StockLossesTable />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
