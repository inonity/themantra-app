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
 * Resolves the HQ unit price for an agent + product/variant using the agent's assigned rate.
 *
 * When variantId is provided, the variant determines the pricing path:
 *   - Agent variants (forWho="agents"): look up by variant.type in agentVariantRates.
 *     Default: full variant price (agent pays 100%).
 *   - Customer variants (forWho="customers"/"both"/unset): look up by (collection, sizeMl)
 *     in collectionRates. Default: full retail (HQ takes 100%).
 *
 * When variantId is absent (legacy records): use product.price + collection fallback.
 */
export async function resolveAgentPrice(
  ctx: QueryCtx | MutationCtx,
  agentId: Id<"users">,
  productId: Id<"products">,
  variantId?: Id<"productVariants">
): Promise<ResolvedPrice> {
  let retailPrice: number;
  let collection: string | undefined;
  let sizeMl: number | undefined;
  let forWho: string | undefined;
  let variantType: string | undefined;

  if (variantId) {
    const variant = await ctx.db.get(variantId);
    if (!variant) throw new Error("Variant not found");
    retailPrice = variant.price;
    sizeMl = variant.sizeMl;
    forWho = variant.forWho;
    variantType = variant.type;
    const product = await ctx.db.get(productId);
    collection = product?.collection;
  } else {
    const product = await ctx.db.get(productId);
    if (!product) throw new Error("Product not found");
    retailPrice = product.price ?? 0;
    collection = product.collection;
  }

  const rateId = await getAgentRateId(ctx, agentId);
  if (!rateId) {
    return { hqUnitPrice: retailPrice, retailPrice };
  }

  const rate = await ctx.db.get(rateId);
  if (!rate) {
    return { hqUnitPrice: retailPrice, retailPrice };
  }

  // Agent-only variants (tester, refill, etc.): price by type
  if (forWho === "agents") {
    if (variantType && rate.agentVariantRates && rate.agentVariantRates.length > 0) {
      const agentRate = rate.agentVariantRates.find((r) => r.type === variantType);
      if (agentRate) {
        return {
          hqUnitPrice: applyRate(retailPrice, agentRate.rateType, agentRate.rateValue),
          retailPrice,
        };
      }
    }
    // No rate set for this type — agent pays full variant price
    return { hqUnitPrice: retailPrice, retailPrice };
  }

  // Customer-facing variants: price by (collection, sizeMl)
  if (collection) {
    const collectionRate = rate.collectionRates.find(
      (cr) => cr.collection === collection && cr.sizeMl === sizeMl
    );
    if (collectionRate) {
      return {
        hqUnitPrice: applyRate(retailPrice, collectionRate.rateType, collectionRate.rateValue),
        retailPrice,
      };
    }
  }

  // Fallback: HQ takes full retail (agent commission = 0)
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
