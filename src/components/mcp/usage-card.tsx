"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActivityIcon } from "lucide-react";

const WINDOWS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function relative(ts: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Daily call counts as a bar strip — enough to see a trend, no chart library. */
function Sparkline({ daily }: { daily: number[] }) {
  const peak = Math.max(1, ...daily);
  return (
    <div className="flex h-12 items-end gap-px" aria-hidden>
      {daily.map((count, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-primary/70"
          style={{ height: `${Math.max(2, (count / peak) * 100)}%` }}
          title={`${count} calls`}
        />
      ))}
    </div>
  );
}

export function UsageCard() {
  // The query takes `now` as an argument rather than reading the clock inside
  // the query, so its results stay cacheable. Window and timestamp move
  // together, stamped when the user switches window rather than in an effect.
  const [range, setRange] = useState(() => ({ days: "30", now: Date.now() }));
  const { days, now } = range;

  // "all" = every connection this person can see; otherwise one token's id.
  const [connection, setConnection] = useState<string>("all");

  const usage = useQuery(api.mcpUsage.summary, {
    days: Number(days),
    now,
    ...(connection === "all"
      ? {}
      : { tokenId: connection as Id<"mcpTokens"> }),
  });

  const viewingAll = connection === "all";
  const selected = usage?.connections.find((c) => c.tokenId === connection);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ActivityIcon className="size-4" />
          Usage
        </CardTitle>
        <CardDescription>
          {!viewingAll && selected
            ? `Calls made by ${selected.name}. Tool arguments are not recorded.`
            : usage?.isAdmin
              ? "Every MCP tool call across the team. Tool arguments are not recorded."
              : "Your MCP tool calls. Tool arguments are not recorded."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={days}
            onValueChange={(v) => setRange({ days: v as string, now: Date.now() })}
          >
            <TabsList>
              {WINDOWS.map((w) => (
                <TabsTrigger key={w.value} value={w.value}>
                  {w.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Select
            value={connection}
            onValueChange={(v) => {
              if (v) setConnection(v as string);
            }}
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue>
                {viewingAll ? "All connections" : (selected?.name ?? "Connection")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All connections</SelectItem>
              {(usage?.connections ?? []).map((c) => (
                <SelectItem key={c.tokenId} value={c.tokenId}>
                  {c.name}
                  {c.ownerName ? ` · ${c.ownerName}` : ""}
                  {c.revoked ? " (revoked)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {usage === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : usage.totalCalls === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {viewingAll
              ? "No tool calls yet. Connect a client and ask it something."
              : "This connection has not made any calls in this window."}
          </p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Calls" value={usage.totalCalls.toLocaleString()} />
              <Stat label="Last 24h" value={usage.callsLast24h.toLocaleString()} />
              <Stat label="Errors" value={usage.errorCount.toLocaleString()} />
            </div>

            <Sparkline daily={usage.daily} />

            <div className="space-y-2">
              <h3 className="text-sm font-medium">By tool</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Avg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usage.tools.map((tool) => (
                      <TableRow key={tool.tool}>
                        <TableCell className="font-mono text-xs">
                          {tool.tool}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tool.calls}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {Math.round((tool.calls / usage.totalCalls) * 100)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tool.errors > 0 ? (
                            <span className="text-destructive">{tool.errors}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {tool.avgMs}ms
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {viewingAll && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">By token</h3>
              <p className="text-sm text-muted-foreground">
                Which connection is doing the work — useful for spotting a
                client you forgot was still connected.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      {usage.isAdmin && <TableHead>Owner</TableHead>}
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Last call</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usage.tokens.map((token, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{token.name}</span>
                            {token.tokenPrefix && (
                              <code className="text-xs text-muted-foreground">
                                mtk_{token.tokenPrefix}…
                              </code>
                            )}
                            {token.source === "oauth" && (
                              <Badge variant="secondary" className="text-[10px]">
                                connector
                              </Badge>
                            )}
                            {token.revoked && (
                              <Badge variant="outline" className="text-[10px]">
                                revoked
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        {usage.isAdmin && (
                          <TableCell className="text-muted-foreground">
                            {token.ownerName ?? "—"}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">
                          {token.calls}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {Math.round((token.calls / usage.totalCalls) * 100)}%
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {relative(token.lastCallAt, now)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            )}

            {viewingAll && usage.isAdmin && usage.people.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">By person</h3>
                <div className="space-y-1.5">
                  {usage.people.map((person) => (
                    <div
                      key={person.name}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="w-32 shrink-0 truncate">{person.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{
                            width: `${(person.calls / usage.totalCalls) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                        {person.calls}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Recent calls</h3>
              <div className="space-y-1">
                {usage.recent.map((call, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                  >
                    <code className="text-xs">{call.tool}</code>
                    {!call.ok && (
                      <Badge variant="outline" className="text-[10px] text-destructive">
                        error
                      </Badge>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {call.durationMs}ms · {relative(call.calledAt, now)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {usage.truncated && (
              <p className="text-xs text-muted-foreground">
                Showing the most recent 5,000 calls in this window.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
