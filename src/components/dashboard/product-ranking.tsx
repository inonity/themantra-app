"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type Row = {
  productId: string;
  variantId?: string;
  productName: string;
  variantName: string | null;
  units: number;
  revenue: number;
};

const chartConfig = {
  units: { label: "Units sold", color: "var(--chart-2)" },
  revenue: { label: "Revenue", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function ProductRanking({
  rows,
  groupByVariant,
  onGroupByVariantChange,
  isLoading,
}: {
  rows: Row[];
  groupByVariant: boolean;
  onGroupByVariantChange: (v: boolean) => void;
  isLoading?: boolean;
}) {
  const [sortBy, setSortBy] = useState<"units" | "revenue">("units");

  const data = useMemo(() => {
    return [...rows]
      .sort((a, b) => b[sortBy] - a[sortBy])
      .slice(0, 10)
      .map((r) => ({
        ...r,
        label: r.variantName ? `${r.productName} · ${r.variantName}` : r.productName,
      }));
  }, [rows, sortBy]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Top products</CardTitle>
          <CardDescription>
            Ranked by {sortBy === "units" ? "units sold" : "revenue"}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Sort</Label>
            <Select
              value={sortBy}
              onValueChange={(v) => v && setSortBy(v as "units" | "revenue")}
            >
              <SelectTrigger size="sm">
                <SelectValue>
                  {sortBy === "units" ? "Units" : "Revenue"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="units">Units</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Group</Label>
            <Select
              value={groupByVariant ? "variant" : "product"}
              onValueChange={(v) => v && onGroupByVariantChange(v === "variant")}
            >
              <SelectTrigger size="sm">
                <SelectValue>
                  {groupByVariant ? "By variant" : "By product"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="product">By product</SelectItem>
                  <SelectItem value="variant">By variant</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No sales in this period.
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="h-[320px] w-full aspect-auto"
          >
            <BarChart
              data={data}
              layout="vertical"
              margin={{ left: 4, right: 24, top: 4, bottom: 4 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                dataKey="label"
                type="category"
                tickLine={false}
                axisLine={false}
                width={160}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value, name) => (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                        </span>
                        <span className="font-mono font-medium">
                          {name === "revenue" ? `RM${Math.round(Number(value))}` : value}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar
                dataKey={sortBy}
                fill={sortBy === "units" ? "var(--color-units)" : "var(--color-revenue)"}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
