"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FacetedFilter } from "@/components/stock/faceted-filter";
import {
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  BanknoteIcon,
  XIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react";
import { useState, useMemo } from "react";

type SortCol = "agent" | "amount" | "date" | "status";
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

type SettlementWithAgent = Doc<"agentSettlements"> & { agentName: string };

const CHANNEL_LABELS: Record<string, string> = {
  direct: "Direct",
  agent: "Agent",
  tiktok: "TikTok",
  shopee: "Shopee",
  other: "Other",
};

function stockModelLabel(model?: string) {
  switch (model) {
    case "hold_paid":
      return "Hold & Paid";
    case "consignment":
      return "Consignment";
    case "presell":
    case "dropship":
      return "Pre-sell";
    default:
      return "—";
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? (
        <CheckIcon className="h-4 w-4" />
      ) : (
        <CopyIcon className="h-4 w-4" />
      )}
    </Button>
  );
}

function paymentStatusBadge(status: string) {
  const variant =
    status === "paid"
      ? "default"
      : status === "submitted"
        ? "secondary"
        : "destructive";
  const label =
    status === "paid"
      ? "Confirmed"
      : status === "submitted"
        ? "Awaiting Confirmation"
        : "Pending";
  return <Badge variant={variant}>{label}</Badge>;
}

