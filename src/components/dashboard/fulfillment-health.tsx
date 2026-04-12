"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  avgDaysToFulfill: number | null;
  pctOnTime: number | null;
  pendingCount: number;
  buckets: { "0-7": number; "7-14": number; "14+": number };
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function FulfillmentHealth({
  avgDaysToFulfill,
  pctOnTime,
  pendingCount,
  buckets,
}: Props) {
  const total = buckets["0-7"] + buckets["7-14"] + buckets["14+"];
  const bar = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fulfillment health</CardTitle>
        <CardDescription>How fast sales turn into deliveries</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Avg days to fulfill"
            value={avgDaysToFulfill === null ? "—" : `${avgDaysToFulfill.toFixed(1)}d`}
          />
          <Stat
            label="On-time (≤7d)"
            value={pctOnTime === null ? "—" : `${pctOnTime.toFixed(0)}%`}
          />
          <Stat
            label="Pending"
            value={String(pendingCount)}
            hint={pendingCount === 0 ? "All caught up" : "awaiting delivery"}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Aging of pending sales</span>
            <span className="text-muted-foreground">{total} total</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <AgeRow label="0–7 days" count={buckets["0-7"]} pct={bar(buckets["0-7"])} tone="ok" />
            <AgeRow label="7–14 days" count={buckets["7-14"]} pct={bar(buckets["7-14"])} tone="warn" />
            <AgeRow label="14+ days" count={buckets["14+"]} pct={bar(buckets["14+"])} tone="danger" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgeRow({
  label,
  count,
  pct,
  tone,
}: {
  label: string;
  count: number;
  pct: number;
  tone: "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "bg-chart-2"
      : tone === "warn"
        ? "bg-chart-4"
        : "bg-chart-5";
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${toneClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <Badge variant="outline" className="min-w-8 justify-center">
        {count}
      </Badge>
    </div>
  );
}
