/**
 * MCP tool catalogue.
 *
 * The whole catalogue is sent to the model on every request, so it is kept
 * small and wide: a dozen tools that each answer a whole question, rather than
 * one thin tool per backend query. Descriptions are one or two sentences.
 */

import { McpRole } from "./auth";

export type ToolKind = "read" | "write";

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  /** Roles allowed to call it. Omitted = every role. */
  roles?: McpRole[];
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

const PERIODS = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "90d",
  "mtd",
  "ytd",
  "all",
] as const;

const periodProp = {
  type: "string",
  enum: PERIODS,
  description: "Time window. Defaults to 30d.",
};

export const TOOLS: ToolDef[] = [
  {
    name: "whoami",
    title: "Who am I",
    description:
      "Identity and scope of this connection: which user the token acts as, their role, what data they are allowed to see, and today's date in Malaysia time (UTC+8). Call this first if scope or the current date matters.",
    kind: "read",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "overview",
    title: "Business overview",
    description:
      "One-call snapshot: revenue, units and order count with change vs the previous period, sale-channel split, money outstanding, stock running low, and batches maturing soon. Start here for open-ended questions before reaching for a narrower tool.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: { period: periodProp },
    },
  },
  {
    name: "products",
    title: "Product catalogue",
    description:
      "Products with their variants, retail prices and total units in stock. Use `search` to match a product name or 2-letter short code.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Name or short code fragment." },
        collection: { type: "string" },
        status: {
          type: "string",
          enum: ["active", "discontinued", "future_release", "all"],
          description: "Defaults to active.",
        },
        includeStock: {
          type: "boolean",
          description: "Include stock-on-hand columns. Defaults to true.",
        },
      },
    },
  },
  {
    name: "inventory",
    title: "Stock on hand",
    description:
      "Units in stock, by product and variant. `holder` narrows to HQ ('business') or to agents; `agent` narrows to one person by name. `groupBy: batch` breaks the figures down by batch code instead.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Product name or short code." },
        holder: {
          type: "string",
          enum: ["business", "agents", "all"],
          description: "Defaults to all.",
        },
        agent: { type: "string", description: "Agent name or nickname." },
        lowStockOnly: {
          type: "boolean",
          description: "Only rows with 10 units or fewer.",
        },
        groupBy: {
          type: "string",
          enum: ["variant", "batch"],
          description: "Defaults to variant.",
        },
      },
    },
  },
  {
    name: "sales",
    title: "List sales",
    description:
      "Sales newest first, with a totals footer. Filter by period (or explicit from/to as YYYY-MM-DD), channel, agent, payment status, and b2c/b2b. Cancelled sales are excluded unless includeCancelled is set.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        period: periodProp,
        from: { type: "string", description: "YYYY-MM-DD, overrides period." },
        to: { type: "string", description: "YYYY-MM-DD, overrides period." },
        channel: {
          type: "string",
          enum: ["direct", "agent", "tiktok", "shopee", "other", "internal"],
        },
        agent: { type: "string", description: "Seller name or nickname." },
        paymentStatus: {
          type: "string",
          enum: ["paid", "unpaid", "partial"],
        },
        type: {
          type: "string",
          enum: ["b2c", "b2b"],
          description: "b2c = seller to customer, b2b = HQ to agent.",
        },
        includeCancelled: { type: "boolean" },
        limit: { type: "number", description: "Rows to return, default 25, max 200." },
      },
    },
  },
  {
    name: "sale_detail",
    title: "Sale detail",
    description:
      "Everything about one sale: line items with batches, payment and commission, fulfilment state, and customer. Take the id from a `sales` result.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: { saleId: { type: "string" } },
      required: ["saleId"],
    },
  },
  {
    name: "batches",
    title: "Manufacturing batches",
    description:
      "Batches with total, released and remaining units, status, and manufacture/maturation dates. Use maturingWithinDays to see what becomes available soon.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Batch code or product name." },
        status: {
          type: "string",
          enum: [
            "upcoming",
            "partial",
            "available",
            "depleted",
            "cancelled",
            "all",
          ],
        },
        maturingWithinDays: { type: "number" },
        limit: { type: "number", description: "Default 40." },
      },
    },
  },
  {
    name: "payments",
    title: "Outstanding money",
    description:
      "What is owed and by whom: sales that are unpaid or part-paid, plus agent settlements in both directions (agent owes HQ collected cash, HQ owes agent commission).",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Narrow to one agent." },
        kind: {
          type: "string",
          enum: ["unpaid", "settlements", "all"],
          description: "Defaults to all.",
        },
      },
    },
  },
  {
    name: "rankings",
    title: "Top performers",
    description:
      "Leaderboard for a period by revenue and units — by product, by agent, or by sale channel.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        by: { type: "string", enum: ["product", "agent", "channel"] },
        period: periodProp,
        limit: { type: "number", description: "Default 10." },
      },
      required: ["by"],
    },
  },
  {
    name: "stock_requests",
    title: "Stock requests",
    description:
      "Requests from agents asking HQ for stock, with product, quantity and status.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "fulfilled", "cancelled", "all"],
          description: "Defaults to pending.",
        },
      },
    },
  },
  {
    name: "create_stock_request",
    title: "Request stock from HQ",
    description:
      "Ask HQ to send you stock. Name the product by name or short code; if more than one matches you get the candidates back and nothing is created. Moves no stock by itself — HQ still has to fulfil it.",
    kind: "write",
    roles: ["agent", "sales"],
    inputSchema: {
      type: "object",
      properties: {
        product: { type: "string", description: "Product name or short code." },
        variant: {
          type: "string",
          description: "Variant name, e.g. '30ML'. Required when the product has several.",
        },
        quantity: { type: "number" },
        notes: { type: "string" },
      },
      required: ["product", "quantity"],
    },
  },
  {
    name: "record_interest",
    title: "Record customer interest",
    description:
      "Log that a customer wants something. This is not a sale: no stock moves and no money is recorded. Convert it to a sale in the app.",
    kind: "write",
    roles: ["agent", "sales"],
    inputSchema: {
      type: "object",
      properties: {
        customerName: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        items: {
          type: "array",
          description: "Products the customer is interested in.",
          items: {
            type: "object",
            properties: {
              product: { type: "string", description: "Name or short code." },
              variant: { type: "string" },
              quantity: { type: "number" },
            },
            required: ["product", "quantity"],
          },
        },
        notes: { type: "string" },
      },
      required: ["customerName", "items"],
    },
  },
];

export function toolsForRole(role: McpRole): ToolDef[] {
  return TOOLS.filter((tool) => !tool.roles || tool.roles.includes(role));
}

export function findTool(name: string, role: McpRole): ToolDef | null {
  return toolsForRole(role).find((tool) => tool.name === name) ?? null;
}

/** MCP wire shape for `tools/list`. */
export function toWireTool(tool: ToolDef) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      title: tool.title,
      readOnlyHint: tool.kind === "read",
      destructiveHint: false,
      idempotentHint: tool.kind === "read",
      openWorldHint: false,
    },
  };
}
