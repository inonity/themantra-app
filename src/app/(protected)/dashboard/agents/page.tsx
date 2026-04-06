"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { AddAgentDialog } from "@/components/agents/add-agent-dialog";
import { AgentPricingDialog } from "@/components/agents/agent-pricing-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  CopyIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  DollarSignIcon,
  MailIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  XIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FacetedFilter } from "@/components/stock/faceted-filter";
import { useState, useMemo } from "react";

type SortDir = "asc" | "desc";

function SortableHead({
  label,
  active,
  dir,
  onSort,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
}) {
  return (
    <TableHead>
      <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={onSort}>
        {label}
        {active ? (
          dir === "asc" ? <ArrowUpIcon className="ml-2 h-4 w-4" /> : <ArrowDownIcon className="ml-2 h-4 w-4" />
        ) : (
          <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />
        )}
      </Button>
    </TableHead>
  );
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/join?token=${token}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? <CheckIcon className="h-4 w-4 mr-1" /> : <CopyIcon className="h-4 w-4 mr-1" />}
      {copied ? "Copied" : "Copy Link"}
    </Button>
  );
}

function EmailStatusBadge({ status, error, sentAt }: { status?: string; error?: string; sentAt?: number }) {
  if (!status) return <span className="text-muted-foreground text-xs">No email</span>;

  if (status === "sent") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className="gap-1">
            <MailIcon className="h-3 w-3" /> Sent
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{sentAt ? `Sent ${new Date(sentAt).toLocaleString()}` : "Email sent"}</TooltipContent>
      </Tooltip>
    );
  }

  if (status === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="destructive" className="gap-1">
            <AlertCircleIcon className="h-3 w-3" /> Failed
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{error ?? "Email delivery failed"}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <RefreshCwIcon className="h-3 w-3 animate-spin" /> Sending
    </Badge>
  );
}

