"use client";

import { ReactNode } from "react";
import { TrendingDownIcon, TrendingUpIcon, MinusIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  value: string;
  icon?: ReactNode;
  hint?: string;
  delta?: number | null;
  spark?: number[];
  className?: string;
};

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const w = 64;
  const h = 20;
  const pad = 2;
  const xFor = (i: number) =>
    data.length <= 1 ? w / 2 : pad + ((w - 2 * pad) * i) / (data.length - 1);
  const yFor = (v: number) =>
    max === min
      ? h / 2
      : pad + (h - 2 * pad) * (1 - (v - min) / (max - min));
  const points = data.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  const first = data[0];
  const trending = last >= first;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("w-16 h-5 overflow-visible", className)}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className={trending ? "text-chart-2" : "text-chart-5"}
      />
    </svg>
  );
}

function DeltaBadge({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined || !isFinite(delta)) return null;
  const rounded = Math.round(delta * 10) / 10;
  const Icon =
    rounded > 0 ? TrendingUpIcon : rounded < 0 ? TrendingDownIcon : MinusIcon;
  const variant = rounded === 0 ? "outline" : "secondary";
  const sign = rounded > 0 ? "+" : "";
  return (
    <Badge variant={variant} className="gap-1 font-medium">
      <Icon className="size-3" />
      {sign}
      {rounded}%
    </Badge>
  );
}

export function StatCard({ title, value, icon, hint, delta, spark, className }: Props) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-3xl font-bold truncate">{value}</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <DeltaBadge delta={delta} />
              {hint && (
                <span className="text-xs text-muted-foreground">{hint}</span>
              )}
            </div>
          </div>
          {spark && spark.length > 0 && (
            <Sparkline data={spark} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
