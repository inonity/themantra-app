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
  const [draft, setDraft] = useState<{ from: Date; to?: Date } | undefined>(
    undefined,
  );

  // react-day-picker range selection state — prefer in-progress draft over committed range
  const selected: { from: Date; to?: Date } | undefined =
    draft ??
    (preset === "allTime"
      ? undefined
      : {
          from: new Date(range.from + MY_OFFSET_MS),
          to: new Date(range.to + MY_OFFSET_MS),
        });

  const label =
    preset === "custom"
      ? formatRangeLabel(range)
      : PRESET_LABELS[preset];

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setDraft(undefined);
      }}
    >
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
                  setDraft(undefined);
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
              onClick={() => {
                setDraft(undefined);
                onChange("custom", range);
              }}
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
              onSelect={() => {
                // managed via onDayClick so clicks after a complete range start a new selection
              }}
              onDayClick={(day, modifiers) => {
                if (modifiers.disabled) return;
                if (!draft || !draft.from || draft.to) {
                  setDraft({ from: day, to: undefined });
                  return;
                }
                let from = draft.from;
                let to = day;
                if (to < from) [from, to] = [to, from];
                setDraft(undefined);
                onChange(
                  "custom",
                  customRange(localDateToMyKey(from), localDateToMyKey(to)),
                );
                setOpen(false);
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
