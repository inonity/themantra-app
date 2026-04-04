"use client";

import { Doc } from "../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SalesAnalytics({
  sales,
}: {
  sales: Doc<"sales">[];
}) {
  const totalSales = sales.length;
  const totalUnits = sales.reduce((sum, s) => sum + s.totalQuantity, 0);
  const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
  const avgRevenue = totalSales > 0 ? totalRevenue / totalSales : 0;

  const pendingFulfillment = sales.filter(
    (s) => s.fulfillmentStatus === "pending_stock"
  ).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Sales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{totalSales}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Units Sold
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{totalUnits}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            RM{totalRevenue.toFixed(2)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Avg per Sale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            RM{avgRevenue.toFixed(2)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pending Stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{pendingFulfillment}</div>
          <div className="text-sm text-muted-foreground">
            {pendingFulfillment === 0 ? "All fulfilled" : "awaiting delivery"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
