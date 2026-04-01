"use client";

import { RoleGuard } from "@/components/role-guard";
import { RecordInterestForm } from "@/components/interests/record-interest-form";

export default function RecordInterestPage() {
  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Record Customer Interest
        </h1>
        <RecordInterestForm />
      </div>
    </RoleGuard>
  );
}
