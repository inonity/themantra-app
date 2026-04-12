"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatKeyForAxis, Granularity } from "@/lib/date-range";

type Bucket = {
  key: string;
  sales: number;
  units: number;
  revenue: number;
  hqRevenue: number;
  commission: number;
};

type Props = {
  granularity: Granularity;
  buckets: Bucket[];
  isLoading?: boolean;
  title?: string;
  description?: string;
};

const chartConfig = {
  sales: { label: "Sales", color: "var(--chart-1)" },
  units: { label: "Units", color: "var(--chart-2)" },
  revenue: { label: "Revenue", color: "var(--chart-3)" },
  hqRevenue: { label: "HQ Revenue", color: "var(--chart-3)" },
  commission: { label: "Agent Commission", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function SalesTimeseriesChart({
  granularity,
  buckets,
  isLoading,
  title = "Performance",
  description,
}: Props) {
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        ...b,
        label: formatKeyForAxis(b.key, granularity),
      })),
    [buckets, granularity]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="units">Units</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
          </TabsList>
          <TabsContent value="sales">
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </TabsContent>
          <TabsContent value="units">
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Bar dataKey="units" fill="var(--color-units)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </TabsContent>
          <TabsContent value="revenue">
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
                <defs>
                  <linearGradient id="hq-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-hqRevenue)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-hqRevenue)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="commission-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-commission)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-commission)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `RM${v}`} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      formatter={(value, name) => (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                          </span>
                          <span className="font-mono font-medium">
                            RM{Math.round(Number(value))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="hqRevenue"
                  stackId="rev"
                  stroke="var(--color-hqRevenue)"
                  fill="url(#hq-grad)"
                />
                <Area
                  type="monotone"
                  dataKey="commission"
                  stackId="rev"
                  stroke="var(--color-commission)"
                  fill="url(#commission-grad)"
                />
              </AreaChart>
            </ChartContainer>
          </TabsContent>
        </Tabs>
        {isLoading && (
          <p className="text-sm text-muted-foreground mt-2">Loading...</p>
        )}
      </CardContent>
    </Card>
  );
}
