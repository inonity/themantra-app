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
  agentId: string;
  name: string;
  role: string | null;
  sales: number;
  units: number;
  revenue: number;
  commission: number;
};

type SortBy = "sales" | "units" | "revenue" | "commission";

const SORT_LABELS: Record<SortBy, string> = {
  sales: "Sales",
  units: "Units",
  revenue: "Revenue",
  commission: "Commission",
};

const chartConfig = {
  sales: { label: "Sales", color: "var(--chart-1)" },
  units: { label: "Units", color: "var(--chart-2)" },
  revenue: { label: "Revenue", color: "var(--chart-3)" },
  commission: { label: "Commission", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function AgentRanking({
  rows,
  isLoading,
}: {
  rows: Row[];
  isLoading?: boolean;
}) {
  const [sortBy, setSortBy] = useState<SortBy>("sales");

  const data = useMemo(
    () => [...rows].sort((a, b) => b[sortBy] - a[sortBy]),
    [rows, sortBy]
  );

  const isRevenue = sortBy === "revenue" || sortBy === "commission";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Agent & sales ranking</CardTitle>
          <CardDescription>
            Ranked by {SORT_LABELS[sortBy].toLowerCase()} in selected period
          </CardDescription>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Sort</Label>
          <Select value={sortBy} onValueChange={(v) => v && setSortBy(v as SortBy)}>
            <SelectTrigger size="sm">
              <SelectValue>{SORT_LABELS[sortBy]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(Object.keys(SORT_LABELS) as SortBy[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No agent sales in this period.
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
                dataKey="name"
                type="category"
                tickLine={false}
                axisLine={false}
                width={140}
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
                          {isRevenue ? `RM${Math.round(Number(value))}` : value}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar
                dataKey={sortBy}
                fill={`var(--color-${sortBy})`}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
