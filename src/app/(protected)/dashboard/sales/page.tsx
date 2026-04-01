"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { SalesTable } from "@/components/sales/sales-table";
import { SalesAnalytics } from "@/components/sales/sales-analytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SalesOverviewPage() {
  const sales = useQuery(api.sales.list);
  const pendingFulfillment = useQuery(api.sales.listPendingFulfillment);
  const products = useQuery(api.products.list);
  const batches = useQuery(api.batches.listAll);
  const agents = useQuery(api.users.listAgents);
  const offers = useQuery(api.offers.list);

  const isLoading =
    sales === undefined ||
    products === undefined ||
    batches === undefined ||
    agents === undefined ||
    offers === undefined;

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Sales Overview
          </h1>
          <p className="text-muted-foreground">
            View all sales across agents with analytics.
          </p>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <>
            <SalesAnalytics sales={sales} />
            <Tabs defaultValue={0}>
              <TabsList>
                <TabsTrigger value={0}>All Sales</TabsTrigger>
                <TabsTrigger value={1}>
                  Pending Fulfillment
                  {pendingFulfillment && pendingFulfillment.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-xs font-medium text-orange-700">
                      {pendingFulfillment.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value={0}>
                <SalesTable
                  sales={sales}
                  products={products}
                  batches={batches}
                  agents={agents}
                  offers={offers}
                  showAgent
                />
              </TabsContent>
              <TabsContent value={1}>
                {pendingFulfillment === undefined ? (
                  <div className="text-muted-foreground">Loading...</div>
                ) : pendingFulfillment.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No sales pending fulfillment.
                  </div>
                ) : (
                  <SalesTable
                    sales={pendingFulfillment}
                    products={products}
                    batches={batches}
                    agents={agents}
                    offers={offers}
                    showAgent
                  />
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
