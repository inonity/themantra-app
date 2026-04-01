"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DashboardItem = {
  saleId: Id<"sales">;
  lineItemIndex: number;
  productId: Id<"products">;
  productName: string;
  quantity: number;
  fulfilledQuantity: number;
  fulfillmentSource: string;
  sellerId: Id<"users"> | undefined;
  sellerName: string;
  customerName: string;
  saleDate: number;
  stockModel: string;
  availableBatches: {
    batchId: Id<"batches">;
    batchCode: string;
    quantity: number;
  }[];
  category: "ready" | "awaiting_stock" | "future_release";
};

type SaleEntry = {
  saleId: Id<"sales">;
  lineItemIndex: number;
  customerName: string;
  quantity: number;
  fulfilledQuantity: number;
  fulfillmentSource: string;
  saleDate: number;
};

type ProductGroup = {
  productId: Id<"products">;
  productName: string;
  totalNeeded: number;
  sales: SaleEntry[];
};

type AgentGroup = {
  sellerId: Id<"users">;
  sellerName: string;
  products: ProductGroup[];
};

function buildAgentGroups(items: DashboardItem[]): AgentGroup[] {
  const agentMap = new Map<string, AgentGroup>();

  for (const item of items) {
    if (!item.sellerId) continue;
    const agentKey = item.sellerId;

    if (!agentMap.has(agentKey)) {
      agentMap.set(agentKey, {
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        products: [],
      });
    }
    const agent = agentMap.get(agentKey)!;

    let productGroup = agent.products.find(
      (p) => p.productId === item.productId
    );
    if (!productGroup) {
      productGroup = {
        productId: item.productId,
        productName: item.productName,
        totalNeeded: 0,
        sales: [],
      };
      agent.products.push(productGroup);
    }

    const remaining = item.quantity - item.fulfilledQuantity;
    productGroup.totalNeeded += remaining;
    productGroup.sales.push({
      saleId: item.saleId,
      lineItemIndex: item.lineItemIndex,
      customerName: item.customerName,
      quantity: item.quantity,
      fulfilledQuantity: item.fulfilledQuantity,
      fulfillmentSource: item.fulfillmentSource,
      saleDate: item.saleDate,
    });
  }

  const groups = [...agentMap.values()].sort((a, b) =>
    a.sellerName.localeCompare(b.sellerName)
  );
  for (const agent of groups) {
    agent.products.sort((a, b) => a.productName.localeCompare(b.productName));
    for (const product of agent.products) {
      product.sales.sort((a, b) => b.saleDate - a.saleDate);
    }
  }
  return groups;
}

const SOURCE_STYLES: Record<string, string> = {
  hq_transfer: "text-orange-600 border-orange-300",
  pending_batch: "text-yellow-600 border-yellow-300",
  future_release: "text-purple-600 border-purple-300",
};

const SOURCE_LABELS: Record<string, string> = {
  agent_stock: "Agent Stock",
  hq_transfer: "HQ Transfer",
  pending_batch: "No Batch",
  future_release: "Future Release",
};

function SummaryCards({ items }: { items: DashboardItem[] }) {
  const ready = items.filter((i) => i.category === "ready").length;
  const awaiting = items.filter((i) => i.category === "awaiting_stock").length;
  const future = items.filter((i) => i.category === "future_release").length;
  const total = items.length;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Pending
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold">{total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-green-600">
            HQ Stock Available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold text-green-600">{ready}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-yellow-600">
            Awaiting Stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold text-yellow-600">{awaiting}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-purple-600">
            Future Release
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold text-purple-600">{future}</div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentProductSection({ agent }: { agent: AgentGroup }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{agent.sellerName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {agent.products.map((product) => (
          <div key={product.productId} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{product.productName}</span>
              <Badge variant="outline" className="text-xs">
                {product.totalNeeded} needed
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Qty Needed</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Sale Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.sales.map((sale) => (
                  <TableRow key={`${sale.saleId}-${sale.lineItemIndex}`}>
                    <TableCell>{sale.customerName}</TableCell>
                    <TableCell>
                      {sale.quantity - sale.fulfilledQuantity}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          SOURCE_STYLES[sale.fulfillmentSource] ?? ""
                        }
                      >
                        {SOURCE_LABELS[sale.fulfillmentSource] ??
                          sale.fulfillmentSource}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(sale.saleDate).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function HqFulfillmentDashboard() {
  const dashboardItems = useQuery(api.sales.getPendingFulfillmentDashboard);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");

  if (dashboardItems === undefined) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const agents = [...new Set(dashboardItems.map((i) => i.sellerName))].sort();
  const productNames = [
    ...new Set(dashboardItems.map((i) => i.productName)),
  ].sort();

  const filtered = dashboardItems.filter((item) => {
    if (filterAgent !== "all" && item.sellerName !== filterAgent) return false;
    if (filterProduct !== "all" && item.productName !== filterProduct)
      return false;
    return true;
  });

  const allGroups = buildAgentGroups(filtered);

  return (
    <div className="space-y-6">
      <SummaryCards items={filtered} />

      {/* Filters */}
      <div className="flex gap-3">
        <Select
          value={filterAgent}
          onValueChange={(v) => {
            if (v) setFilterAgent(v);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" label="All Agents">All Agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterProduct}
          onValueChange={(v) => {
            if (v) setFilterProduct(v);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" label="All Products">All Products</SelectItem>
            {productNames.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {allGroups.length > 0 ? (
        <div className="space-y-3">
          {allGroups.map((agent) => (
            <AgentProductSection key={agent.sellerId} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No pending fulfillment items.
        </div>
      )}
    </div>
  );
}
