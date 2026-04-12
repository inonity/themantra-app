"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  BUSINESS_START_MS,
  DateRange,
  DateRangePreset,
  MY_OFFSET_MS,
  PRESET_LABELS,
  customRange,
  formatRangeLabel,
  localDateToMyKey,
  myDateKeyToLocalDate,
  rangeForPreset,
} from "@/lib/date-range";
import { cn } from "@/lib/utils";

type Props = {
  preset: DateRangePreset;
  range: DateRange;
  onChange: (preset: DateRangePreset, range: DateRange) => void;
  className?: string;
};

const PRESETS: DateRangePreset[] = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "last90",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "allTime",
];

export function DateRangePicker({ preset, range, onChange, className }: Props) {
  const [open, setOpen] = useState(false);

  // react-day-picker range selection state, derived from incoming range
  const selected =
    preset === "allTime"
      ? undefined
      : {
          from: new Date(range.from + 8 * 3600 * 1000),
          to: new Date(range.to + 8 * 3600 * 1000),
        };

  const label =
    preset === "custom"
      ? formatRangeLabel(range)
      : PRESET_LABELS[preset];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className={cn("justify-start gap-2", className)} />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        <span className="font-medium">{label}</span>
        {preset !== "custom" && preset !== "allTime" && (
          <span className="text-muted-foreground font-normal">
            · {formatRangeLabel(range)}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col gap-0 sm:flex-row">
          <div className="flex flex-col gap-0.5 p-2 sm:min-w-40 sm:border-r">
            {PRESETS.map((p) => (
              <Button
                key={p}
                variant={preset === p ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => {
                  onChange(p, rangeForPreset(p));
                  setOpen(false);
                }}
              >
                {PRESET_LABELS[p]}
              </Button>
            ))}
            <Separator className="my-1" />
            <Button
              variant={preset === "custom" ? "secondary" : "ghost"}
              size="sm"
              className="justify-start"
              onClick={() => onChange("custom", range)}
            >
              {PRESET_LABELS.custom}
            </Button>
          </div>
          <div className="p-2">
            <Calendar
              mode="range"
              numberOfMonths={2}
              disabled={{ before: new Date(BUSINESS_START_MS + MY_OFFSET_MS) }}
              selected={selected}
              onSelect={(sel) => {
                if (!sel?.from) return;
                const fromKey = localDateToMyKey(sel.from);
                const toKey = sel.to
                  ? localDateToMyKey(sel.to)
                  : fromKey;
                const r = customRange(fromKey, toKey);
                onChange("custom", r);
                if (sel.to) setOpen(false);
              }}
              defaultMonth={
                selected?.from ?? myDateKeyToLocalDate(new Date().toISOString().slice(0, 10))
              }
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
