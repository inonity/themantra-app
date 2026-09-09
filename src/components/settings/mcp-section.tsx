"use client";

import { useCurrentUser } from "@/hooks/useStoreUserEffect";
import { mcpEndpointUrl } from "@/lib/mcp";
import { SetupGuide } from "@/components/mcp/setup-guide";
import { TokenManager } from "@/components/mcp/token-manager";
import { UsageCard } from "@/components/mcp/usage-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoIcon } from "lucide-react";

const READ_CAPABILITIES = [
  ["Overview", "Revenue, orders and units with period-on-period change"],
  ["Products", "Catalogue with variants, prices and stock levels"],
  ["Inventory", "Stock on hand by product, variant, batch or holder"],
  ["Sales", "Filter and inspect sales, including full line items"],
  ["Batches", "Production runs, released units and maturation dates"],
  ["Payments", "Unpaid sales and agent settlements in both directions"],
  ["Rankings", "Top products, sellers and channels for a period"],
  ["Stock requests", "Requests agents have sent to HQ"],
];

const WRITE_CAPABILITIES = [
  ["Request stock", "File a stock request with HQ — moves no stock itself"],
  ["Record interest", "Log a customer's interest — not a sale, no money recorded"],
];

export function McpSection({ appOrigin }: { appOrigin: string }) {
  const user = useCurrentUser();
  const endpoint = mcpEndpointUrl(appOrigin);
  const isSeller = user?.role === "agent" || user?.role === "sales";

  return (
    <div className="space-y-6">
      <Separator />

      <div>
        <h2 className="text-xl font-semibold tracking-tight">MCP access</h2>
        <p className="text-muted-foreground">
          Connect Claude, Codex or any MCP client to The Mantra, so you can ask
          about stock, sales and payments in plain language.
        </p>
      </div>

      <Alert>
        <InfoIcon className="size-4" />
        <AlertTitle>A connection acts as you</AlertTitle>
        <AlertDescription>
          {user?.role === "admin"
            ? "Your tokens see the whole business, exactly as your admin account does. Treat one like your password."
            : "Your tokens see only your own sales, stock and settlements — the same as when you sign in. Treat one like your password."}
        </AlertDescription>
      </Alert>

      {endpoint ? <SetupGuide endpoint={endpoint} /> : <Skeleton className="h-72 w-full rounded-xl" />}

      <TokenManager />

      <UsageCard />

      <Card>
        <CardHeader>
          <CardTitle>What a connected client can do</CardTitle>
          <CardDescription>
            Everything below is scoped to your account. Nothing here can move
            stock, take payment, or change a sale — those stay in the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Reading</h3>
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[10rem_1fr]">
              {READ_CAPABILITIES.map(([name, detail]) => (
                <div key={name} className="contents">
                  <dt className="text-sm font-medium">{name}</dt>
                  <dd className="text-sm text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Writing</h3>
            {isSeller ? (
              <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[10rem_1fr]">
                {WRITE_CAPABILITIES.map(([name, detail]) => (
                  <div key={name} className="contents">
                    <dt className="text-sm font-medium">{name}</dt>
                    <dd className="text-sm text-muted-foreground">{detail}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                None. Stock requests and customer interests are recorded by
                agents and sales staff, so admin connections are read-only.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
