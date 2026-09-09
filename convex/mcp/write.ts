/**
 * Write MCP tools. Deliberately limited to actions that move neither stock nor
 * money: a stock request is a message to HQ, and an interest is a note about a
 * customer. Everything with an inventory or financial side effect stays in the
 * app, where a person confirms it.
 */

import { v } from "convex/values";
import { MutationCtx, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { heading, num, sections } from "./format";
import {
  Catalog,
  Scope,
  getScope,
  loadCatalog,
  resolveProduct,
  resolveVariant,
} from "./shared";

type Input = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function quantity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : null;
}

type ResolvedItem = {
  productId: Id<"products">;
  variantId: Id<"productVariants">;
  productName: string;
  variantName: string;
  quantity: number;
};

/** Resolve one {product, variant, quantity} triple, or return why it failed. */
function resolveItem(
  catalog: Catalog,
  raw: Input
): { ok: true; item: ResolvedItem } | { ok: false; message: string } {
  const productTerm = str(raw.product);
  if (!productTerm) return { ok: false, message: "Each item needs a product." };

  const product = resolveProduct(catalog, productTerm);
  if (!product.ok) return { ok: false, message: product.message };

  const variant = resolveVariant(catalog, product.value, str(raw.variant));
  if (!variant.ok) return { ok: false, message: variant.message };

  const qty = quantity(raw.quantity);
  if (qty === null) {
    return {
      ok: false,
      message: `Quantity for ${product.value.name} must be a positive whole number.`,
    };
  }

  return {
    ok: true,
    item: {
      productId: product.value._id,
      variantId: variant.value._id,
      productName: product.value.name,
      variantName: variant.value.name,
      quantity: qty,
    },
  };
}

async function createStockRequest(
  ctx: MutationCtx,
  scope: Scope,
  input: Input,
  now: number
): Promise<string> {
  const catalog = await loadCatalog(ctx);
  const resolved = resolveItem(catalog, input);
  if (!resolved.ok) return resolved.message;

  const { item } = resolved;
  await ctx.db.insert("stockRequests", {
    agentId: scope.user._id,
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
    notes: str(input.notes),
    status: "pending",
    createdAt: now,
  });

  return `Stock request created: ${num(item.quantity)} × ${item.productName} (${item.variantName}). Status pending — HQ still has to fulfil it, no stock has moved.`;
}

async function recordInterest(
  ctx: MutationCtx,
  scope: Scope,
  input: Input,
  now: number
): Promise<string> {
  const customerName = str(input.customerName);
  if (!customerName) return "A customer name is required.";

  const rawItems = Array.isArray(input.items) ? (input.items as Input[]) : [];
  if (rawItems.length === 0) return "At least one item is required.";

  const catalog = await loadCatalog(ctx);
  const items: ResolvedItem[] = [];
  for (const raw of rawItems) {
    const resolved = resolveItem(catalog, raw ?? {});
    // Nothing is written unless every line resolves, so a partial interest is
    // never recorded.
    if (!resolved.ok) return `Nothing was recorded. ${resolved.message}`;
    items.push(resolved.item);
  }

  await ctx.db.insert("interests", {
    agentId: scope.user._id,
    customerDetail: {
      name: customerName,
      phone: str(input.phone),
      email: str(input.email),
    },
    items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    notes: str(input.notes),
    status: "active",
    createdAt: now,
  });

  const lines = items.map(
    (item) => `- ${num(item.quantity)} × ${item.productName} (${item.variantName})`
  );

  return sections(
    heading(`Interest recorded for ${customerName}`),
    lines.join("\n"),
    "No stock has moved and no payment was recorded. Convert it to a sale in the app when the customer confirms."
  );
}

export const runWriteTool = internalMutation({
  args: {
    tool: v.string(),
    input: v.any(),
    userId: v.id("users"),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<string> => {
    const scope = await getScope(ctx, args.userId);
    if (scope.role !== "agent" && scope.role !== "sales") {
      return "Only agent and sales accounts can use this tool.";
    }
    const input = (args.input ?? {}) as Input;

    switch (args.tool) {
      case "create_stock_request":
        return await createStockRequest(ctx, scope, input, args.now);
      case "record_interest":
        return await recordInterest(ctx, scope, input, args.now);
      default:
        throw new Error(`Unknown write tool: ${args.tool}`);
    }
  },
});
