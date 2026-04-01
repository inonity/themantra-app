"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { SaveIcon, TrashIcon, PlusIcon, XIcon } from "lucide-react";

const STOCK_MODELS = [
  { value: "hold_paid", label: "Hold & Paid" },
  { value: "consignment", label: "Consignment" },
  { value: "dropship", label: "Dropship" },
] as const;

type StockModel = "hold_paid" | "consignment" | "dropship";
type RateType = "fixed" | "percentage";
type AddMode = "single" | "multiple" | "collection";

interface StockModelPricing {
  rateType: RateType;
  rateValue: string;
  productOverrides: { productId: string; rateType: RateType; rateValue: string }[];
  collectionOverrides: { collection: string; rateType: RateType; rateValue: string }[];
  offerOverrides: { offerId: string; rateType: RateType; rateValue: string }[];
}

function emptyPricing(): StockModelPricing {
  return {
    rateType: "percentage",
    rateValue: "",
    productOverrides: [],
    collectionOverrides: [],
    offerOverrides: [],
  };
}

function pricingFromDoc(doc: Doc<"agentPricing">): StockModelPricing {
  return {
    rateType: doc.rateType,
    rateValue:
      doc.rateType === "percentage"
        ? (doc.rateValue * 100).toString()
        : doc.rateValue.toString(),
    productOverrides: (doc.productOverrides ?? []).map((o) => ({
      productId: o.productId,
      rateType: o.rateType,
      rateValue:
        o.rateType === "percentage"
          ? (o.rateValue * 100).toString()
          : o.rateValue.toString(),
    })),
    collectionOverrides: (doc.collectionOverrides ?? []).map((o) => ({
      collection: o.collection,
      rateType: o.rateType,
      rateValue:
        o.rateType === "percentage"
          ? (o.rateValue * 100).toString()
          : o.rateValue.toString(),
    })),
    offerOverrides: (doc.offerOverrides ?? []).map((o) => ({
      offerId: o.offerId,
      rateType: o.rateType,
      rateValue:
        o.rateType === "percentage"
          ? (o.rateValue * 100).toString()
          : o.rateValue.toString(),
    })),
  };
}

