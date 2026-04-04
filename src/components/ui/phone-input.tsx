"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const COUNTRIES = [
  { code: "MY", dial: "+60", flag: "🇲🇾", label: "Malaysia" },
  { code: "SG", dial: "+65", flag: "🇸🇬", label: "Singapore" },
  { code: "ID", dial: "+62", flag: "🇮🇩", label: "Indonesia" },
  { code: "TH", dial: "+66", flag: "🇹🇭", label: "Thailand" },
  { code: "PH", dial: "+63", flag: "🇵🇭", label: "Philippines" },
  { code: "VN", dial: "+84", flag: "🇻🇳", label: "Vietnam" },
  { code: "CN", dial: "+86", flag: "🇨🇳", label: "China" },
  { code: "AU", dial: "+61", flag: "🇦🇺", label: "Australia" },
  { code: "GB", dial: "+44", flag: "🇬🇧", label: "United Kingdom" },
  { code: "US", dial: "+1", flag: "🇺🇸", label: "US / Canada" },
];

// Sort longest dial code first so prefix matching is unambiguous
const SORTED = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

function parse(value: string): { dial: string; number: string } {
  for (const c of SORTED) {
    if (value.startsWith(c.dial)) {
      return { dial: c.dial, number: value.slice(c.dial.length) };
    }
  }
  return { dial: "+60", number: value };
}

interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export function PhoneInput({
  id,
  value,
  onChange,
  placeholder = "123456789",
  required,
  className,
}: PhoneInputProps) {
  const { dial, number } = parse(value);

  return (
    <div
      className={cn(
        "flex h-8 w-full overflow-hidden rounded-lg border border-input bg-transparent text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        className
      )}
    >
      <select
        aria-label="Country code"
        value={dial}
        onChange={(e) => onChange(e.target.value + number)}
        className="cursor-pointer border-r border-input bg-transparent py-1 pl-2 pr-1 text-sm outline-none dark:bg-transparent"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.dial}>
            {c.flag} {c.dial}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        value={number}
        onChange={(e) => onChange(dial + e.target.value)}
        placeholder={placeholder}
        required={required}
        className="flex-1 bg-transparent px-2.5 py-1 outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  );
}
