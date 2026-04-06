"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { RecordSaleForm } from "@/components/sales/record-sale-form";
import { useCurrentUser } from "@/hooks/useStoreUserEffect";

export default function RecordSalePage() {
  const user = useCurrentUser();
  const inventory = useQuery(api.inventory.getForAgent);
  const businessInventory = useQuery(api.inventory.getBusinessInventory);
  const agentProfile = useQuery(api.agentProfiles.getMyProfile);

  const isLoading =
    inventory === undefined || businessInventory === undefined || agentProfile === undefined;

  const isNotConfigured =
    !isLoading && (!agentProfile?.defaultStockModel || !agentProfile?.rateId);

  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">
            New Sale Order
          </h1>
          <p className="text-muted-foreground mt-1">
            Create a new sale order with customer and product details.
          </p>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground max-w-4xl mx-auto">Loading...</div>
        ) : isNotConfigured ? (
          <div className="max-w-4xl mx-auto rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center space-y-2">
            <p className="font-semibold text-destructive">Account not configured</p>
            <p className="text-sm text-muted-foreground">
              Your account is missing a pricing rate or stock model. Please contact an admin to set up your profile before recording orders.
            </p>
          </div>
        ) : (
          <RecordSaleForm
            inventory={inventory}
            businessInventory={businessInventory}
            agentProfile={agentProfile}
            userRole={user?.role}
          />
        )}
      </div>
    </RoleGuard>
  );
}
