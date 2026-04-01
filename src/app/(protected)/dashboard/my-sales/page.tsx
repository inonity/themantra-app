"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import { SalesTable } from "@/components/sales/sales-table";
import { useMemo } from "react";

export default function AgentSalesPage() {
  const sales = useQuery(api.sales.listByAgent);
  const products = useQuery(api.products.list);
  const batches = useQuery(api.batches.listAll);

  // Extract unique offer IDs from sales
  const offerIds = useMemo(() => {
    if (!sales) return [];
    const ids = new Set<Id<"offers">>();
    for (const s of sales) {
      if (s.offerId) ids.add(s.offerId);
    }
    return [...ids];
  }, [sales]);

  const offers = useQuery(
    api.offers.getByIds,
    offerIds.length > 0 ? { ids: offerIds } : "skip"
  );

  const isLoading =
    sales === undefined ||
    products === undefined ||
    batches === undefined ||
    (offerIds.length > 0 && offers === undefined);

  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Sales History
          </h1>
          <p className="text-muted-foreground">
            View all sales you have recorded.
          </p>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <SalesTable
            sales={sales!}
            products={products!}
            batches={batches!}
            offers={offers ?? []}
          />
        )}
      </div>
    </RoleGuard>
  );
}
