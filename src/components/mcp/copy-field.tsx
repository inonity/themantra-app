"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

/** A read-only value with a copy button — used for the URL and the token. */
export function CopyField({
  value,
  label,
  mono = true,
}: {
  value: string;
  label: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the text and copy manually.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code
        className={`flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted px-3 py-2 text-sm ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        {copied ? (
          <CheckIcon className="size-4 text-green-600" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </Button>
    </div>
  );
}

/** A copyable block of configuration or shell text. */
export function CopyBlock({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the text and copy manually.");
    }
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border bg-muted px-3 py-3 pr-12 text-xs leading-relaxed">
        <code>{value}</code>
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1.5 top-1.5"
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        {copied ? (
          <CheckIcon className="size-4 text-green-600" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </Button>
    </div>
  );
}
