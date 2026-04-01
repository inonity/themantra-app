"use client";

import { useCurrentUser } from "@/hooks/useStoreUserEffect";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Role = "admin" | "agent" | "sales";

export function RoleGuard({
  allowed,
  children,
}: {
  allowed: Role[];
  children: React.ReactNode;
}) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      router.push("/login");
      return;
    }
    if (!user.role || !allowed.includes(user.role)) {
      router.push("/dashboard");
    }
  }, [user, allowed, router]);

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user?.role || !allowed.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
