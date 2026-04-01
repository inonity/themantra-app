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
    inventory === undefined || businessInventory === undefined;

  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Record a Sale
        </h1>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
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
