"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { InterestFormsList } from "@/components/interest-forms/interest-forms-list";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import Link from "next/link";

export default function InterestFormsPage() {
  const forms = useQuery(api.interestForms.listMy);

  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Interest Forms
            </h1>
            <p className="text-muted-foreground">
              Create shareable order forms for customers to fill in.
            </p>
          </div>
          <Button render={<Link href="/dashboard/interest-forms/create" />} nativeButton={false} className="w-full sm:w-auto">
            <PlusIcon className="h-4 w-4 mr-2" />
            New Form
          </Button>
        </div>

        {forms === undefined ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <InterestFormsList forms={forms} />
        )}
      </div>
    </RoleGuard>
  );
}
