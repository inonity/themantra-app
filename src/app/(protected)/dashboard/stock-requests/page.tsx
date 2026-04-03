"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { RoleGuard } from "@/components/role-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
import { CheckIcon } from "lucide-react";

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

export default function StockRequestsPage() {
  const pending = useQuery(api.stockRequests.listPending) ?? [];
  const fulfilled = useQuery(api.stockRequests.listFulfilled) ?? [];
  const all = useQuery(api.stockRequests.listAll) ?? [];

  return (
    <RoleGuard allowed={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Stock Requests
          </h1>
          <p className="text-muted-foreground">
            Review stock requests from agents. Transfer stock via{" "}
            <a href="/dashboard/stock" className="underline">
              Stock Management
            </a>
            , then mark the request as done.
          </p>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">
              Pending
              {pending.length > 0 && (
                <Badge variant="default" className="ml-2 bg-orange-500">
                  {pending.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="fulfilled">Fulfilled</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <RequestsTable
              requests={pending as EnrichedRequest[]}
              showActions
            />
          </TabsContent>

          <TabsContent value="fulfilled" className="mt-4">
            <RequestsTable requests={fulfilled as EnrichedRequest[]} />
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <RequestsTable requests={all as EnrichedRequest[]} />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
