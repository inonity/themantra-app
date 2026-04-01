"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { OffersTable } from "@/components/offers/offers-table";
import { OfferFormDialog } from "@/components/offers/offer-form-dialog";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";

export default function OffersPage() {
  const offers = useQuery(api.offers.list);

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Offers</h1>
            <p className="text-muted-foreground">
              Manage bundle pricing and promotional offers.
            </p>
          </div>
          <OfferFormDialog>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Offer
            </Button>
          </OfferFormDialog>
        </div>
        {offers === undefined ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <OffersTable offers={offers} />
        )}
      </div>
    </RoleGuard>
  );
}
