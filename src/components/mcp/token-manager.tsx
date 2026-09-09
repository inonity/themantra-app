"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KeyRoundIcon, Loader2Icon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";
import { CopyField } from "./copy-field";

type TokenRow = {
  _id: Id<"mcpTokens">;
  name: string;
  tokenPrefix: string;
  source: "manual" | "oauth";
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  ownerName?: string;
};

function formatDate(ts: number | null): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function TokenTable({
  tokens,
  showOwner,
  onRequestRevoke,
  revoking,
}: {
  tokens: TokenRow[];
  showOwner: boolean;
  onRequestRevoke: (token: TokenRow) => void;
  revoking: Id<"mcpTokens"> | null;
}) {
  if (tokens.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No tokens yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            {showOwner && <TableHead>Owner</TableHead>}
            <TableHead>Token</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tokens.map((token) => (
            <TableRow key={token._id} className={token.revokedAt ? "opacity-50" : ""}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {token.name}
                  {token.source === "oauth" && (
                    <Badge variant="secondary" className="text-[10px]">
                      connector
                    </Badge>
                  )}
                  {token.revokedAt && (
                    <Badge variant="outline" className="text-[10px]">
                      revoked
                    </Badge>
                  )}
                </span>
              </TableCell>
              {showOwner && (
                <TableCell className="text-muted-foreground">
                  {token.ownerName ?? "—"}
                </TableCell>
              )}
              <TableCell className="font-mono text-xs text-muted-foreground">
                mtk_{token.tokenPrefix}…
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(token.createdAt)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(token.lastUsedAt)}
              </TableCell>
              <TableCell className="text-right">
                {token.revokedAt ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoking === token._id}
                    onClick={() => onRequestRevoke(token)}
                  >
                    Revoke
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TokenManager() {
  const tokens = useQuery(api.mcpTokens.list);
  const createToken = useAction(api.mcpTokens.create);
  const revokeToken = useMutation(api.mcpTokens.revoke);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<Id<"mcpTokens"> | null>(null);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<TokenRow | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const result = await createToken({ name });
      setFreshSecret(result.secret);
      setName("");
      toast.success("Token created — copy it now.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create the token."));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    const target = pendingRevoke;
    if (!target) return;
    setPendingRevoke(null);
    setRevoking(target._id);
    try {
      await revokeToken({ tokenId: target._id });
      toast.success("Token revoked.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not revoke the token."));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          Access tokens
        </CardTitle>
        <CardDescription>
          A token acts as you: it sees exactly the data your account sees, and
          nothing more. Create one per device or client so you can revoke them
          individually.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {freshSecret && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
            <div className="flex items-start gap-2">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Copy this token now — it will not be shown again.
                </p>
                <p className="text-sm text-muted-foreground">
                  Only a hash is stored, so it cannot be recovered. If you lose
                  it, revoke it and create another.
                </p>
              </div>
            </div>
            <CopyField value={freshSecret} label="access token" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFreshSecret(null)}
            >
              I&apos;ve saved it
            </Button>
          </div>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="token-name">Token name</Label>
            <Input
              id="token-name"
              placeholder="e.g. MacBook — Claude Code"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlusIcon className="size-4" />
            )}
            Create token
          </Button>
        </form>

        <Separator />

        {tokens === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Your tokens</h3>
              <TokenTable
                tokens={tokens.mine}
                showOwner={false}
                onRequestRevoke={setPendingRevoke}
                revoking={revoking}
              />
            </div>

            {tokens.others.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Team tokens</h3>
                <p className="text-sm text-muted-foreground">
                  Tokens belonging to other people. You can revoke these as an
                  admin — for example when someone leaves.
                </p>
                <TokenTable
                  tokens={tokens.others}
                  showOwner
                  onRequestRevoke={setPendingRevoke}
                  revoking={revoking}
                />
              </div>
            )}
          </div>
        )}

        <AlertDialog
          open={pendingRevoke !== null}
          onOpenChange={(open) => {
            if (!open) setPendingRevoke(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
              <AlertDialogDescription>
                Any AI client using{" "}
                <span className="font-medium">{pendingRevoke?.name}</span> loses
                access immediately. This cannot be undone — you would need to
                create a new token and reconnect.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRevoke}>Revoke</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
