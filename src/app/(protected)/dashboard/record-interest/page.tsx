"use client";

import { RoleGuard } from "@/components/role-guard";
import { RecordInterestForm } from "@/components/interests/record-interest-form";

export default function RecordInterestPage() {
  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">
            Record Interest
          </h1>
          <p className="text-muted-foreground mt-1">
            Record a customer&apos;s interest in one or more products.
          </p>
        </div>
        <RecordInterestForm />
      </div>
    </RoleGuard>
  );
}
