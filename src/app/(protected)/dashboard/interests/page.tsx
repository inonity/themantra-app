"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { InterestsTable } from "@/components/interests/interests-table";
import Link from "next/link";

export default function InterestsPage() {
  const interests = useQuery(api.interests.listMy, {});
  const products = useQuery(api.products.list);

  const isLoading = interests === undefined || products === undefined;

  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Customer Interests
            </h1>
            <p className="text-muted-foreground">
              Track customer interest and convert to sales when ready.
            </p>
          </div>
          <Link
            href="/dashboard/record-interest"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-primary text-primary-foreground text-sm font-medium h-8 gap-1.5 px-2.5 hover:bg-primary/80 transition-all"
          >
            Record Interest
          </Link>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <InterestsTable interests={interests} products={products} />
        )}
      </div>
    </RoleGuard>
  );
}
