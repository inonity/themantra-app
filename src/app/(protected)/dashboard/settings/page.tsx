"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { AccountSection } from "@/components/settings/account-section";
import { RoleSection } from "@/components/settings/role-section";

export default function SettingsPage() {
  const settingsData = useQuery(api.users.getSettingsData);

  if (settingsData === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (settingsData === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Not authenticated</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and view your role details.
        </p>
      </div>

      <AccountSection user={settingsData.user} />
      <RoleSection data={settingsData} />
    </div>
  );
}
