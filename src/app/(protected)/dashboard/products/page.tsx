"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { RoleGuard } from "@/components/role-guard";
import { ProductTable } from "@/components/products/product-table";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";

export default function ProductsPage() {
  const products = useQuery(api.products.list);

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
            <p className="text-muted-foreground">
              Manage your perfume product catalog.
            </p>
          </div>
          <ProductFormDialog>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </ProductFormDialog>
        </div>
        {products === undefined ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <ProductTable products={products} />
        )}
      </div>
    </RoleGuard>
  );
}
