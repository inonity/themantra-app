"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { CirclePlusIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FacetedFilterOption {
  label: string;
  value: string;
}

interface FacetedFilterProps {
  title: string;
  options: FacetedFilterOption[];
  selected: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
}

interface RangeFilterProps {
  title: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}

export function RangeFilter({
  title,
  min,
  max,
  onMinChange,
  onMaxChange,
}: RangeFilterProps) {
  const [open, setOpen] = useState(false);
  const hasValue = min !== "" || max !== "";

  function clear() {
    onMinChange("");
    onMaxChange("");
  }

  const label =
    min && max
      ? `${min}–${max}`
      : min
        ? `${min}+`
        : max
          ? `0–${max}`
          : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed" />
        }
      >
        <CirclePlusIcon className="size-4" />
        {title}
        {hasValue && label && (
          <>
            <Separator orientation="vertical" className="mx-2 h-4" />
            <Badge
              variant="secondary"
              className="rounded-sm px-1 font-normal"
            >
              {label}
            </Badge>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-3" align="start">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              placeholder="Min"
              value={min}
              onChange={(e) => onMinChange(e.target.value)}
              className="h-8"
            />
            <span className="text-muted-foreground text-sm">–</span>
            <Input
              type="number"
              min="0"
              placeholder="Max"
              value={max}
              onChange={(e) => onMaxChange(e.target.value)}
              className="h-8"
            />
          </div>
          {hasValue && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              className="w-full h-7 text-xs"
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FacetedFilter({
  title,
  options,
  selected,
  onSelectionChange,
}: FacetedFilterProps) {
  const [open, setOpen] = useState(false);

  function toggleOption(value: string) {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onSelectionChange(next);
  }

  function clearAll() {
    onSelectionChange(new Set());
  }

  const selectedLabels = options.filter((o) => selected.has(o.value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed" />
        }
      >
        <CirclePlusIcon className="size-4" />
        {title}
        {selected.size > 0 && (
          <>
            <Separator orientation="vertical" className="mx-2 h-4" />
            <Badge
              variant="secondary"
              className="rounded-sm px-1 font-normal lg:hidden"
            >
              {selected.size}
            </Badge>
            <div className="hidden gap-1 lg:flex">
              {selected.size > 2 ? (
                <Badge
                  variant="secondary"
                  className="rounded-sm px-1 font-normal"
                >
                  {selected.size} selected
                </Badge>
              ) : (
                selectedLabels.map((opt) => (
                  <Badge
                    key={opt.value}
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {opt.label}
                  </Badge>
                ))
              )}
            </div>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => toggleOption(option.value)}
                    data-checked={isSelected || undefined}
                  >
                    <div
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <CheckIcon className="size-3.5" />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={clearAll}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
