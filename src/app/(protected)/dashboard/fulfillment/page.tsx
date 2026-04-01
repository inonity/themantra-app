"use client";

import { RoleGuard } from "@/components/role-guard";
import { HqFulfillmentDashboard } from "@/components/sales/hq-fulfillment-dashboard";

export default function FulfillmentPage() {
  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Fulfillment
          </h1>
          <p className="text-muted-foreground">
            Track pending fulfillment across all agents and review stock
            requests.
          </p>
        </div>
        <HqFulfillmentDashboard />
      </div>
    </RoleGuard>
  );
}
