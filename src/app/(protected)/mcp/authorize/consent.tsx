"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/useStoreUserEffect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2Icon, PlugIcon, TriangleAlertIcon } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";

export type AuthorizeParams = {
  clientId?: string;
  redirectUri?: string;
  responseType?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  state?: string;
};

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlertIcon className="size-4 text-destructive" />
          {title}
        </CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Start the connection again from your MCP client. If it keeps failing,
          remove the connector and add it afresh.
        </p>
      </CardContent>
    </Card>
  );
}

export function AuthorizeConsent({ params }: { params: AuthorizeParams }) {
  const user = useCurrentUser();
  const approve = useMutation(api.mcpOAuth.approve);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    clientId,
    redirectUri,
    responseType,
    codeChallenge,
    codeChallengeMethod,
    state,
  } = params;

  const missing = !clientId || !redirectUri || !codeChallenge;

  const request = useQuery(
    api.mcpOAuth.describeRequest,
    missing ? "skip" : { clientId, redirectUri }
  );

  if (missing) {
    return (
      <Problem
        title="Incomplete authorization request"
        detail="The client did not send a client id, redirect URL and PKCE challenge."
      />
    );
  }
  if (responseType && responseType !== "code") {
    return (
      <Problem
        title="Unsupported response type"
        detail={`This server only issues authorization codes, but the client asked for "${responseType}".`}
      />
    );
  }
  if (codeChallengeMethod && codeChallengeMethod !== "S256") {
    return (
      <Problem
        title="Unsupported PKCE method"
        detail={`This server requires S256, but the client asked for "${codeChallengeMethod}".`}
      />
    );
  }

  if (request === undefined || user === undefined) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!request.valid) {
    return <Problem title="This connection was rejected" detail={request.reason} />;
  }

  function leave(query: Record<string, string>) {
    // Safe to navigate: the redirect URL was checked against the ones the
    // client registered before we got here.
    const url = new URL(redirectUri!);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  }

  async function onApprove() {
    setWorking(true);
    setError(null);
    try {
      const { code } = await approve({
        clientId: clientId!,
        redirectUri: redirectUri!,
        codeChallenge: codeChallenge!,
        codeChallengeMethod: codeChallengeMethod ?? "S256",
      });
      leave({ code });
    } catch (err) {
      setError(getErrorMessage(err, "Could not approve this connection."));
      setWorking(false);
    }
  }

  const scopeLine =
    user?.role === "admin"
      ? "the whole business — all sales, stock, batches and payments"
      : "your own sales, stock and settlements";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlugIcon className="size-4" />
          Connect {request.clientName}?
        </CardTitle>
        <CardDescription>
          It is asking to reach The Mantra as{" "}
          <span className="font-medium">
            {user?.nickname ?? user?.name ?? user?.email}
          </span>
          .
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5 text-sm">
          <p className="font-medium">If you approve, it will be able to:</p>
          <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
            <li>Read {scopeLine}</li>
            {(user?.role === "agent" || user?.role === "sales") && (
              <li>File stock requests and record customer interests</li>
            )}
          </ul>
        </div>

        <Alert>
          <TriangleAlertIcon className="size-4" />
          <AlertTitle>Only approve a connection you started</AlertTitle>
          <AlertDescription>
            If you did not just add this connector yourself, cancel. Nothing here
            can move stock or take payment, but it can read your data. You can
            revoke access later under Settings → MCP access.
          </AlertDescription>
        </Alert>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>

      <CardFooter className="gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={working}
          onClick={() => leave({ error: "access_denied" })}
        >
          Cancel
        </Button>
        <Button className="flex-1" disabled={working} onClick={onApprove}>
          {working && <Loader2Icon className="size-4 animate-spin" />}
          Approve
        </Button>
      </CardFooter>
    </Card>
  );
}
