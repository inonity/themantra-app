"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OfferFormDialog } from "./offer-form-dialog";
import { OfferPricingDialog } from "./offer-pricing-dialog";
import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";

function OfferRowActions({ offer }: { offer: Doc<"offers"> }) {
  const toggleActive = useMutation(api.offers.toggleActive);
  const [editOpen, setEditOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setPricingOpen(true)}>
            Set HQ Pricing
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            Edit Offer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={offer.isActive ? "destructive" : "default"}
            onClick={() => toggleActive({ id: offer._id })}
          >
            {offer.isActive ? "Disable Offer" : "Enable Offer"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OfferPricingDialog
        offerId={offer._id}
        offerName={offer.name}
        open={pricingOpen}
        onOpenChange={setPricingOpen}
      />

      <OfferFormDialog
        offer={offer}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

export function OffersTable({ offers }: { offers: Doc<"offers">[] }) {
  const products = useQuery(api.products.list) ?? [];
  const agents = useQuery(api.users.listSellers) ?? [];
  const productMap = new Map(products.map((p) => [p._id, p]));
  const agentMap = new Map(agents.map((a) => [a._id, a]));

  if (offers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No offers yet. Create your first offer to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Bundle</TableHead>
          <TableHead>Products</TableHead>
          <TableHead>Agents</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {offers.map((offer) => (
          <TableRow key={offer._id}>
            <TableCell className="font-medium">
              <div>{offer.name}</div>
              {offer.description && (
                <div className="text-xs text-muted-foreground">
                  {offer.description}
                </div>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                {offer.minQuantity} for RM{offer.bundlePrice.toFixed(2)}
              </Badge>
            </TableCell>
            <TableCell>
              {offer.productId ? (
                <Badge variant="secondary" className="text-xs">
                  {productMap.get(offer.productId)?.name ?? "Unknown"}
                </Badge>
              ) : offer.productIds && offer.productIds.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {offer.productIds.map((pid) => (
                    <Badge key={pid} variant="secondary" className="text-xs">
                      {productMap.get(pid)?.name ?? "Unknown"}
                    </Badge>
                  ))}
                </div>
              ) : offer.collection ? (
                <Badge variant="outline" className="text-xs">
                  {offer.collection}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-sm">All products</span>
              )}
            </TableCell>
            <TableCell>
              {offer.agentIds && offer.agentIds.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {offer.agentIds.map((aid) => (
                    <Badge key={aid} variant="secondary" className="text-xs">
                      {agentMap.get(aid)?.name ?? "Unknown"}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">All agents</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={offer.isActive ? "default" : "secondary"}>
                {offer.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              <OfferRowActions offer={offer} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
