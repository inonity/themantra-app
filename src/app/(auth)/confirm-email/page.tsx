"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CheckCircleIcon, XCircleIcon } from "lucide-react";

function ConfirmEmailInner({ token }: { token: string }) {
  const router = useRouter();
  const confirmEmailChange = useMutation(api.users.confirmEmailChange);
  const { signOut } = useAuthActions();
  const ran = useRef(false);

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const res = await confirmEmailChange({ token });
        if (res.success) {
          setStatus("success");
          // Sessions are already invalidated server-side by confirmEmailChange,
          // so signOut just clears the client-side token. No need to await it.
          signOut().catch(() => {});
          setTimeout(() => router.push("/login?emailConfirmed=true"), 2000);
        } else {
          setStatus("error");
          setErrorMessage(res.error ?? "Confirmation failed");
        }
      } catch {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl text-center">
          {status === "loading" && "Confirming email..."}
          {status === "success" && "Email confirmed!"}
          {status === "error" && "Confirmation failed"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {status === "loading" && (
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        )}
        {status === "success" && (
          <>
            <CheckCircleIcon className="h-8 w-8 text-green-600" />
            <p className="text-sm text-muted-foreground text-center">
              Your email has been updated. Redirecting to sign in...
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircleIcon className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">
              {errorMessage}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/login")}
            >
              Go to Sign In
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      {token ? (
        <ConfirmEmailInner token={token} />
      ) : (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl text-center">Invalid Link</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <XCircleIcon className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">
              Missing confirmation token. Please use the link from your email.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ConfirmEmailContent />
    </Suspense>
  );
}
