import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

type StockModel = "hold_paid" | "consignment" | "dropship";

export interface ResolvedPrice {
  hqUnitPrice: number;
  retailPrice: number;
}

export interface ResolvedOfferPrice {
  hqBundlePrice: number;
}

/**
 * Resolves the HQ price for an entire offer bundle.
 *
 * Cascade order:
 * 1. agentPricing.offerOverrides for (agentId, stockModel, offerId)
 * 2. offerPricing for (offerId, stockModel)
 * 3. Return null → caller falls through to per-product pricing
 *
 * For percentage rates, the base is the offer's customer-facing bundle price
 * (what the customer actually pays), so 100% means HQ gets the full offer price.
 */
export async function resolveOfferHqPrice(
  ctx: QueryCtx | MutationCtx,
  agentId: Id<"users">,
  offerId: Id<"offers">,
  stockModel: StockModel,
  offerBundlePrice: number
): Promise<ResolvedOfferPrice | null> {
  // 1. Check agentPricing for offer-specific override
  const agentPricing = await ctx.db
    .query("agentPricing")
    .withIndex("by_agentId_and_stockModel", (q) =>
      q.eq("agentId", agentId).eq("stockModel", stockModel)
    )
    .unique();

  if (agentPricing?.offerOverrides) {
    const override = agentPricing.offerOverrides.find(
      (o) => o.offerId === offerId
    );
    if (override) {
      return {
        hqBundlePrice: applyRate(
          offerBundlePrice,
          override.rateType,
          override.rateValue
        ),
      };
    }
  }

  // 2. Check offerPricing table for (offerId, stockModel)
  const offerPricingRule = await ctx.db
    .query("offerPricing")
    .withIndex("by_offerId_and_stockModel", (q) =>
      q.eq("offerId", offerId).eq("stockModel", stockModel)
    )
    .unique();

  if (offerPricingRule) {
    return {
      hqBundlePrice: applyRate(
        offerBundlePrice,
        offerPricingRule.rateType,
        offerPricingRule.rateValue
      ),
    };
  }

  // 3. No offer-level pricing found
  return null;
}

/**
 * Resolves the HQ unit price for an agent + product + stock model combination.
 *
 * Cascade order (first match wins):
 * 1. agentPricing.productOverrides for (agentId, stockModel, productId)
 * 2. agentPricing.collectionOverrides for (agentId, stockModel, product.collection)
 * 3. agentPricing default rate for (agentId, stockModel)
 * 4. pricingDefaults for (stockModel, productId) — single product
 * 5. pricingDefaults for (stockModel, productIds containing productId) — multi-product
 * 6. pricingDefaults for (stockModel, collection matching product's collection)
 * 7. pricingDefaults for (stockModel, null) — global default for that model
 * 8. Fallback: product.price (full retail = 100%)
 *
 * For percentage rates, the base is always the product's retail price.
 * pricingDefaults are fallbacks used when no agentPricing exists.
 */
export async function resolveAgentPrice(
  ctx: QueryCtx | MutationCtx,
  agentId: Id<"users">,
  productId: Id<"products">,
  stockModel: StockModel
): Promise<ResolvedPrice> {
  const product = await ctx.db.get(productId);
  if (!product) throw new Error("Product not found");
  const retailPrice = product.price;

  // 1. Check agentPricing for product-specific override
  const agentPricing = await ctx.db
    .query("agentPricing")
    .withIndex("by_agentId_and_stockModel", (q) =>
      q.eq("agentId", agentId).eq("stockModel", stockModel)
    )
    .unique();

  if (agentPricing?.productOverrides) {
    const override = agentPricing.productOverrides.find(
      (o) => o.productId === productId
    );
    if (override) {
      return {
        hqUnitPrice: applyRate(retailPrice, override.rateType, override.rateValue),
        retailPrice,
      };
    }
  }

  // 2. Check agentPricing for collection-level override
  if (agentPricing?.collectionOverrides && product.collection) {
    const collOverride = agentPricing.collectionOverrides.find(
      (o) => o.collection === product.collection
    );
    if (collOverride) {
      return {
        hqUnitPrice: applyRate(retailPrice, collOverride.rateType, collOverride.rateValue),
        retailPrice,
      };
    }
  }

  // 3. Check agentPricing default rate for this stock model
  if (agentPricing) {
    return {
      hqUnitPrice: applyRate(
        retailPrice,
        agentPricing.rateType,
        agentPricing.rateValue
      ),
      retailPrice,
    };
  }

  // 4. Check pricingDefaults for (stockModel, productId)
  const productDefault = await ctx.db
    .query("pricingDefaults")
    .withIndex("by_stockModel_and_productId", (q) =>
      q.eq("stockModel", stockModel).eq("productId", productId)
    )
    .unique();

  if (productDefault) {
    return {
      hqUnitPrice: applyRate(retailPrice, productDefault.rateType, productDefault.rateValue),
      retailPrice,
    };
  }

  // 5. Check pricingDefaults for multi-product rules containing this productId
  const stockModelDefaults = await ctx.db
    .query("pricingDefaults")
    .withIndex("by_stockModel", (q) => q.eq("stockModel", stockModel))
    .take(200);

  const multiProductMatch = stockModelDefaults.find(
    (d) => d.productIds && d.productIds.includes(productId)
  );

  if (multiProductMatch) {
    return {
      hqUnitPrice: applyRate(retailPrice, multiProductMatch.rateType, multiProductMatch.rateValue),
      retailPrice,
    };
  }

  // 6. Check pricingDefaults for collection match
  if (product.collection) {
    const collectionDefault = await ctx.db
      .query("pricingDefaults")
      .withIndex("by_stockModel_and_collection", (q) =>
        q.eq("stockModel", stockModel).eq("collection", product.collection)
      )
      .unique();

    if (collectionDefault) {
      return {
        hqUnitPrice: applyRate(
          retailPrice,
          collectionDefault.rateType,
          collectionDefault.rateValue
        ),
        retailPrice,
      };
    }
  }

  // 7. Check pricingDefaults for (stockModel, global)
  const globalDefault = await ctx.db
    .query("pricingDefaults")
    .withIndex("by_stockModel_and_productId", (q) =>
      q.eq("stockModel", stockModel).eq("productId", undefined)
    )
    .unique();

  if (globalDefault) {
    return {
      hqUnitPrice: applyRate(retailPrice, globalDefault.rateType, globalDefault.rateValue),
      retailPrice,
    };
  }

  // 8. Fallback: full retail price
  return { hqUnitPrice: retailPrice, retailPrice };
}

function applyRate(
  basePrice: number,
  rateType: "fixed" | "percentage",
  rateValue: number
): number {
  if (rateType === "percentage") {
    return Math.round(basePrice * rateValue * 100) / 100;
  }
  return rateValue;
}