export function AgentPricingDialog({
  agentId,
  agentName,
  children,
}: {
  agentId: Id<"users">;
  agentName: string;
  children: React.ReactElement;
}) {
  const profile = useQuery(api.agentProfiles.getByAgentId, { agentId });
  const agentPricingList = useQuery(api.agentPricing.listByAgent, { agentId });
  const products = useQuery(api.products.list) ?? [];
  const collections = useQuery(api.products.listCollections) ?? [];
  const offers = useQuery(api.offers.list) ?? [];
  const upsertProfile = useMutation(api.agentProfiles.upsert);
  const upsertPricing = useMutation(api.agentPricing.upsert);
  const removePricing = useMutation(api.agentPricing.remove);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Default stock model (stored on agentProfiles)
  const [defaultStockModel, setDefaultStockModel] = useState<StockModel | "">(
    ""
  );
  const [notes, setNotes] = useState("");

  // Per-stock-model pricing configs
  const [pricingConfigs, setPricingConfigs] = useState<
    Record<StockModel, StockModelPricing>
  >({
    hold_paid: emptyPricing(),
    consignment: emptyPricing(),
    dropship: emptyPricing(),
  });

  // Track which stock models are "enabled" (have pricing configured)
  const [enabledModels, setEnabledModels] = useState<Set<StockModel>>(
    new Set()
  );

  // Track existing agentPricing doc IDs for deletion
  const [existingPricingIds, setExistingPricingIds] = useState<
    Partial<Record<StockModel, Id<"agentPricing">>>
  >({});

  const [activeTab, setActiveTab] = useState<StockModel>("hold_paid");

  function loadProfile() {
    setDefaultStockModel(profile?.defaultStockModel ?? "");
    setNotes(profile?.notes ?? "");

    const configs: Record<StockModel, StockModelPricing> = {
      hold_paid: emptyPricing(),
      consignment: emptyPricing(),
      dropship: emptyPricing(),
    };
    const enabled = new Set<StockModel>();
    const ids: Partial<Record<StockModel, Id<"agentPricing">>> = {};

    if (agentPricingList) {
      for (const doc of agentPricingList) {
        configs[doc.stockModel] = pricingFromDoc(doc);
        enabled.add(doc.stockModel);
        ids[doc.stockModel] = doc._id;
      }
    }

    setPricingConfigs(configs);
    setEnabledModels(enabled);
    setExistingPricingIds(ids);

    // Default to first enabled tab or hold_paid
    const firstEnabled = STOCK_MODELS.find((m) => enabled.has(m.value));
    setActiveTab(firstEnabled?.value ?? "hold_paid");
  }

  function toggleModel(model: StockModel) {
    setEnabledModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) {
        next.delete(model);
      } else {
        next.add(model);
      }
      return next;
    });
  }

  function updateConfig(model: StockModel, updates: Partial<StockModelPricing>) {
    setPricingConfigs((prev) => ({
      ...prev,
      [model]: { ...prev[model], ...updates },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Save profile (defaultStockModel + notes)
      await upsertProfile({
        agentId,
        defaultStockModel: defaultStockModel
          ? (defaultStockModel as StockModel)
          : undefined,
        notes: notes || undefined,
      });

      // Save/update enabled stock model configs
      for (const model of STOCK_MODELS) {
        const isEnabled = enabledModels.has(model.value);
        const existingId = existingPricingIds[model.value];

        if (isEnabled) {
          const config = pricingConfigs[model.value];
          const hasOverrides =
            config.productOverrides.length > 0 ||
            config.collectionOverrides.length > 0 ||
            config.offerOverrides.length > 0;
          if (!config.rateValue && !hasOverrides) continue; // skip if nothing configured

          const rateValue = config.rateValue
            ? config.rateType === "percentage"
              ? parseFloat(config.rateValue) / 100
              : parseFloat(config.rateValue)
            : 0;

          await upsertPricing({
            agentId,
            stockModel: model.value,
            rateType: config.rateType,
            rateValue,
            productOverrides: config.productOverrides.map((o) => ({
              productId: o.productId as Id<"products">,
              rateType: o.rateType,
              rateValue:
                o.rateType === "percentage"
                  ? parseFloat(o.rateValue) / 100
                  : parseFloat(o.rateValue),
            })),
            collectionOverrides: config.collectionOverrides.map((o) => ({
              collection: o.collection,
              rateType: o.rateType,
              rateValue:
                o.rateType === "percentage"
                  ? parseFloat(o.rateValue) / 100
                  : parseFloat(o.rateValue),
            })),
            offerOverrides: config.offerOverrides.map((o) => ({
              offerId: o.offerId as Id<"offers">,
              rateType: o.rateType,
              rateValue:
                o.rateType === "percentage"
                  ? parseFloat(o.rateValue) / 100
                  : parseFloat(o.rateValue),
            })),
          });
        } else if (existingId) {
          // Model was disabled — remove the pricing row
          await removePricing({ id: existingId });
        }
      }

      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const productMap = new Map(products.map((p) => [p._id, p]));
  const offerMap = new Map(offers.map((o) => [o._id, o]));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) loadProfile();
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pricing — {agentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Default Stock Model */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Default Stock Model</h3>
            <p className="text-xs text-muted-foreground">
              The preferred stock model for this agent (used as default when
              recording sales).
            </p>
            <Select
              value={defaultStockModel}
              onValueChange={(v) =>
                v && setDefaultStockModel(v as StockModel)
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {STOCK_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Stock Model Pricing Tabs */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Pricing by Stock Model</h3>
            <p className="text-xs text-muted-foreground">
              Configure HQ pricing for each stock model this agent uses.
              Enable a model to add pricing.
            </p>

            {/* Enable/disable toggles */}
            <div className="flex gap-2">
              {STOCK_MODELS.map((m) => (
                <Badge
                  key={m.value}
                  variant={enabledModels.has(m.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleModel(m.value)}
                >
                  {enabledModels.has(m.value) ? "✓ " : ""}
                  {m.label}
                </Badge>
              ))}
            </div>

            {enabledModels.size > 0 && (
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as StockModel)}
              >
                <TabsList>
                  {STOCK_MODELS.filter((m) => enabledModels.has(m.value)).map(
                    (m) => (
                      <TabsTrigger key={m.value} value={m.value}>
                        {m.label}
                      </TabsTrigger>
                    )
                  )}
                </TabsList>

                {STOCK_MODELS.filter((m) => enabledModels.has(m.value)).map(
                  (m) => (
                    <TabsContent key={m.value} value={m.value}>
                      <StockModelPricingPanel
                        stockModel={m.value}
                        config={pricingConfigs[m.value]}
                        onUpdate={(updates) =>
                          updateConfig(m.value, updates)
                        }
                        products={products}
                        collections={collections}
                        offers={offers}
                        productMap={productMap}
                        offerMap={offerMap}
                      />
                    </TabsContent>
                  )
                )}
              </Tabs>
            )}
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              placeholder="Optional notes about this agent's pricing..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              <SaveIcon className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StockModelPricingPanel({
  stockModel,
  config,
  onUpdate,
  products,
  collections,
  offers,
  productMap,
  offerMap,
}: {
  stockModel: StockModel;
  config: StockModelPricing;
  onUpdate: (updates: Partial<StockModelPricing>) => void;
  products: Doc<"products">[];
  collections: string[];
  offers: Doc<"offers">[];
  productMap: Map<Id<"products">, Doc<"products">>;
  offerMap: Map<Id<"offers">, Doc<"offers">>;
}) {
  // Add product override form state
  const [addMode, setAddMode] = useState<AddMode>("single");
  const [newProductId, setNewProductId] = useState("");
  const [newMultiProductIds, setNewMultiProductIds] = useState<string[]>([]);
  const [newCollection, setNewCollection] = useState("");
  const [newProductRateType, setNewProductRateType] =
    useState<RateType>("percentage");
  const [newProductRateValue, setNewProductRateValue] = useState("");

  // Add offer override form state
  const [newOfferId, setNewOfferId] = useState("");
  const [newOfferRateType, setNewOfferRateType] = useState<RateType>("fixed");
  const [newOfferRateValue, setNewOfferRateValue] = useState("");

  const usedProductIds = new Set(config.productOverrides.map((o) => o.productId));
  const usedOfferIds = new Set(config.offerOverrides.map((o) => o.offerId));
  const availableProducts = products.filter(
    (p) => !usedProductIds.has(p._id) && (p.status === "active" || p.status === "future_release")
  );
  const availableMultiProducts = products.filter(
    (p) =>
      !usedProductIds.has(p._id) &&
      !newMultiProductIds.includes(p._id) &&
      (p.status === "active" || p.status === "future_release")
  );
  const availableOffers = offers.filter(
    (o) => !usedOfferIds.has(o._id) && o.isActive
  );

  function addProductOverrides() {
    if (!newProductRateValue) return;

    if (addMode === "collection" && newCollection) {
      // Store as a collection-level override (not expanded to individual products)
      const usedCollections = new Set(config.collectionOverrides.map((o) => o.collection));
      if (!usedCollections.has(newCollection)) {
        onUpdate({
          collectionOverrides: [
            ...config.collectionOverrides,
            {
              collection: newCollection,
              rateType: newProductRateType,
              rateValue: newProductRateValue,
            },
          ],
        });
      }
      setNewCollection("");
      setNewProductRateValue("");
      return;
    }

    let idsToAdd: string[] = [];
    if (addMode === "single" && newProductId) {
      idsToAdd = [newProductId];
    } else if (addMode === "multiple" && newMultiProductIds.length > 0) {
      idsToAdd = newMultiProductIds;
    }

    const newEntries = idsToAdd
      .filter((id) => !usedProductIds.has(id))
      .map((id) => ({
        productId: id,
        rateType: newProductRateType,
        rateValue: newProductRateValue,
      }));

    if (newEntries.length > 0) {
      onUpdate({
        productOverrides: [...config.productOverrides, ...newEntries],
      });
    }

    setNewProductId("");
    setNewMultiProductIds([]);
    setNewProductRateValue("");
  }

  function addOfferOverride() {
    if (!newOfferId || !newOfferRateValue) return;
    onUpdate({
      offerOverrides: [
        ...config.offerOverrides,
        {
          offerId: newOfferId,
          rateType: newOfferRateType,
          rateValue: newOfferRateValue,
        },
      ],
    });
    setNewOfferId("");
    setNewOfferRateValue("");
  }

  return (
    <div className="space-y-5 pt-3">
      {/* Default Rate */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Default Rate</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rate Type</Label>
            <Select
              value={config.rateType}
              onValueChange={(v) =>
                v && onUpdate({ rateType: v as RateType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage" label="Percentage">Percentage</SelectItem>
                <SelectItem value="fixed" label="Fixed (RM)">Fixed (RM)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">
              {config.rateType === "percentage" ? "% of Retail" : "Amount (RM)"}
            </Label>
            <Input
              type="number"
              step={config.rateType === "percentage" ? "1" : "0.01"}
              placeholder={
                config.rateType === "percentage" ? "e.g. 60" : "e.g. 50.00"
              }
              value={config.rateValue}
              onChange={(e) => onUpdate({ rateValue: e.target.value })}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Product & Collection Overrides */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Product & Collection Overrides</h4>

        {config.collectionOverrides.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Collection</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.collectionOverrides.map((o, i) => (
                <TableRow key={o.collection}>
                  <TableCell className="text-sm">
                    <Badge variant="secondary">{o.collection}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {o.rateType === "percentage"
                      ? `${o.rateValue}%`
                      : `RM ${o.rateValue}`}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onUpdate({
                          collectionOverrides: config.collectionOverrides.filter(
                            (_, idx) => idx !== i
                          ),
                        })
                      }
                    >
                      <TrashIcon className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {config.productOverrides.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.productOverrides.map((o, i) => (
                <TableRow key={o.productId}>
                  <TableCell className="text-sm">
                    {productMap.get(o.productId as Id<"products">)?.name ??
                      "Unknown"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {o.rateType === "percentage"
                      ? `${o.rateValue}%`
                      : `RM ${o.rateValue}`}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onUpdate({
                          productOverrides: config.productOverrides.filter(
                            (_, idx) => idx !== i
                          ),
                        })
                      }
                    >
                      <TrashIcon className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {availableProducts.length > 0 && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="grid grid-cols-3 gap-2 items-end">
              <div>
                <Label className="text-xs">Add By</Label>
                <Select
                  value={addMode}
                  onValueChange={(v) => {
                    if (!v) return;
                    setAddMode(v as AddMode);
                    setNewProductId("");
                    setNewMultiProductIds([]);
                    setNewCollection("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single" label="Single Product">Single Product</SelectItem>
                    <SelectItem value="multiple" label="Multiple Products">Multiple Products</SelectItem>
                    <SelectItem value="collection" label="Collection">Collection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Rate Type</Label>
                <Select
                  value={newProductRateType}
                  onValueChange={(v) =>
                    v && setNewProductRateType(v as RateType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage" label="%">%</SelectItem>
                    <SelectItem value="fixed" label="RM">RM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Value</Label>
                <Input
                  type="number"
                  step={newProductRateType === "percentage" ? "1" : "0.01"}
                  placeholder="Value"
                  value={newProductRateValue}
                  onChange={(e) => setNewProductRateValue(e.target.value)}
                />
              </div>
            </div>

            {addMode === "single" && (
              <Select
                value={newProductId}
                onValueChange={(v) => v && setNewProductId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {addMode === "multiple" && (
              <div className="space-y-2">
                {newMultiProductIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {newMultiProductIds.map((id) => (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="gap-1"
                      >
                        {productMap.get(id as Id<"products">)?.name ??
                          "Unknown"}
                        <button
                          type="button"
                          onClick={() =>
                            setNewMultiProductIds(
                              newMultiProductIds.filter((pid) => pid !== id)
                            )
                          }
                          className="ml-1"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {availableMultiProducts.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (v && !newMultiProductIds.includes(v)) {
                        setNewMultiProductIds([...newMultiProductIds, v]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add product..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMultiProducts.map((p) => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {addMode === "collection" && (() => {
              const usedCollections = new Set(config.collectionOverrides.map((o) => o.collection));
              const availableCollections = collections.filter((c) => !usedCollections.has(c));
              return (
              <Select
                value={newCollection}
                onValueChange={(v) => v && setNewCollection(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select collection..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCollections.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              );
            })()}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addProductOverrides}
              disabled={
                !newProductRateValue ||
                (addMode === "single" && !newProductId) ||
                (addMode === "multiple" && newMultiProductIds.length === 0) ||
                (addMode === "collection" && !newCollection)
              }
            >
              <PlusIcon className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Offer Overrides */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Offer Overrides</h4>

        {config.offerOverrides.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Offer</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.offerOverrides.map((o, i) => (
                <TableRow key={o.offerId}>
                  <TableCell className="text-sm">
                    {offerMap.get(o.offerId as Id<"offers">)?.name ?? "Unknown"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {o.rateType === "percentage"
                      ? `${o.rateValue}%`
                      : `RM ${o.rateValue}`}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onUpdate({
                          offerOverrides: config.offerOverrides.filter(
                            (_, idx) => idx !== i
                          ),
                        })
                      }
                    >
                      <TrashIcon className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {availableOffers.length > 0 && (
          <div className="grid grid-cols-4 gap-2 items-end">
            <Select
              value={newOfferId}
              onValueChange={(v) => v && setNewOfferId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Offer..." />
              </SelectTrigger>
              <SelectContent>
                {availableOffers.map((o) => (
                  <SelectItem key={o._id} value={o._id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={newOfferRateType}
              onValueChange={(v) =>
                v && setNewOfferRateType(v as RateType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed" label="RM">RM</SelectItem>
                <SelectItem value="percentage" label="%">%</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              step={newOfferRateType === "percentage" ? "1" : "0.01"}
              placeholder="Value"
              value={newOfferRateValue}
              onChange={(e) => setNewOfferRateValue(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addOfferOverride}
              disabled={!newOfferId || !newOfferRateValue}
            >
              <PlusIcon className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
