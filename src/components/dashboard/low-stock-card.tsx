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

type Row = {
  productId: string;
  variantId?: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  threshold: number;
};

export function LowStockCard({
  rows,
  description = "HQ inventory below threshold",
  href = "/dashboard/stock",
  linkLabel = "Stock",
}: {
  rows: Row[];
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Low stock</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Link
          href={href}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {linkLabel}
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            All stock above threshold.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {rows.slice(0, 6).map((r) => (
              <li
                key={`${r.productId}|${r.variantId ?? ""}`}
                className="flex items-center justify-between py-2.5 gap-3"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{r.productName}</span>
                  {r.variantName && (
                    <span className="text-xs text-muted-foreground truncate">
                      {r.variantName}
                    </span>
                  )}
                </div>
                <Badge variant={r.quantity === 0 ? "destructive" : "secondary"}>
                  {r.quantity} left
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
