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
      // Preserve where they were headed, so flows that carry query parameters
      // (the MCP connector consent screen) survive the trip through login.
      // Read from `location` rather than useSearchParams: this only runs in the
      // browser, and it keeps every protected page out of a Suspense boundary.
      const target = `${window.location.pathname}${window.location.search}`;
      router.push(
        target === "/dashboard"
          ? "/login"
          : `/login?next=${encodeURIComponent(target)}`
      );
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
