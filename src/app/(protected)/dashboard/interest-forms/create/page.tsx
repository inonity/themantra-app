"use client";

import { RoleGuard } from "@/components/role-guard";
import { CreateInterestFormForm } from "@/components/interest-forms/create-interest-form";

export default function CreateInterestFormPage() {
  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div className="max-w-xl mx-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Create Interest Form</h1>
          <p className="text-muted-foreground mt-1">
            Create a shareable form for customers to express interest.
          </p>
        </div>
        <CreateInterestFormForm />
      </div>
    </RoleGuard>
  );
}
