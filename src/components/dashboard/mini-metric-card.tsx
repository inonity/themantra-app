"use client";

import { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  title: string;
  description?: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
};

export function MiniMetricCard({ title, description, value, hint, icon }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
