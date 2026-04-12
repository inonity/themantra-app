"use client";

import { useMemo } from "react";
import { Pie, PieChart } from "recharts";
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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type Row = { channel: string; count: number; revenue: number };

const CHANNEL_LABEL: Record<string, string> = {
  direct: "Direct",
  agent: "Agent",
  tiktok: "TikTok",
  shopee: "Shopee",
  other: "Other",
};

const CHANNEL_COLOR: Record<string, string> = {
  direct: "var(--chart-1)",
  agent: "var(--chart-2)",
  tiktok: "var(--chart-3)",
  shopee: "var(--chart-4)",
  other: "var(--chart-5)",
};

export function ChannelBreakdown({ rows }: { rows: Row[] }) {
  const config = useMemo(() => {
    const c: ChartConfig = {};
    for (const r of rows) {
      c[r.channel] = {
        label: CHANNEL_LABEL[r.channel] ?? r.channel,
        color: CHANNEL_COLOR[r.channel] ?? "var(--chart-5)",
      };
    }
    return c;
  }, [rows]);

  const data = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        fill: CHANNEL_COLOR[r.channel] ?? "var(--chart-5)",
      })),
    [rows]
  );

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales channels</CardTitle>
        <CardDescription>Where sales came from</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No sales in this period.
          </p>
        ) : (
          <ChartContainer config={config} className="mx-auto aspect-square h-[260px]">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="channel"
                    formatter={(value, name) => (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {CHANNEL_LABEL[name as string] ?? name}
                        </span>
                        <span className="font-mono font-medium">
                          {value} sales
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="count"
                nameKey="channel"
                innerRadius={60}
                strokeWidth={2}
              />
              <ChartLegend content={<ChartLegendContent nameKey="channel" />} />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