function ConfirmPaymentDialog({
  settlement,
  agentName,
}: {
  settlement: SettlementWithAgent;
  agentName: string;
}) {
  const confirmPayment = useMutation(api.agentSettlements.confirmPayment);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await confirmPayment({
        settlementId: settlement._id,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      setNotes("");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="default" onClick={() => setOpen(true)} />
        }
      >
        <CheckCircleIcon className="h-4 w-4 mr-1" />
        Confirm
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Payment — {settlement.referenceId}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Agent</span>
              <span className="font-medium">{agentName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-bold">
                RM {settlement.totalAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment Date</span>
              <span>
                {settlement.paymentDate
                  ? new Date(settlement.paymentDate).toLocaleDateString()
                  : "—"}
              </span>
            </div>
            {settlement.agentNotes && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Agent Note</span>
                <span>{settlement.agentNotes}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sales Included</span>
              <span>{settlement.saleIds.length}</span>
            </div>
          </div>

          <div>
            <Label>Admin Note (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. verified in bank statement"
              rows={2}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming ? "Confirming..." : "Confirm Payment Received"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayCommissionDialog({
  settlement,
  agentName,
}: {
  settlement: SettlementWithAgent;
  agentName: string;
}) {
  const markCommissionPaid = useMutation(
    api.agentSettlements.markCommissionPaid
  );
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await markCommissionPaid({
        settlementId: settlement._id,
        paymentMethod: paymentMethod as
          | "cash"
          | "bank_transfer"
          | "online"
          | "other",
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      setNotes("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="default" onClick={() => setOpen(true)} />
        }
      >
        <BanknoteIcon className="h-4 w-4 mr-1" />
        Pay Commission
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Pay Commission to {agentName} — {settlement.referenceId}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Agent</span>
              <span className="font-medium">{agentName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Commission Amount</span>
              <span className="font-bold text-green-600">
                RM {settlement.totalAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sales Included</span>
              <span>{settlement.saleIds.length}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={(v) => { if (v) setPaymentMethod(v); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Admin Note (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. transferred to agent's Maybank account"
              rows={2}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Processing..." : "Confirm Commission Paid"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettlementRow({
  settlement,
  direction,
}: {
  settlement: SettlementWithAgent;
  direction: "agent_to_hq" | "hq_to_agent";
}) {
  const [expanded, setExpanded] = useState(false);
  const detail = useQuery(
    api.agentSettlements.getWithSales,
    expanded ? { settlementId: settlement._id } : "skip"
  );

  const isPending = settlement.paymentStatus !== "paid";

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell>
          {expanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell className="font-medium">{settlement.agentName}</TableCell>
        <TableCell>
          <span className="font-mono text-sm">{settlement.referenceId}</span>
          <CopyButton text={settlement.referenceId} />
        </TableCell>
        <TableCell className={direction === "hq_to_agent" ? "font-semibold text-green-600" : "font-semibold"}>
          RM {settlement.totalAmount.toFixed(2)}
        </TableCell>
        <TableCell>
          {settlement.saleIds.length} sale{settlement.saleIds.length !== 1 ? "s" : ""}
        </TableCell>
        <TableCell>{paymentStatusBadge(settlement.paymentStatus)}</TableCell>
        <TableCell>
          {settlement.paymentDate
            ? new Date(settlement.paymentDate).toLocaleDateString()
            : settlement.confirmedAt
              ? new Date(settlement.confirmedAt).toLocaleDateString()
              : "—"}
        </TableCell>
        <TableCell
          className="text-right"
          onClick={(e) => e.stopPropagation()}
        >
          {direction === "agent_to_hq" &&
            settlement.paymentStatus === "submitted" && (
              <ConfirmPaymentDialog
                settlement={settlement}
                agentName={settlement.agentName}
              />
            )}
          {direction === "hq_to_agent" && isPending && (
            <PayCommissionDialog
              settlement={settlement}
              agentName={settlement.agentName}
            />
          )}
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/50 p-4">
            {settlement.agentNotes && (
              <p className="text-sm text-muted-foreground mb-3">
                Agent note: {settlement.agentNotes}
              </p>
            )}
            {settlement.notes && (
              <p className="text-sm text-muted-foreground mb-3">
                Admin note: {settlement.notes}
              </p>
            )}
            {!detail ? (
              <p className="text-sm text-muted-foreground">Loading sales...</p>
            ) : detail.sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales found.</p>
            ) : (
              <>
                <h4 className="font-semibold text-sm mb-2">
                  Included Sales ({detail.sales.length})
                </h4>
                <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Stock Model</TableHead>
                      <TableHead className="text-right">Sale Total</TableHead>
                      <TableHead className="text-right">HQ Share</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.sales.map((sale) => (
                      <TableRow key={sale._id}>
                        <TableCell className="text-sm">
                          {new Date(sale.saleDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {sale.customerDetail?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {sale.lineItemsWithProducts &&
                          sale.lineItemsWithProducts.length > 0 ? (
                            <div className="space-y-0.5">
                              {sale.lineItemsWithProducts.map(
                                (item: { productName: string; variantName?: string; quantity: number; productId: string }, i: number) => (
                                  <div key={i} className="text-xs">
                                    {item.productName}
                                    {item.variantName && (
                                      <span className="text-muted-foreground"> — {item.variantName}</span>
                                    )}{" "}
                                    <span className="text-muted-foreground">
                                      x{item.quantity}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {CHANNEL_LABELS[sale.saleChannel] ?? sale.saleChannel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {stockModelLabel(sale.stockModel)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          RM {sale.totalAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          RM {((sale as { computedHqPrice?: number }).computedHqPrice ?? sale.hqPrice ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-green-600">
                          RM {((sale as { computedCommission?: number }).computedCommission ?? sale.agentCommission ?? 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function SettlementsTable({
  settlements,
  direction,
  emptyMessage,
}: {
  settlements: SettlementWithAgent[];
  direction: "agent_to_hq" | "hq_to_agent";
  emptyMessage: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of settlements) seen.set(s.agentId, s.agentName);
    return Array.from(seen.entries()).map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
  }, [settlements]);

  const statusOptions = [
    { label: "Confirmed", value: "paid" },
    { label: "Awaiting Confirmation", value: "submitted" },
    { label: "Pending", value: "pending" },
  ];

  const hasActiveFilters = search !== "" || selectedAgents.size > 0 || selectedStatuses.size > 0;

  const filtered = useMemo(() => {
    let result = settlements;
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (s) => s.agentName.toLowerCase().includes(term) || s.referenceId.toLowerCase().includes(term)
      );
    }
    if (selectedAgents.size > 0) {
      result = result.filter((s) => selectedAgents.has(s.agentId));
    }
    if (selectedStatuses.size > 0) {
      result = result.filter((s) => selectedStatuses.has(s.paymentStatus));
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "agent") {
        cmp = a.agentName.localeCompare(b.agentName);
      } else if (sortCol === "amount") {
        cmp = a.totalAmount - b.totalAmount;
      } else if (sortCol === "status") {
        cmp = a.paymentStatus.localeCompare(b.paymentStatus);
      } else {
        const aDate = a.paymentDate ?? a.confirmedAt ?? a._creationTime;
        const bDate = b.paymentDate ?? b.confirmedAt ?? b._creationTime;
        cmp = (aDate ?? 0) - (bDate ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [settlements, search, selectedAgents, selectedStatuses, sortCol, sortDir]);

  return (
    <div className="space-y-4">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search agent, reference..."
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
        <FacetedFilter
          title="Status"
          options={statusOptions}
          selected={selectedStatuses}
          onSelectionChange={setSelectedStatuses}
        />
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
              <TableHead className="w-8" />
              <SortableHead label="Agent" column="agent" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <TableHead>Reference ID</TableHead>
              <SortableHead label="Amount" column="amount" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <TableHead>Sales</TableHead>
              <SortableHead label="Status" column="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableHead label="Date" column="date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {hasActiveFilters ? "No settlements match the current filters." : emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <SettlementRow key={s._id} settlement={s} direction={direction} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AgentPaymentsPage() {
  const allSettlements = useQuery(api.agentSettlements.listAllForAdmin);
  const isLoading = allSettlements === undefined;

  // Split by direction
  const commissionSettlements = (allSettlements ?? []).filter(
    (s) => s.direction === "hq_to_agent"
  );
  const paymentSettlements = (allSettlements ?? []).filter(
    (s) => (s.direction ?? "agent_to_hq") === "agent_to_hq"
  );

  // Count pending for badges
  const pendingCommissions = commissionSettlements.filter(
    (s) => s.paymentStatus !== "paid"
  );
  const pendingPayments = paymentSettlements.filter(
    (s) => s.paymentStatus === "submitted"
  );

  // Split each direction into pending/history
  const commissionPending = commissionSettlements.filter(
    (s) => s.paymentStatus !== "paid"
  );
  const commissionHistory = commissionSettlements.filter(
    (s) => s.paymentStatus === "paid"
  );
  const paymentPending = paymentSettlements.filter(
    (s) => s.paymentStatus !== "paid"
  );
  const paymentHistory = paymentSettlements.filter(
    (s) => s.paymentStatus === "paid"
  );

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Agent Payments
          </h1>
          <p className="text-muted-foreground">
            Review and confirm agent payments to HQ and commission payouts.
          </p>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <Tabs defaultValue="commission">
            <TabsList>
              <TabsTrigger value="commission">
                Commission to Agent
                {pendingCommissions.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingCommissions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="payment">
                Payment to HQ
                {pendingPayments.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingPayments.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="commission" className="space-y-6">
              {commissionPending.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    Pending
                    <Badge variant="secondary">{commissionPending.length}</Badge>
                  </h2>
                  <SettlementsTable
                    settlements={commissionPending}
                    direction="hq_to_agent"
                    emptyMessage="No pending commissions."
                  />
                </div>
              )}

              <div className="space-y-3">
                <h2 className="text-lg font-semibold">History</h2>
                <SettlementsTable
                  settlements={commissionHistory}
                  direction="hq_to_agent"
                  emptyMessage="No commission history yet."
                />
              </div>
            </TabsContent>

            <TabsContent value="payment" className="space-y-6">
              {paymentPending.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    Pending
                    <Badge variant="secondary">{paymentPending.length}</Badge>
                  </h2>
                  <SettlementsTable
                    settlements={paymentPending}
                    direction="agent_to_hq"
                    emptyMessage="No pending payments."
                  />
                </div>
              )}

              <div className="space-y-3">
                <h2 className="text-lg font-semibold">History</h2>
                <SettlementsTable
                  settlements={paymentHistory}
                  direction="agent_to_hq"
                  emptyMessage="No payment history yet."
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </RoleGuard>
  );
}
