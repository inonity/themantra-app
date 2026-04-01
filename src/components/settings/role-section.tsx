"use client";

import { Doc } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StockModel = "hold_paid" | "consignment" | "dropship";

const STOCK_MODEL_LABELS: Record<StockModel, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  dropship: "Dropship",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  agent: "Agent",
  sales: "Salesperson",
};

type SettingsData = {
  user: Doc<"users">;
  agentProfile: Doc<"agentProfiles"> | null;
  agentPricing: Doc<"agentPricing">[] | null;
  pricingDefaults: Doc<"pricingDefaults">[];
  applicableOffers: Doc<"offers">[];
  offerPricing: Doc<"offerPricing">[];
};

function formatRate(rateType: string, rateValue: number) {
  if (rateType === "percentage") {
    return `${Math.round(rateValue * 100)}% of retail`;
  }
  return `RM ${rateValue.toFixed(2)} fixed`;
}

export function RoleSection({ data }: { data: SettingsData }) {
  const { user, agentProfile, agentPricing, pricingDefaults, applicableOffers, offerPricing } = data;
  const role = user.role;

  if (!role) return null;

  const isSeller = role === "agent" || role === "sales";

  // Determine which stock models this user has pricing for
  const stockModelsWithPricing = new Set<StockModel>();

  if (agentPricing) {
    for (const ap of agentPricing) {
      stockModelsWithPricing.add(ap.stockModel);
    }
  }

  // Also check defaults
  for (const pd of pricingDefaults) {
    stockModelsWithPricing.add(pd.stockModel);
  }

  // If agent profile has a default, ensure it's included
  if (agentProfile?.defaultStockModel) {
    stockModelsWithPricing.add(agentProfile.defaultStockModel);
  }

  const stockModels = (["hold_paid", "consignment", "dropship"] as StockModel[]).filter(
    (sm) => stockModelsWithPricing.has(sm)
  );

  function getPricingForModel(model: StockModel) {
    // Agent-specific pricing takes priority
    const agentSpecific = agentPricing?.find((ap) => ap.stockModel === model);
    if (agentSpecific) {
      return {
        source: "Agent-specific",
        rateType: agentSpecific.rateType,
        rateValue: agentSpecific.rateValue,
        productOverrides: agentSpecific.productOverrides ?? [],
        collectionOverrides: agentSpecific.collectionOverrides ?? [],
        offerOverrides: agentSpecific.offerOverrides ?? [],
      };
    }

    // Fall back to global default (no productId/collection = global)
    const globalDefault = pricingDefaults.find(
      (pd) =>
        pd.stockModel === model &&
        pd.productId === undefined &&
        pd.productIds === undefined &&
        pd.collection === undefined
    );
    if (globalDefault) {
      return {
        source: "Default",
        rateType: globalDefault.rateType,
        rateValue: globalDefault.rateValue,
        productOverrides: [],
        collectionOverrides: [],
        offerOverrides: [],
      };
    }

    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role</CardTitle>
        <CardDescription>Your role and pricing details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Role Info */}
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Role</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{ROLE_LABELS[role] ?? role}</Badge>
            </div>
          </div>
          {agentProfile?.defaultStockModel && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Default Stock Model</p>
              <Badge variant="outline">
                {STOCK_MODEL_LABELS[agentProfile.defaultStockModel]}
              </Badge>
            </div>
          )}
        </div>

        {/* Pricing Tabs (sellers only) */}
        {isSeller && stockModels.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Pricing</h3>
              <Tabs defaultValue={stockModels[0]}>
                <TabsList>
                  {stockModels.map((sm) => (
                    <TabsTrigger key={sm} value={sm}>
                      {STOCK_MODEL_LABELS[sm]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {stockModels.map((sm) => {
                  const pricing = getPricingForModel(sm);

                  // Resolve offer pricing for this stock model
                  const agentSpecific = agentPricing?.find((ap) => ap.stockModel === sm);
                  const offersForModel = applicableOffers
                    .map((offer) => {
                      // Agent-specific offer override takes priority
                      const agentOverride = agentSpecific?.offerOverrides?.find(
                        (oo) => oo.offerId === offer._id
                      );
                      if (agentOverride) {
                        return { offer, rateType: agentOverride.rateType, rateValue: agentOverride.rateValue };
                      }
                      // Fall back to default offerPricing for this stock model
                      const defaultOp = offerPricing.find(
                        (op) => op.offerId === offer._id && op.stockModel === sm
                      );
                      if (defaultOp) {
                        return { offer, rateType: defaultOp.rateType, rateValue: defaultOp.rateValue };
                      }
                      return null;
                    })
                    .filter((o) => o !== null);

                  return (
                    <TabsContent key={sm} value={sm} className="space-y-3">
                      {pricing ? (
                        <div className="space-y-3">
                          <div className="rounded-md border p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium">
                                  Base Rate
                                </p>
                                <p className="text-muted-foreground text-sm">
                                  {formatRate(pricing.rateType, pricing.rateValue)}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {pricing.source}
                              </Badge>
                            </div>
                          </div>

                          {pricing.productOverrides.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs">
                                Product Overrides
                              </p>
                              <div className="rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Product</TableHead>
                                      <TableHead>Rate</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {pricing.productOverrides.map((po, i) => (
                                      <TableRow key={i}>
                                        <TableCell className="text-xs">
                                          {po.productId}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {formatRate(po.rateType, po.rateValue)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}

                          {pricing.collectionOverrides.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs">
                                Collection Overrides
                              </p>
                              <div className="rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Collection</TableHead>
                                      <TableHead>Rate</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {pricing.collectionOverrides.map((co, i) => (
                                      <TableRow key={i}>
                                        <TableCell className="text-xs">
                                          {co.collection}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {formatRate(co.rateType, co.rateValue)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}

                          {offersForModel.length > 0 && (
                            <>
                              <Separator />
                              <div className="space-y-2">
                                <p className="text-muted-foreground text-xs">
                                  Applicable Offers
                                </p>
                                {offersForModel.map(({ offer, rateType, rateValue }) => (
                                  <div key={offer._id} className="rounded-md border p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="text-sm font-medium">{offer.name}</p>
                                        {offer.description && (
                                          <p className="text-muted-foreground text-xs">
                                            {offer.description}
                                          </p>
                                        )}
                                      </div>
                                      <Badge variant="secondary" className="text-xs">
                                        Min {offer.minQuantity} pcs
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                      <span>Bundle: RM {offer.bundlePrice.toFixed(2)}</span>
                                      <span>{formatRate(rateType, rateValue)}</span>
                                      {offer.startDate && (
                                        <span>
                                          From: {new Date(offer.startDate).toLocaleDateString()}
                                        </span>
                                      )}
                                      {offer.endDate && (
                                        <span>
                                          Until: {new Date(offer.endDate).toLocaleDateString()}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm py-2">
                          No pricing configured for this stock model.
                        </p>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          </>
        )}

        {role === "admin" && (
          <p className="text-muted-foreground text-sm">
            As an administrator, you have full access to all features.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
