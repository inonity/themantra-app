"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { RoleGuard } from "@/components/role-guard";
import { BatchTable } from "@/components/batches/batch-table";
import { BatchFormDialog } from "@/components/batches/batch-form-dialog";
import { ProductVariantFormDialog } from "@/components/products/product-variant-form-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeftIcon, PlusIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const FOR_WHO_LABELS: Record<string, string> = {
  customers: "Customers",
  agents: "Agents Only",
  both: "Both",
};

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params.productId as Id<"products">;

  const product = useQuery(api.products.get, { id: productId });
  const batches = useQuery(api.batches.listByProduct, { productId });
  const variants = useQuery(api.productVariants.listByProduct, { productId });
  const migrateVariants = useMutation(api.productVariants.migrateProductsToVariants);
  const migrateForWho = useMutation(api.productVariants.migrateToForWho);

  async function handleRunMigration() {
    try {
      const result = await migrateVariants({});
      toast.success(`Migration complete — ${result.created} created, ${result.skipped} skipped`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Migration failed");
    }
  }

  async function handleMigrateForWho() {
    try {
      const result = await migrateForWho({});
      toast.success(`Migration complete — ${result.migrated} migrated, ${result.skipped} already up to date`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Migration failed");
    }
  }

  return (
    <RoleGuard allowed={["admin"]}>
      {product === undefined ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : product === null ? (
        <div className="text-muted-foreground">Product not found.</div>
      ) : (
        <div className="space-y-8">
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
                {product.description && (
                  <p className="text-muted-foreground mt-1">
                    {product.description}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Variants */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Variants & Pricing</h2>
              <div className="flex gap-2">
                {variants !== undefined && variants.length === 0 && (
                  <Button variant="outline" size="sm" onClick={handleRunMigration}>
                    Migrate from Legacy Price
                  </Button>
                )}
                {variants !== undefined && variants.length > 0 && variants.some((v) => !v.forWho) && (
                  <Button variant="outline" size="sm" onClick={handleMigrateForWho}>
                    Migrate to &quot;For Who&quot;
                  </Button>
                )}
                <ProductVariantFormDialog productId={productId}>
                  <Button size="sm">
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Add Variant
                  </Button>
                </ProductVariantFormDialog>
              </div>
            </div>

            {variants === undefined ? (
              <div className="text-muted-foreground text-sm">Loading variants...</div>
            ) : variants.length === 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Name</TableHead>
                      <TableHead>For</TableHead>
                      <TableHead>Size (ML)</TableHead>
                      <TableHead>Price (RM)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">
                        No variants yet. Add a variant or run migration to create the default 30ML variant.
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Name</TableHead>
                      <TableHead>For</TableHead>
                      <TableHead>Size (ML)</TableHead>
                      <TableHead>Price (RM)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variants
                      .slice()
                      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                      .map((variant) => (
                        <TableRow key={variant._id}>
                          <TableCell className="font-medium">{variant.name}</TableCell>
                          <TableCell>
                            <Badge variant={(variant.forWho ?? "customers") === "agents" ? "secondary" : "outline"}>
                              {FOR_WHO_LABELS[variant.forWho ?? "customers"] ?? variant.forWho}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {variant.sizeMl != null ? `${variant.sizeMl} ML` : "—"}
                          </TableCell>
                          <TableCell>{variant.price.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={variant.status === "active" ? "default" : "secondary"}>
                              {variant.status === "active" ? "Active" : "Discontinued"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <ProductVariantFormDialog productId={productId} variant={variant}>
                              <Button variant="ghost" size="sm">
                                <PencilIcon className="h-4 w-4" />
                              </Button>
                            </ProductVariantFormDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Batches */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Batches</h2>
              <BatchFormDialog productId={productId}>
                <Button>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Batch
                </Button>
              </BatchFormDialog>
            </div>
            {batches === undefined ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : (
              <BatchTable batches={batches} variants={variants ?? []} />
            )}
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
