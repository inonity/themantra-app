"use client";

import { Doc } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
                {STOCK_MODEL_LABELS[agentProfile.defaultStockModel] ?? agentProfile.defaultStockModel}
              </Badge>
            </div>
          )}
          {rate && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Assigned Rate</p>
              <Badge variant="outline">{rate.name}</Badge>
            </div>
          )}
        </div>

        {/* Rate-based Pricing (sellers only) */}
        {isSeller && rate && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Pricing — {rate.name}</h3>

              {rate.collectionRates.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Collection</TableHead>
                        <TableHead>HQ Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rate.collectionRates.map((cr, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge variant="outline">{cr.collection}</Badge>
                          </TableCell>
                          <TableCell>
                            {formatRate(cr.rateType, cr.rateValue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {rate.collectionRates.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No collection rates configured on this rate. Full retail price applies.
                </p>
              )}

              {/* Applicable Offers */}
              {applicableOffers.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">
                      Applicable Offers
                    </p>
                    {applicableOffers.map((offer) => {
                      // Find offer pricing for this agent's rate
                      const op = offerPricing.find(
                        (p) => p.offerId === offer._id && agentProfile?.rateId && p.rateId === agentProfile.rateId
                      );
                      return (
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
                            {op && <span>HQ: {formatRate(op.rateType, op.rateValue)}</span>}
                            {!op && <span>HQ: per-product rates</span>}
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
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {isSeller && !rate && (
          <>
            <Separator />
            <p className="text-muted-foreground text-sm">
              No rate assigned. Full retail price applies until a rate is set by admin.
            </p>
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
