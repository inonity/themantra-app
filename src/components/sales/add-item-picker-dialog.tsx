"use client";

import { useEffect, useMemo, useState } from "react";
import { Doc } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDownIcon, InfoIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type InventorySource = {
  kind: "inventory";
  key: "own" | "hqAuto" | "hqPresell";
  label: string;
  description: string;
  inventory: Doc<"inventory">[];
  qtyLabel: (qty: number) => string;
  onPick: (invId: string) => void;
};

type PendingGroup = {
  product: Doc<"products">;
  futureSuffix: string;
  items: { value: string; label: string; variant?: Doc<"productVariants"> }[];
};

type PendingSource = {
  kind: "pending";
  key: "pending";
  label: string;
  description: string;
  groups: PendingGroup[];
  onPick: (value: string) => void;
};

export type PickerSource = InventorySource | PendingSource;

interface AddItemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: PickerSource[];
  productMap: Map<string, Doc<"products">>;
  batchMap: Map<string, Doc<"batches">>;
  variantMap: Map<string, Doc<"productVariants">>;
}

type OptionRow = {
  key: string;
  value: string;
  primary: string; // batch code or variant name
  secondary?: string; // qty label / price
};

type ProductGroup = {
  productId: string;
  productName: string;
  options: OptionRow[];
};

export function AddItemPickerDialog({
  open,
  onOpenChange,
  sources,
  productMap,
  batchMap,
  variantMap,
}: AddItemPickerDialogProps) {
  const visibleSources = useMemo(
    () =>
      sources.filter((s) =>
        s.kind === "inventory" ? s.inventory.length > 0 : s.groups.length > 0
      ),
    [sources]
  );

  const [activeTab, setActiveTab] = useState<string>(
    visibleSources[0]?.key ?? ""
  );
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setSearch("");
      setExpanded(new Set());
      if (
        !visibleSources.some((s) => s.key === activeTab) &&
        visibleSources[0]
      ) {
        setActiveTab(visibleSources[0].key);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setExpanded(new Set());
  }, [activeTab]);

  const activeSource = visibleSources.find((s) => s.key === activeTab) ?? null;

  const productGroups = useMemo<ProductGroup[]>(() => {
    if (!activeSource) return [];
    const q = search.trim().toLowerCase();
    const matches = (...values: (string | undefined)[]) =>
      !q || values.some((v) => v?.toLowerCase().includes(q));

    if (activeSource.kind === "inventory") {
      const grouped = new Map<string, ProductGroup>();
      for (const inv of activeSource.inventory) {
        const product = productMap.get(inv.productId);
        const productName = product?.name ?? "Unknown";
        const variant = inv.variantId ? variantMap.get(inv.variantId) : undefined;
        const batch = batchMap.get(inv.batchId);
        const batchCode = batch?.batchCode ?? "?";
        if (!matches(productName, variant?.name, batchCode)) continue;

        const primary = variant?.name
          ? `${variant.name} · ${batchCode}`
          : batchCode;
        const entry = grouped.get(inv.productId) ?? {
          productId: inv.productId,
          productName,
          options: [],
        };
        entry.options.push({
          key: inv._id,
          value: inv._id,
          primary,
          secondary: activeSource.qtyLabel(inv.quantity),
        });
        grouped.set(inv.productId, entry);
      }
      const result = [...grouped.values()];
      result.forEach((g) => g.options.sort((a, b) => a.primary.localeCompare(b.primary)));
      result.sort((a, b) => a.productName.localeCompare(b.productName));
      return result;
    }

    const out: ProductGroup[] = [];
    for (const group of activeSource.groups) {
      const headerName = `${group.product.name}${group.futureSuffix}`;
      const filtered = group.items.filter((item) =>
        matches(group.product.name, item.variant?.name, item.label)
      );
      if (filtered.length === 0) continue;
      out.push({
        productId: group.product._id,
        productName: headerName,
        options: filtered.map((item) => ({
          key: item.value,
          value: item.value,
          primary: item.variant?.name ?? "Add to order",
          secondary: item.label,
        })),
      });
    }
    out.sort((a, b) => a.productName.localeCompare(b.productName));
    return out;
  }, [activeSource, search, productMap, batchMap, variantMap]);

  const isSearching = search.trim().length > 0;
  const effectiveExpanded = useMemo(() => {
    if (isSearching) return new Set(productGroups.map((g) => g.productId));
    return expanded;
  }, [isSearching, productGroups, expanded]);

  function toggleExpand(productId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function handlePick(value: string) {
    if (!activeSource) return;
    if (activeSource.kind === "inventory") activeSource.onPick(value);
    else activeSource.onPick(value);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 pr-12 border-b">
          <DialogTitle>Add item to order</DialogTitle>
        </DialogHeader>

        {visibleSources.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No items available to add.
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="px-4 pt-3 pb-2 overflow-x-auto">
              <TabsList className="h-9 w-fit">
                {visibleSources.map((s) => (
                  <TabsTrigger
                    key={s.key}
                    value={s.key}
                    className="text-xs whitespace-nowrap gap-1.5"
                  >
                    {s.label}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            role="button"
                            tabIndex={-1}
                            aria-label={`What is ${s.label}?`}
                            className="inline-flex items-center text-muted-foreground/70 hover:text-foreground transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <InfoIcon className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{s.description}</TooltipContent>
                    </Tooltip>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {visibleSources.map((s) => (
              <TabsContent key={s.key} value={s.key} className="mt-0">
                <div className="px-4 pb-3">
                  <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search product, variant, or batch..."
                      className="pl-8 h-9"
                      autoFocus
                    />
                  </div>
                </div>

                <ProductList
                  groups={productGroups}
                  expanded={effectiveExpanded}
                  onToggleExpand={toggleExpand}
                  onPick={handlePick}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductList({
  groups,
  expanded,
  onToggleExpand,
  onPick,
}: {
  groups: ProductGroup[];
  expanded: Set<string>;
  onToggleExpand: (productId: string) => void;
  onPick: (value: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground border-t">
        No matching items.
      </div>
    );
  }

  return (
    <div className="border-t max-h-[60vh] overflow-y-auto">
      {groups.map((group) => {
        const single = group.options.length === 1;
        const isOpen = expanded.has(group.productId);
        const opt = single ? group.options[0] : null;

        return (
          <div key={group.productId} className="border-b last:border-b-0">
            <button
              type="button"
              onClick={() =>
                single ? onPick(opt!.value) : onToggleExpand(group.productId)
              }
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-medium truncate">{group.productName}</span>
                {single ? (
                  <span className="text-muted-foreground truncate">
                    · {opt!.primary}
                  </span>
                ) : (
                  <span className="text-muted-foreground shrink-0">
                    · {group.options.length} options
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {single ? (
                  opt!.secondary && (
                    <span className="text-xs text-muted-foreground">
                      {opt!.secondary}
                    </span>
                  )
                ) : (
                  <ChevronDownIcon
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      !isOpen && "-rotate-90"
                    )}
                  />
                )}
              </div>
            </button>
            {!single && isOpen && (
              <div className="bg-muted/20 border-t">
                {group.options.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => onPick(o.value)}
                    className="w-full flex items-center justify-between gap-3 pl-8 pr-4 py-2 text-left text-sm hover:bg-muted/60 transition-colors border-b last:border-b-0 border-border/40"
                  >
                    <span className="truncate">{o.primary}</span>
                    {o.secondary && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {o.secondary}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
