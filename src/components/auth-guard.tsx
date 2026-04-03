"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useCurrentUser } from "@/hooks/useStoreUserEffect";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useCurrentUser();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const signingOut = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // If authenticated but user record is missing (deleted user, stale session),
  // sign out and redirect to login.
  useEffect(() => {
    if (isAuthenticated && user === null && !signingOut.current) {
      signingOut.current = true;
      signOut().then(() => router.push("/login"));
    }
  }, [isAuthenticated, user, signOut, router]);

  if (isLoading || (isAuthenticated && user === undefined)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated || user === null) {
    return null;
  }

  return <>{children}</>;
}
