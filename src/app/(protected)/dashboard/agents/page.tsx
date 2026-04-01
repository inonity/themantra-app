"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { AddAgentDialog } from "@/components/agents/add-agent-dialog";
import { AgentPricingDialog } from "@/components/agents/agent-pricing-dialog";
import { Button } from "@/components/ui/button";
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
  CopyIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  DollarSignIcon,
} from "lucide-react";
import { useState } from "react";

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
      {copied ? (
        <CheckIcon className="h-4 w-4 mr-1" />
      ) : (
        <CopyIcon className="h-4 w-4 mr-1" />
      )}
      {copied ? "Copied" : "Copy Link"}
    </Button>
  );
}

const STOCK_MODEL_LABELS: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  dropship: "Dropship",
};

export default function AgentsPage() {
  const agents = useQuery(api.users.listAgents);
  const salesStaff = useQuery(api.users.listSalesStaff);
  const invites = useQuery(api.agentInvites.list);
  const agentProfiles = useQuery(api.agentProfiles.listAll);
  const revokeInvite = useMutation(api.agentInvites.revoke);

  // Index profiles by agentId for quick lookup
  const profileMap = new Map(
    (agentProfiles ?? []).map((p) => [p.agentId, p])
  );

  const pendingInvites = invites?.filter((i) => i.status === "pending") ?? [];
  const isLoading = agents === undefined || invites === undefined || salesStaff === undefined;

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Team</h1>
            <p className="text-muted-foreground">
              Manage your agents, sales staff, and send invites.
            </p>
          </div>
          <div className="flex gap-2">
            <AddAgentDialog>
              <Button>
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Agent
              </Button>
            </AddAgentDialog>
            <AddAgentDialog defaultRole="sales">
              <Button variant="outline">
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Sales Staff
              </Button>
            </AddAgentDialog>
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <>
            {/* Active Agents */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">
                Active Agents ({agents.length})
              </h2>
              {agents.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No agents yet. Add one using the button above.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Default Model</TableHead>
                      <TableHead className="w-[100px]">Pricing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.map((agent) => {
                      const profile = profileMap.get(agent._id);
                      return (
                        <TableRow key={agent._id}>
                          <TableCell className="font-medium">
                            {agent.nickname ?? agent.name ?? agent.email ?? "—"}
                          </TableCell>
                          <TableCell>{agent.email ?? "—"}</TableCell>
                          <TableCell>{agent.phone ?? "—"}</TableCell>
                          <TableCell>
                            {profile?.defaultStockModel ? (
                              <Badge variant="outline">
                                {STOCK_MODEL_LABELS[profile.defaultStockModel] ?? profile.defaultStockModel}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <AgentPricingDialog
                              agentId={agent._id}
                              agentName={agent.nickname ?? agent.name ?? agent.email ?? "Agent"}
                            >
                              <Button variant="ghost" size="sm" title="Pricing">
                                <DollarSignIcon className="h-4 w-4" />
                              </Button>
                            </AgentPricingDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Sales Staff */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">
                Sales Staff ({salesStaff.length})
              </h2>
              {salesStaff.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No sales staff yet. Add one using the button above.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Default Model</TableHead>
                      <TableHead className="w-[100px]">Pricing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesStaff.map((staff) => {
                      const profile = profileMap.get(staff._id);
                      return (
                        <TableRow key={staff._id}>
                          <TableCell className="font-medium">
                            {staff.nickname ?? staff.name ?? staff.email ?? "—"}
                          </TableCell>
                          <TableCell>{staff.email ?? "—"}</TableCell>
                          <TableCell>{staff.phone ?? "—"}</TableCell>
                          <TableCell>
                            {profile?.defaultStockModel ? (
                              <Badge variant="outline">
                                {STOCK_MODEL_LABELS[profile.defaultStockModel] ?? profile.defaultStockModel}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <AgentPricingDialog
                              agentId={staff._id}
                              agentName={staff.nickname ?? staff.name ?? staff.email ?? "Sales"}
                            >
                              <Button variant="ghost" size="sm" title="Pricing">
                                <DollarSignIcon className="h-4 w-4" />
                              </Button>
                            </AgentPricingDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Pending Invites */}
            {pendingInvites.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">
                  Pending Invites ({pendingInvites.length})
                </h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvites.map((invite) => (
                      <TableRow key={invite._id}>
                        <TableCell className="font-medium">
                          {invite.name}
                        </TableCell>
                        <TableCell>{invite.email}</TableCell>
                        <TableCell>{invite.phone}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary">Pending</Badge>
                            <Badge variant="outline">
                              {(invite as { role?: string }).role === "sales" ? "Sales" : "Agent"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <CopyLinkButton token={invite.inviteToken} />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                revokeInvite({ inviteId: invite._id })
                              }
                            >
                              <TrashIcon className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
