"use client";

import { useCurrentUser } from "@/hooks/useStoreUserEffect";

export default function DashboardPage() {
  const user = useCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back{user?.email ? `, ${user.email}` : ""}.
          {user?.role === "admin" &&
            " Manage your inventory and track sales."}
          {user?.role === "agent" &&
            " View your inventory and record sales."}
          {user?.role === "sales" &&
            " Record sales and track your performance."}
        </p>
      </div>
    </div>
  );
}
