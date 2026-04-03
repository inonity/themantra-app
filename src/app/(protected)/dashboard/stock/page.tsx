"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import { InventoryBreakdown } from "@/components/stock/inventory-breakdown";
import { TransferFormDialog } from "@/components/stock/transfer-form-dialog";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { ArrowRightLeftIcon, CheckIcon } from "lucide-react";

type EnrichedRequest = {
  _id: Id<"stockRequests">;
  agentId: Id<"users">;
  productId: Id<"products">;
  quantity: number;
  notes?: string;
  status: "pending" | "fulfilled" | "cancelled";
  createdAt: number;
  updatedAt?: number;
  agentName: string;
  productName: string;
  productStatus: string;
};

function RequestsTable({
  requests,
  showActions,
}: {
  requests: EnrichedRequest[];
  showActions?: boolean;
}) {
  const markFulfilled = useMutation(api.stockRequests.markFulfilled);

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No requests found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Notes</TableHead>
          {!showActions && <TableHead>Status</TableHead>}
          <TableHead>Requested</TableHead>
          {showActions && <TableHead className="text-right">Action</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((req) => (
          <TableRow key={req._id}>
            <TableCell className="font-medium">{req.agentName}</TableCell>
            <TableCell>
              {req.productName}
              {req.productStatus === "future_release" && (
                <Badge
                  variant="outline"
                  className="ml-2 text-xs text-purple-600 border-purple-300"
                >
                  Future Release
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <span className="font-semibold">{req.quantity}</span>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm max-w-[250px] truncate">
              {req.notes || "—"}
            </TableCell>
            {!showActions && (
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    req.status === "fulfilled"
                      ? "text-green-600 border-green-300"
                      : req.status === "cancelled"
                        ? "text-muted-foreground"
                        : "text-orange-600 border-orange-300"
                  }
                >
                  {req.status}
                </Badge>
              </TableCell>
            )}
            <TableCell>
              {new Date(req.createdAt).toLocaleDateString()}
            </TableCell>
            {showActions && (
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markFulfilled({ requestId: req._id })}
                  title="Mark as fulfilled after transferring stock"
                >
                  <CheckIcon className="h-4 w-4 mr-1" />
                  Done
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function StockPage() {
  const inventory = useQuery(api.inventory.getBreakdown);
  const products = useQuery(api.products.list);
  const batches = useQuery(api.batches.listAll);
  const agents = useQuery(api.users.listSellers);
  const pending = useQuery(api.stockRequests.listPending) ?? [];
  const allRequests = useQuery(api.stockRequests.listAll) ?? [];

  const isLoading =
    inventory === undefined ||
    products === undefined ||
    batches === undefined ||
    agents === undefined;

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Stock Management
            </h1>
            <p className="text-muted-foreground">
              Manage inventory, transfer stock, and review agent requests.
            </p>
          </div>
          {products && (
            <TransferFormDialog products={products}>
              <Button>
                <ArrowRightLeftIcon className="h-4 w-4 mr-2" />
                Distribute Stock
              </Button>
            </TransferFormDialog>
          )}
        </div>

        {/* Inventory Section */}
        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <InventoryBreakdown
            inventory={inventory}
            products={products}
            batches={batches}
            agents={agents}
          />
        )}

        {/* Stock Requests Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Stock Requests
          </h2>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">
                Pending
                {pending.length > 0 && (
                  <Badge variant="default" className="ml-2 bg-orange-500">
                    {pending.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              <RequestsTable
                requests={pending as EnrichedRequest[]}
                showActions
              />
            </TabsContent>

            <TabsContent value="all" className="mt-4">
              <RequestsTable requests={allRequests as EnrichedRequest[]} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </RoleGuard>
  );
}
