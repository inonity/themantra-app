"use client";

import { Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { InterestsTable } from "@/components/interests/interests-table";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function InterestsContent() {
  const searchParams = useSearchParams();
  const defaultFormId = searchParams.get("formId") ?? undefined;

  const interests = useQuery(api.interests.listMy, {});
  const products = useQuery(api.products.list);
  const forms = useQuery(api.interestForms.listMy);

  const isLoading = interests === undefined || products === undefined || forms === undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Customer Interests
          </h1>
          <p className="text-muted-foreground">
            Track customer interest and convert to sales when ready.
          </p>
        </div>
        <Button render={<Link href="/dashboard/record-interest" />} nativeButton={false} className="w-full sm:w-auto">
          <PlusIcon className="h-4 w-4 mr-2" />
          Record Interest
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <InterestsTable
          interests={interests}
          products={products}
          forms={forms}
          defaultFormId={defaultFormId}
        />
      )}
    </div>
  );
}

export default function InterestsPage() {
  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <InterestsContent />
      </Suspense>
    </RoleGuard>
  );
}
