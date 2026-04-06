"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  emailConfirmed,
  errorMessage,
}: {
  emailConfirmed?: boolean;
  errorMessage?: string;
}) {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [signInComplete, setSignInComplete] = useState(false);

  // Wait for Convex backend to confirm authentication before navigating.
  // signIn() resolves before useConvexAuth() reflects the new state,
  // so navigating immediately would hit a frame where isAuthenticated is false,
  // causing AuthGuard to redirect back to /login.
  useEffect(() => {
    if (signInComplete && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [signInComplete, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await signIn("password", { email, password, flow: "signIn" });
      setSignInComplete(true);
    } catch (err) {
      console.error("Sign-in error:", err);
      const raw = err instanceof Error ? err.message : "";
      const isCredentialError =
        raw === "InvalidSecret" ||
        raw === "InvalidAccountId" ||
        raw.includes("InvalidSecret") ||
        raw.includes("InvalidAccountId");
      setError(isCredentialError ? "Invalid email or password." : (raw || "Sign-in failed. Please try again."));
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>
          Enter your email and password to sign in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {emailConfirmed && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Email updated successfully. Please sign in with your new email.
          </div>
        )}
        {errorMessage && (
          <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground underline underline-offset-4"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
