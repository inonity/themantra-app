import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

export interface ResolvedPrice {
  hqUnitPrice: number;
  retailPrice: number;
}

export interface ResolvedOfferPrice {
  hqBundlePrice: number;
}

/**
 * Resolves the HQ price for an entire offer bundle using the agent's rate.
 *
 * Cascade order:
 * 1. offerPricing for (offerId, rateId)
 * 2. Return null → caller falls through to per-product pricing
 *
 * For percentage rates, the base is the offer's customer-facing bundle price.
 */
export async function resolveOfferHqPrice(
  ctx: QueryCtx | MutationCtx,
  agentId: Id<"users">,
  offerId: Id<"offers">,
  offerBundlePrice: number
): Promise<ResolvedOfferPrice | null> {
  const rateId = await getAgentRateId(ctx, agentId);
  if (!rateId) return null;

  const offerPricingRule = await ctx.db
    .query("offerPricing")
    .withIndex("by_offerId_and_rateId", (q) =>
      q.eq("offerId", offerId).eq("rateId", rateId)
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

  return null;
}

/**
 * Resolves the HQ unit price for an agent + product using the agent's assigned rate.
 *
 * Cascade order (first match wins):
 * 1. Rate's collectionRates for the product's collection
 * 2. Rate's defaultRate
 * 3. Fallback: product.price (full retail = 100%)
 *
 * For percentage rates, the base is always the product's retail price.
 */
export async function resolveAgentPrice(
  ctx: QueryCtx | MutationCtx,
  agentId: Id<"users">,
  productId: Id<"products">
): Promise<ResolvedPrice> {
  const product = await ctx.db.get(productId);
  if (!product) throw new Error("Product not found");
  const retailPrice = product.price;

  const rateId = await getAgentRateId(ctx, agentId);
  if (!rateId) {
    // No rate assigned — full retail
    return { hqUnitPrice: retailPrice, retailPrice };
  }

  const rate = await ctx.db.get(rateId);
  if (!rate) {
    return { hqUnitPrice: retailPrice, retailPrice };
  }

  // 1. Check collectionRates for the product's collection
  if (product.collection) {
    const collectionRate = rate.collectionRates.find(
      (cr) => cr.collection === product.collection
    );
    if (collectionRate) {
      return {
        hqUnitPrice: applyRate(retailPrice, collectionRate.rateType, collectionRate.rateValue),
        retailPrice,
      };
    }
  }

  // 2. Check defaultRate on the rate
  if (rate.defaultRate) {
    return {
      hqUnitPrice: applyRate(retailPrice, rate.defaultRate.rateType, rate.defaultRate.rateValue),
      retailPrice,
    };
  }

  // 3. Fallback: full retail price
  return { hqUnitPrice: retailPrice, retailPrice };
}

/** Look up the agent's assigned rateId from their profile. */
async function getAgentRateId(
  ctx: QueryCtx | MutationCtx,
  agentId: Id<"users">
): Promise<Id<"rates"> | null> {
  const profile = await ctx.db
    .query("agentProfiles")
    .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
    .unique();
  return profile?.rateId ?? null;
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