function PeopleTable({
  rows,
  profileMap,
  rateMap,
  emptyText,
}: {
  rows: { _id: string; nickname?: string | null; name?: string | null; email?: string | null; phone?: string | null }[];
  profileMap: Map<string, { rateId?: string | null }>;
  rateMap: Map<string, string>;
  emptyText: string;
}) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<"name" | "email">("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: "name" | "email") {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    let result = rows;
    if (search) {
      const term = search.toLowerCase();
      result = result.filter((r) =>
        (r.nickname ?? r.name ?? "").toLowerCase().includes(term) ||
        (r.email ?? "").toLowerCase().includes(term)
      );
    }
    return [...result].sort((a, b) => {
      const aVal = sortCol === "name"
        ? (a.nickname ?? a.name ?? a.email ?? "")
        : (a.email ?? "");
      const bVal = sortCol === "name"
        ? (b.nickname ?? b.name ?? b.email ?? "")
        : (b.email ?? "");
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sortCol, sortDir]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[150px] lg:w-[250px]"
        />
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="h-8">
            Reset <XIcon className="ml-2 size-4" />
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <SortableHead label="Name" active={sortCol === "name"} dir={sortDir} onSort={() => handleSort("name")} />
                <SortableHead label="Email" active={sortCol === "email"} dir={sortDir} onSort={() => handleSort("email")} />
                <TableHead>Phone</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No results match your search.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((person) => {
                  const profile = profileMap.get(person._id);
                  return (
                    <TableRow key={person._id}>
                      <TableCell className="font-medium">
                        {person.nickname ?? person.name ?? person.email ?? "—"}
                      </TableCell>
                      <TableCell>{person.email ?? "—"}</TableCell>
                      <TableCell>{person.phone ?? "—"}</TableCell>
                      <TableCell>
                        {profile?.rateId ? (
                          <Badge variant="outline">{rateMap.get(profile.rateId) ?? "Unknown"}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <AgentPricingDialog
                          agentId={person._id as Parameters<typeof AgentPricingDialog>[0]["agentId"]}
                          agentName={person.nickname ?? person.name ?? person.email ?? "Agent"}
                        >
                          <Button variant="ghost" size="sm" title="Rate">
                            <DollarSignIcon className="h-4 w-4" />
                          </Button>
                        </AgentPricingDialog>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  const agents = useQuery(api.users.listAgents);
  const salesStaff = useQuery(api.users.listSalesStaff);
  const invites = useQuery(api.agentInvites.list);
  const agentProfiles = useQuery(api.agentProfiles.listAll);
  const rates = useQuery(api.rates.list);
  const revokeInvite = useMutation(api.agentInvites.revoke);
  const resendEmail = useMutation(api.agentInvites.resendInviteEmail);

  const profileMap = new Map((agentProfiles ?? []).map((p) => [p.agentId, p]));
  const rateMap = new Map((rates ?? []).map((r) => [r._id, r.name]));

  const isLoading = agents === undefined || invites === undefined || salesStaff === undefined;
  const agentsCount = (agents?.length ?? 0) + (salesStaff?.length ?? 0);
  const invitesCount = invites?.length ?? 0;

  // Invite filters
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedInviteStatuses, setSelectedInviteStatuses] = useState<Set<string>>(new Set());
  const [inviteSortCol, setInviteSortCol] = useState<"name" | "status">("name");
  const [inviteSortDir, setInviteSortDir] = useState<SortDir>("asc");

  function handleInviteSort(col: "name" | "status") {
    if (inviteSortCol === col) setInviteSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setInviteSortCol(col); setInviteSortDir("asc"); }
  }

  const hasInviteFilters = inviteSearch !== "" || selectedRoles.size > 0 || selectedInviteStatuses.size > 0;

  const filteredInvites = useMemo(() => {
    let result = invites ?? [];
    if (inviteSearch) {
      const term = inviteSearch.toLowerCase();
      result = result.filter(
        (i) => i.name.toLowerCase().includes(term) || i.email.toLowerCase().includes(term)
      );
    }
    if (selectedRoles.size > 0) {
      result = result.filter((i) => selectedRoles.has(i.role === "sales" ? "sales" : "agent"));
    }
    if (selectedInviteStatuses.size > 0) {
      result = result.filter((i) =>
        selectedInviteStatuses.has(i.status === "completed" ? "completed" : "pending")
      );
    }
    return [...result].sort((a, b) => {
      const aVal = inviteSortCol === "name" ? a.name : (a.status === "completed" ? "joined" : "pending");
      const bVal = inviteSortCol === "name" ? b.name : (b.status === "completed" ? "joined" : "pending");
      const cmp = aVal.localeCompare(bVal);
      return inviteSortDir === "asc" ? cmp : -cmp;
    });
  }, [invites, inviteSearch, selectedRoles, selectedInviteStatuses, inviteSortCol, inviteSortDir]);

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Agents</h1>
            <p className="text-muted-foreground">Manage your agents, sales staff, and send invites.</p>
          </div>
          <AddAgentDialog>
            <Button className="w-full sm:w-auto">
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Agent
            </Button>
          </AddAgentDialog>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <Tabs defaultValue="agents">
            <TabsList>
              <TabsTrigger value="agents">
                Agents {agentsCount > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">{agentsCount}</span>}
              </TabsTrigger>
              <TabsTrigger value="invitations">
                Invitations {invitesCount > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">{invitesCount}</span>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="agents" className="space-y-8 mt-6">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Active Agents ({agents.length})</h2>
                <PeopleTable
                  rows={agents}
                  profileMap={profileMap}
                  rateMap={rateMap}
                  emptyText="No agents yet. Add one using the button above."
                />
              </div>
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Sales Staff ({salesStaff.length})</h2>
                <PeopleTable
                  rows={salesStaff}
                  profileMap={profileMap}
                  rateMap={rateMap}
                  emptyText="No sales staff yet. Add one using the button above."
                />
              </div>
            </TabsContent>

            <TabsContent value="invitations" className="mt-6 space-y-4">
              {/* Invite toolbar */}
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <Input
                  placeholder="Search invitations..."
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  className="h-8 w-[150px] lg:w-[250px]"
                />
                <FacetedFilter
                  title="Role"
                  options={[
                    { label: "Agent", value: "agent" },
                    { label: "Sales", value: "sales" },
                  ]}
                  selected={selectedRoles}
                  onSelectionChange={setSelectedRoles}
                />
                <FacetedFilter
                  title="Status"
                  options={[
                    { label: "Pending", value: "pending" },
                    { label: "Joined", value: "completed" },
                  ]}
                  selected={selectedInviteStatuses}
                  onSelectionChange={setSelectedInviteStatuses}
                />
                {hasInviteFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setInviteSearch(""); setSelectedRoles(new Set()); setSelectedInviteStatuses(new Set()); }}
                    className="h-8"
                  >
                    Reset <XIcon className="ml-2 size-4" />
                  </Button>
                )}
              </div>

              {invites.length === 0 ? (
                <p className="text-muted-foreground text-sm">No invitations yet.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <SortableHead label="Name" active={inviteSortCol === "name"} dir={inviteSortDir} onSort={() => handleInviteSort("name")} />
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <SortableHead label="Status" active={inviteSortCol === "status"} dir={inviteSortDir} onSort={() => handleInviteSort("status")} />
                        <TableHead>Email Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvites.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No invitations match the current filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInvites.map((invite) => (
                          <TableRow key={invite._id}>
                            <TableCell className="font-medium">{invite.name}</TableCell>
                            <TableCell>{invite.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {invite.role === "sales" ? "Sales" : "Agent"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={invite.status === "completed" ? "default" : "secondary"}>
                                {invite.status === "completed" ? "Joined" : "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <EmailStatusBadge
                                status={invite.emailStatus}
                                error={invite.emailError}
                                sentAt={invite.emailSentAt}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {invite.status === "pending" && (
                                  <>
                                    {(invite.emailStatus === "failed" || invite.emailStatus === "sent") && (
                                      <Tooltip>
                                        <TooltipTrigger
                                          render={
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => resendEmail({ inviteId: invite._id, siteUrl: window.location.origin })}
                                            />
                                          }
                                        >
                                          <RefreshCwIcon className="h-4 w-4" />
                                        </TooltipTrigger>
                                        <TooltipContent>Resend email</TooltipContent>
                                      </Tooltip>
                                    )}
                                    <CopyLinkButton token={invite.inviteToken} />
                                    <Tooltip>
                                      <TooltipTrigger
                                        render={
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => revokeInvite({ inviteId: invite._id })}
                                          />
                                        }
                                      >
                                        <TrashIcon className="h-4 w-4" />
                                      </TooltipTrigger>
                                      <TooltipContent>Revoke invite</TooltipContent>
                                    </Tooltip>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </RoleGuard>
  );
}
