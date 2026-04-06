"use client";

import { Doc } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldIcon, TagIcon, PackageIcon, CalendarIcon } from "lucide-react";

const STOCK_MODEL_LABELS: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
  presell: "Pre-sell",
  dropship: "Pre-sell", // legacy
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  agent: "Agent",
  sales: "Salesperson",
};


type SettingsData = {
  user: Doc<"users">;
  agentProfile: Doc<"agentProfiles"> | null;
  rate: Doc<"rates"> | null;
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
  const { user, agentProfile, rate, applicableOffers, offerPricing } = data;
  const role = user.role;

  if (!role) return null;

  const isSeller = role === "agent" || role === "sales";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role & Pricing</CardTitle>
        <CardDescription>Your assigned role and pricing details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Role info row */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 flex-1 min-w-[140px] overflow-hidden">
            <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="text-xs font-medium">{ROLE_LABELS[role] ?? role}</p>
            </div>
          </div>

          {agentProfile?.defaultStockModel && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 flex-1 min-w-[140px] overflow-hidden">
              <PackageIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-muted-foreground">Default Stock Model</p>
                <p className="text-xs font-medium">
                  {STOCK_MODEL_LABELS[agentProfile.defaultStockModel] ?? agentProfile.defaultStockModel}
                </p>
              </div>
            </div>
          )}

          {rate && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 flex-1 min-w-[140px] overflow-hidden">
              <TagIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-muted-foreground">Assigned Rate</p>
                <p className="text-xs font-medium break-words">{rate.name}</p>
              </div>
            </div>
          )}
        </div>

        {/* Pricing */}
        {isSeller && rate && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Pricing — {rate.name}</h3>

              {rate.collectionRates.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Collection</TableHead>
                        <TableHead>HQ Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rate.collectionRates.map((cr, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge variant="outline">
                              {cr.collection}{cr.sizeMl != null ? ` ${cr.sizeMl}ML` : ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatRate(cr.rateType, cr.rateValue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No collection rates configured. Full retail price applies.
                </p>
              )}

              {/* Applicable Offers */}
              {applicableOffers.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Applicable Offers</h4>
                    <div className="space-y-2">
                      {applicableOffers.map((offer) => {
                        const op = offerPricing.find(
                          (p) =>
                            p.offerId === offer._id &&
                            agentProfile?.rateId &&
                            p.rateId === agentProfile.rateId
                        );
                        const agentCost = op
                          ? op.rateType === "percentage"
                            ? offer.bundlePrice * op.rateValue
                            : op.rateValue
                          : null;
                        const agentProfit =
                          agentCost !== null ? offer.bundlePrice - agentCost : null;
                        return (
                          <div key={offer._id} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">{offer.name}</p>
                                {offer.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {offer.description}
                                  </p>
                                )}
                              </div>
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                Min {offer.minQuantity} pcs
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <div className="rounded-md bg-background border px-3 py-1.5">
                                <p className="text-xs text-muted-foreground">You Sell At</p>
                                <p className="text-sm font-medium">RM {offer.bundlePrice.toFixed(2)}</p>
                              </div>
                              <div className="rounded-md bg-background border px-3 py-1.5">
                                <p className="text-xs text-muted-foreground">Your Cost</p>
                                <p className="text-sm font-medium">
                                  {agentCost !== null ? `RM ${agentCost.toFixed(2)}` : "Per-product rates"}
                                </p>
                              </div>
                              {agentProfit !== null && (
                                <div className="rounded-md bg-background border px-3 py-1.5">
                                  <p className="text-xs text-muted-foreground">You Keep</p>
                                  <p className="text-sm font-medium text-green-600">
                                    RM {agentProfit.toFixed(2)}
                                  </p>
                                </div>
                              )}
                              {(offer.startDate || offer.endDate) && (
                                <div className="rounded-md bg-background border px-3 py-1.5 flex items-center gap-1.5">
                                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                  <p className="text-xs text-muted-foreground">
                                    {offer.startDate && `From ${new Date(offer.startDate).toLocaleDateString()}`}
                                    {offer.startDate && offer.endDate && " · "}
                                    {offer.endDate && `Until ${new Date(offer.endDate).toLocaleDateString()}`}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {isSeller && !rate && (
          <>
            <Separator />
            <p className="text-sm text-muted-foreground">
              No rate assigned. Full retail price applies until a rate is set by admin.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
