"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { RoleGuard } from "@/components/role-guard";
import { BatchTable } from "@/components/batches/batch-table";
import { BatchFormDialog } from "@/components/batches/batch-form-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params.productId as Id<"products">;

  const product = useQuery(api.products.get, { id: productId });
  const batches = useQuery(api.batches.listByProduct, { productId });

  return (
    <RoleGuard allowed={["admin"]}>
      {product === undefined ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : product === null ? (
        <div className="text-muted-foreground">Product not found.</div>
      ) : (
        <div className="space-y-6">
          <div>
            <Link
              href="/dashboard/products"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Back to Products
            </Link>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                    {product.name}
                  </h1>
                  <Badge variant="outline">{product.shortCode}</Badge>
                  {product.collection && (
                    <Badge variant="outline">{product.collection}</Badge>
                  )}
                  <Badge
                    variant={
                      product.status === "active" ? "default" : "secondary"
                    }
                  >
                    {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1">
                  {product.description}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  RM {product.price.toFixed(2)}
                </p>
              </div>
              <BatchFormDialog productId={productId}>
                <Button className="w-full sm:w-auto">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Batch
                </Button>
              </BatchFormDialog>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Batches</h2>
            {batches === undefined ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : (
              <BatchTable batches={batches} />
            )}
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
