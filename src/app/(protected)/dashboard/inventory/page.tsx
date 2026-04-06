"use client";

import { Fragment, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id, Doc } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

const stockModelLabels: Record<string, string> = {
  hold_paid: "Hold & Paid",
  consignment: "Consignment",
};

const batchStatusLabels: Record<string, string> = {
  upcoming: "Upcoming",
  available: "Available",
  depleted: "Depleted",
};

const batchStatusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  upcoming: "secondary",
  available: "default",
  depleted: "destructive",
};

export default function AgentInventoryPage() {
  const inventory = useQuery(api.inventory.getForAgent);
  const products = useQuery(api.products.list);
  const batches = useQuery(api.batches.listAll);
  const allVariants = useQuery(api.productVariants.listAll);

  const [expandedProducts, setExpandedProducts] = useState<Set<Id<"products">>>(
    new Set()
  );

  const isLoading =
    inventory === undefined ||
    products === undefined ||
    batches === undefined;

  const batchMap = new Map((batches ?? []).map((b) => [b._id, b]));
  const variantMap = new Map((allVariants ?? []).map((v) => [v._id, v]));

  // Group inventory by product
  const productGroups = new Map<
    Id<"products">,
    { product: Doc<"products">; totalStock: number; entries: Doc<"inventory">[] }
  >();

  for (const product of products ?? []) {
    productGroups.set(product._id, {
      product,
      totalStock: 0,
      entries: [],
    });
  }

  for (const inv of inventory ?? []) {
    const group = productGroups.get(inv.productId);
    if (!group) {
      // Product not in list — skip
      continue;
    }
    group.totalStock += inv.quantity;
    group.entries.push(inv);
  }

  // Only show products with inventory, sorted by stock desc then name
  const sortedGroups = Array.from(productGroups.values())
    .filter((g) => g.entries.length > 0)
    .sort((a, b) => {
      if (a.totalStock !== b.totalStock) return b.totalStock - a.totalStock;
      return a.product.name.localeCompare(b.product.name);
    });

  function toggleProduct(productId: Id<"products">) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  return (
    <RoleGuard allowed={["agent", "sales"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            My Inventory
          </h1>
          <p className="text-muted-foreground">
            View your current stock per product and batch.
          </p>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : sortedGroups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            You don&apos;t have any stock yet. Stock will appear here once
            transferred to you.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Total Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedGroups.map(({ product, totalStock, entries }) => {
                const isExpanded = expandedProducts.has(product._id);

                return (
                  <Fragment key={product._id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleProduct(product._id)}
                    >
                      <TableCell className="w-[40px]">
                        {isExpanded ? (
                          <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {product.name}
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{totalStock}</span>
                      </TableCell>
                    </TableRow>
                    {isExpanded &&
                      entries.map((inv) => {
                        const batch = batchMap.get(inv.batchId);
                        const statusKey = batch?.status ?? "unknown";
                        const stockModelKey = inv.stockModel;

                        return (
                          <TableRow
                            key={inv._id}
                            className="bg-muted/30"
                          >
                            <TableCell></TableCell>
                            <TableCell className="pl-8 text-sm">
                              <span className="text-muted-foreground">Batch:</span>{" "}
                              <span className="font-medium">
                                {batch?.batchCode ?? "Unknown"}
                              </span>
                              {inv.variantId && (
                                <span className="ml-2 text-muted-foreground">
                                  {variantMap.get(inv.variantId)?.name}
                                </span>
                              )}
                              {stockModelKey && (
                                <Badge variant="outline" className="ml-3">
                                  {stockModelLabels[stockModelKey] ?? stockModelKey}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              <span>{inv.quantity}</span>
                              <Badge
                                variant={batchStatusVariant[statusKey] ?? "secondary"}
                                className="ml-3"
                              >
                                {batchStatusLabels[statusKey] ?? statusKey}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </RoleGuard>
  );
}
