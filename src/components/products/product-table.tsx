"use client";

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
import { ProductFormDialog } from "./product-form-dialog";
import { PencilIcon } from "lucide-react";
import Link from "next/link";

export function ProductTable({ products }: { products: Doc<"products">[] }) {
  if (products.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No products yet. Create your first product to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>Collection</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Price (RM)</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[80px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product._id}>
            <TableCell className="font-medium">
              <Link
                href={`/dashboard/products/${product._id}`}
                className="hover:underline"
              >
                {product.name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{product.shortCode}</Badge>
            </TableCell>
            <TableCell>
              {product.collection ? (
                <Badge variant="outline">{product.collection}</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="max-w-[300px] truncate">
              {product.description}
            </TableCell>
            <TableCell>{product.price.toFixed(2)}</TableCell>
            <TableCell>
              <Badge
                variant={
                  product.status === "active" ? "default" : "secondary"
                }
              >
                {product.status === "future_release" ? "Future Release" : product.status.charAt(0).toUpperCase() + product.status.slice(1)}
              </Badge>
            </TableCell>
            <TableCell>
              <ProductFormDialog product={product}>
                <Button variant="ghost" size="sm">
                  <PencilIcon className="h-4 w-4" />
                </Button>
              </ProductFormDialog>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
