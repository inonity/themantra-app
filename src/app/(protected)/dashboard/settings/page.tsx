"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { AccountSection } from "@/components/settings/account-section";
import { RoleSection } from "@/components/settings/role-section";
import { PaymentPreferencesSection } from "@/components/settings/payment-preferences-section";
import { Skeleton } from "@/components/ui/skeleton";

function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

export default function SettingsPage() {
  const settingsData = useQuery(api.users.getSettingsData);

  if (settingsData === undefined) {
    return <SettingsSkeleton />;
  }

  if (settingsData === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Not authenticated</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and view your role details.
        </p>
      </div>

      <AccountSection user={settingsData.user} />
      <RoleSection data={settingsData} />
      {(settingsData.user.role === "agent" ||
        settingsData.user.role === "sales") && (
        <PaymentPreferencesSection
          agentProfile={settingsData.agentProfile}
          paymentQrUrl={settingsData.paymentQrUrl}
        />
      )}
    </div>
  );
}
