"use client";

import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { ProductFormDialog } from "./product-form-dialog";
import { FacetedFilter } from "@/components/stock/faceted-filter";
import {
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PencilIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";

type SortColumn = "name" | "shortCode" | "collection" | "status";
type SortDir = "asc" | "desc";

function SortableHead({
  label,
  column,
  sortColumn,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSort: (col: SortColumn) => void;
}) {
  const isActive = sortColumn === column;
  return (
    <TableHead>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => onSort(column)}
      >
        {label}
        {isActive ? (
          sortDir === "asc" ? (
            <ArrowUpIcon className="ml-2 h-4 w-4" />
          ) : (
            <ArrowDownIcon className="ml-2 h-4 w-4" />
          )
        ) : (
          <ArrowUpDownIcon className="ml-2 h-4 w-4 opacity-40" />
        )}
      </Button>
    </TableHead>
  );
}

function statusLabel(status: string) {
  if (status === "future_release") return "Future Release";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ProductTable({ products }: { products: Doc<"products">[] }) {
  const [search, setSearch] = useState("");
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  }

  const collectionOptions = useMemo(() => {
    const cols = new Set(
      products.map((p) => p.collection).filter(Boolean) as string[]
    );
    return Array.from(cols)
      .sort()
      .map((c) => ({ label: c, value: c }));
  }, [products]);

  const statusOptions = [
    { label: "Active", value: "active" },
    { label: "Archived", value: "archived" },
    { label: "Future Release", value: "future_release" },
  ];

  const hasActiveFilters =
    search !== "" || selectedCollections.size > 0 || selectedStatuses.size > 0;

  function clearFilters() {
    setSearch("");
    setSelectedCollections(new Set());
    setSelectedStatuses(new Set());
  }

  const filtered = useMemo(() => {
    let result = products;

    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.shortCode?.toLowerCase().includes(term)
      );
    }

    if (selectedCollections.size > 0) {
      result = result.filter(
        (p) => p.collection && selectedCollections.has(p.collection)
      );
    }

    if (selectedStatuses.size > 0) {
      result = result.filter((p) => selectedStatuses.has(p.status));
    }

    return [...result].sort((a, b) => {
      let aVal: string;
      let bVal: string;

      switch (sortColumn) {
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "shortCode":
          aVal = a.shortCode ?? "";
          bVal = b.shortCode ?? "";
          break;
        case "collection":
          aVal = a.collection ?? "";
          bVal = b.collection ?? "";
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
      }

      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [products, search, selectedCollections, selectedStatuses, sortColumn, sortDir]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Filter products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[150px] lg:w-[250px]"
        />
        <FacetedFilter
          title="Collection"
          options={collectionOptions}
          selected={selectedCollections}
          onSelectionChange={setSelectedCollections}
        />
        <FacetedFilter
          title="Status"
          options={statusOptions}
          selected={selectedStatuses}
          onSelectionChange={setSelectedStatuses}
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8"
          >
            Reset
            <XIcon className="ml-2 size-4" />
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <SortableHead
                label="Name"
                column="name"
                sortColumn={sortColumn}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Code"
                column="shortCode"
                sortColumn={sortColumn}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Collection"
                column="collection"
                sortColumn={sortColumn}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <TableHead>Description</TableHead>
              <SortableHead
                label="Status"
                column="status"
                sortColumn={sortColumn}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  {hasActiveFilters
                    ? "No products match the current filters."
                    : "No products yet. Create your first product to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((product) => (
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
                  <TableCell>
                    <Badge
                      variant={
                        product.status === "active" ? "default" : "secondary"
                      }
                    >
                      {statusLabel(product.status)}
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
