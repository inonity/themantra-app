"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

type Alert = {
  batchId: string;
  batchCode: string;
  productName: string;
  expectedReadyDate: string;
  status: "upcoming" | "partial" | "available" | "depleted" | "cancelled";
  daysUntil: number;
  totalQuantity: number;
};

export function BatchMaturationCard({ alerts }: { alerts: Alert[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Maturing batches</CardTitle>
          <CardDescription>Ready within 7 days or overdue</CardDescription>
        </div>
        <Link
          href="/dashboard/batches"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Manage
        </Link>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No batches maturing soon.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {alerts.slice(0, 6).map((a) => {
              const overdue = a.daysUntil < 0;
              return (
                <li key={a.batchId} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">
                      {a.productName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {a.batchCode} · {a.totalQuantity} units
                    </span>
                  </div>
                  <Badge variant={overdue ? "destructive" : "secondary"}>
                    {overdue
                      ? `${-a.daysUntil}d overdue`
                      : a.daysUntil === 0
                        ? "Today"
                        : `in ${a.daysUntil}d`}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
