import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { users: _users, ...otherAuthTables } = authTables;

export default defineSchema({
  ...otherAuthTables,

  users: defineTable({
    // Auth fields (must keep these)
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Custom fields
    role: v.optional(
      v.union(v.literal("admin"), v.literal("agent"), v.literal("sales"))
    ),
    nickname: v.optional(v.string()),
    address: v.optional(v.string()),
    invitedBy: v.optional(v.id("users")),
    // Pending email change
    pendingEmail: v.optional(v.string()),
    pendingEmailToken: v.optional(v.string()),
    pendingEmailExpiresAt: v.optional(v.number()),
    passwordResetToken: v.optional(v.string()),
    passwordResetExpiresAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    // NOTE: "distributor" and "stockist" roles planned for future
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"])
    .index("by_passwordResetToken", ["passwordResetToken"]),

  products: defineTable({
    name: v.string(),
    shortCode: v.optional(v.string()), // 2-letter code, e.g. "MA" for "Mon Amour"
    description: v.optional(v.string()),
    collection: v.optional(v.string()), // e.g. "Inspired"
    price: v.optional(v.number()), // deprecated — price is now on productVariants
    status: v.union(v.literal("active"), v.literal("discontinued"), v.literal("future_release")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_shortCode", ["shortCode"])
    .index("by_collection", ["collection"]),

  productVariants: defineTable({
    productId: v.id("products"),
    name: v.string(),           // auto-generated: "30ML" for customers, "Tester 10ML" for agents
    sizeMl: v.optional(v.number()),
    type: v.optional(v.string()), // agent variant type label e.g. "Tester", "Refill" (agents only)
    price: v.number(),          // retail price for this variant
    forWho: v.optional(v.union(
      v.literal("customers"),   // customer-facing (shown in public/customer flows)
      v.literal("agents"),      // agent-only (tester, refill — hidden from customers)
      v.literal("both")         // visible in all flows
    )),
    // Legacy fields — kept optional for existing documents until migration runs
    variantType: v.optional(v.union(
      v.literal("standard"),
      v.literal("tester"),
      v.literal("filling")
    )),
    agentOnly: v.optional(v.boolean()),
    status: v.union(v.literal("active"), v.literal("discontinued")),
    sortOrder: v.optional(v.number()), // controls display order within a product
    updatedAt: v.optional(v.number()),
  })
    .index("by_productId", ["productId"])
    .index("by_productId_and_status", ["productId", "status"]),

  batches: defineTable({
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")), // which variant this batch produces
    batchCode: v.string(),
    manufacturedDate: v.string(), // ISO date string
    expectedReadyDate: v.optional(v.string()), // expected maturation date (ISO date string)
    totalQuantity: v.number(),
    status: v.union(
      v.literal("upcoming"),
      v.literal("partial"),   // some units released, batch still maturing
      v.literal("available"),
      v.literal("depleted"),
      v.literal("cancelled")
    ),
    // How many units have been released to business inventory so far.
    // Only meaningful for partial/available batches; absent = 0 for upcoming.
    releasedQuantity: v.optional(v.number()),
    notes: v.optional(v.string()),
    originSource: v.optional(v.string()), // deprecated, kept optional for existing data
    updatedAt: v.optional(v.number()),
  })
    .index("by_productId", ["productId"])
    .index("by_productId_and_status", ["productId", "status"])
    .index("by_batchCode", ["batchCode"]),

  sales: defineTable({
    // b2c = agent→customer, b2b = HQ→agent/stockist
    type: v.union(v.literal("b2c"), v.literal("b2b")),

    // Parties
    sellerType: v.union(v.literal("business"), v.literal("agent")),
    sellerId: v.optional(v.id("users")),
    buyerType: v.union(v.literal("agent"), v.literal("customer")),
    buyerId: v.optional(v.id("users")),

    // Customer (B2C only)
    customerDetail: v.optional(
      v.object({
        name: v.string(),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
      })
    ),

    // Sale details
    saleChannel: v.union(
      v.literal("direct"),
      v.literal("agent"),
      v.literal("tiktok"),
      v.literal("shopee"),
      v.literal("other")
    ),
    offerId: v.optional(v.id("offers")),
    // Snapshot of offer at time of sale (immutable historical record)
    offerSnapshot: v.optional(
      v.object({
        name: v.string(),
        minQuantity: v.number(),
        bundlePrice: v.number(),
        hqBundlePrice: v.optional(v.number()),
      })
    ),
    notes: v.optional(v.string()),

    // Financials
    totalAmount: v.number(),
    totalQuantity: v.number(),

    // Payment
    paymentStatus: v.union(
      v.literal("unpaid"),
      v.literal("paid"),
      v.literal("partial")
    ),
    amountPaid: v.number(),
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("qr"),
        v.literal("bank_transfer"),
        v.literal("online"),
        v.literal("other")
      )
    ),
    paymentProofStorageId: v.optional(v.id("_storage")),
    amountReceived: v.optional(v.number()), // what customer actually paid
    overpaymentAmount: v.optional(v.number()), // excess when customer pays more than totalAmount
    overpaymentRecipient: v.optional(v.union(v.literal("seller"), v.literal("hq"))), // who keeps the overpayment
    paidAt: v.optional(v.number()),

    // Stock model & HQ pricing
    stockModel: v.optional(
      v.union(
        v.literal("hold_paid"),
        v.literal("consignment"),
        v.literal("presell"),
        v.literal("dropship") // legacy — kept for existing records
      )
    ),
    hqPrice: v.optional(v.number()),
    agentCommission: v.optional(v.number()),
    hqSettled: v.optional(v.boolean()),
    settlementId: v.optional(v.id("agentSettlements")),
    dropshipCollector: v.optional(
      v.union(v.literal("agent"), v.literal("hq"))
    ),
    paymentCollector: v.optional(
      v.union(v.literal("agent"), v.literal("hq"))
    ),

    // Ecommerce (future)
    externalOrderId: v.optional(v.string()),
    externalPlatform: v.optional(v.string()),

    // Fulfillment tracking
    fulfillmentStatus: v.optional(
      v.union(
        v.literal("fulfilled"),
        v.literal("pending_stock"),
        v.literal("partial")
      )
    ),
    fulfilledAt: v.optional(v.number()),
    interestId: v.optional(v.id("interests")),
    lineItems: v.optional(
      v.array(
        v.object({
          productId: v.id("products"),
          variantId: v.optional(v.id("productVariants")),
          variantName: v.optional(v.string()), // snapshot of variant name at sale time
          quantity: v.number(),
          unitPrice: v.optional(v.number()),
          // Snapshot of product at time of sale (immutable historical record)
          productName: v.optional(v.string()),
          productPrice: v.optional(v.number()), // original retail price at sale time
          fulfillmentSource: v.optional(
            v.union(
              v.literal("agent_stock"),
              v.literal("hq_transfer"),
              v.literal("hq_direct"),
              v.literal("pending_batch"),
              v.literal("future_release")
            )
          ),
          fulfilledQuantity: v.optional(v.number()),
          batchId: v.optional(v.id("batches")),
          fulfilledAt: v.optional(v.number()),
          hqUnitPrice: v.optional(v.number()),
          inBundle: v.optional(v.boolean()),
        })
      )
    ),

    // Metadata
    saleDate: v.number(),
    recordedBy: v.id("users"),
  })
    .index("by_sellerId_and_saleDate", ["sellerId", "saleDate"])
    .index("by_paymentStatus_and_saleDate", ["paymentStatus", "saleDate"])
    .index("by_saleChannel_and_saleDate", ["saleChannel", "saleDate"])
    .index("by_type_and_saleDate", ["type", "saleDate"])
    .index("by_saleDate", ["saleDate"])
    .index("by_buyerId_and_saleDate", ["buyerId", "saleDate"])
    .index("by_fulfillmentStatus_and_saleDate", ["fulfillmentStatus", "saleDate"]),

  stockMovements: defineTable({
    batchId: v.id("batches"),
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    fromPartyType: v.union(v.literal("business"), v.literal("agent")),
    fromPartyId: v.optional(v.id("users")),
    toPartyType: v.union(v.literal("agent"), v.literal("customer")),
    toPartyId: v.optional(v.id("users")),
    quantity: v.number(),
    movedAt: v.number(),
    notes: v.optional(v.string()),
    recordedBy: v.id("users"),
    salePrice: v.optional(v.number()),
    unitPrice: v.optional(v.number()),
    saleId: v.optional(v.id("sales")),
    stockModel: v.optional(
      v.union(
        v.literal("hold_paid"),
        v.literal("consignment"),
        v.literal("presell"),
        v.literal("dropship") // legacy — kept for existing records
      )
    ),
    hqUnitPrice: v.optional(v.number()),
  })
    .index("by_productId", ["productId"])
    .index("by_batchId", ["batchId"])
    .index("by_recordedBy", ["recordedBy"])
    .index("by_toPartyType", ["toPartyType"])
    .index("by_saleId", ["saleId"]),

  inventory: defineTable({
    batchId: v.id("batches"),
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    heldByType: v.union(v.literal("business"), v.literal("agent")),
    heldById: v.optional(v.id("users")), // agentId when heldByType is "agent"
    quantity: v.number(),
    stockModel: v.optional(
      v.union(v.literal("hold_paid"), v.literal("consignment"), v.literal("presell"), v.literal("dropship"))
    ),
    updatedAt: v.optional(v.number()),
    // NOTE: "distributor" and "stockist" heldByType values planned for future
  })
    .index("by_productId", ["productId"])
    .index("by_batchId_and_heldByType_and_heldById", [
      "batchId",
      "heldByType",
      "heldById",
    ])
    .index("by_heldByType_and_heldById", ["heldByType", "heldById"])
    .index("by_batchId_and_heldByType_and_heldById_and_stockModel", [
      "batchId",
      "heldByType",
      "heldById",
      "stockModel",
    ]),

  offers: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    type: v.literal("bundle"), // extensible later with v.union(...)
    minQuantity: v.number(), // e.g. 3
    bundlePrice: v.number(), // e.g. 100 (total for the bundle)
    // Product scope — AND with sizeMl/forWho filters below
    productId: v.optional(v.id("products")), // single product mode
    productIds: v.optional(v.array(v.id("products"))), // multiple products mode
    collection: v.optional(v.string()), // collection filter (absent = all collections)
    // Size filter — if set, only applies to variants with this sizeMl
    sizeMl: v.optional(v.number()),
    // Audience filter — if set, only applies in matching sale context
    forWho: v.optional(v.union(
      v.literal("customers"),
      v.literal("agents"),
      v.literal("both")
    )),
    // Legacy variant scope (kept for backward compat with old offers)
    variantId: v.optional(v.id("productVariants")),
    variantIds: v.optional(v.array(v.id("productVariants"))),
    agentIds: v.optional(v.array(v.id("users"))), // eligible agents (empty/absent = all)
    isActive: v.boolean(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    createdBy: v.id("users"),
    updatedAt: v.optional(v.number()),
  }).index("by_isActive", ["isActive"]),

  offerPricing: defineTable({
    offerId: v.id("offers"),
    rateId: v.id("rates"),
    rateType: v.union(v.literal("fixed"), v.literal("percentage")),
    rateValue: v.number(),
    updatedBy: v.id("users"),
    updatedAt: v.optional(v.number()),
  })
    .index("by_offerId_and_rateId", ["offerId", "rateId"])
    .index("by_offerId", ["offerId"])
    .index("by_rateId", ["rateId"]),

  rates: defineTable({
    name: v.string(),
    // Per (collection, sizeMl) HQ pricing for customer-facing variants
    collectionRates: v.array(
      v.object({
        collection: v.string(),
        sizeMl: v.optional(v.number()), // optional for backward compat with old documents
        rateType: v.union(v.literal("fixed"), v.literal("percentage")),
        rateValue: v.number(),
      })
    ),
    // Per agent variant type HQ pricing (e.g. Tester, Refill)
    agentVariantRates: v.optional(
      v.array(
        v.object({
          type: v.string(),
          rateType: v.union(v.literal("fixed"), v.literal("percentage")),
          rateValue: v.number(),
        })
      )
    ),
    // Legacy — kept for backward compat, no longer used in pricing logic
    forWhoRates: v.optional(
      v.array(
        v.object({
          forWho: v.union(
            v.literal("customers"),
            v.literal("agents"),
            v.literal("both")
          ),
          rateType: v.union(v.literal("fixed"), v.literal("percentage")),
          rateValue: v.number(),
        })
      )
    ),
    defaultRate: v.optional(
      v.object({
        rateType: v.union(v.literal("fixed"), v.literal("percentage")),
        rateValue: v.number(),
      })
    ),
    createdBy: v.id("users"),
    updatedAt: v.optional(v.number()),
  }).index("by_name", ["name"]),

  agentProfiles: defineTable({
    agentId: v.id("users"),
    rateId: v.optional(v.id("rates")),
    defaultStockModel: v.optional(
      v.union(
        v.literal("hold_paid"),
        v.literal("consignment"),
        v.literal("presell"),
        v.literal("dropship") // legacy — kept for existing records
      )
    ),
    notes: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  }).index("by_agentId", ["agentId"]),

  agentSettlements: defineTable({
    agentId: v.id("users"),
    referenceId: v.string(),
    saleIds: v.array(v.id("sales")),
    totalAmount: v.number(),
    // agent_to_hq = agent owes HQ (agent collected payment)
    // hq_to_agent = HQ owes agent commission (HQ collected payment)
    direction: v.optional(
      v.union(v.literal("agent_to_hq"), v.literal("hq_to_agent"))
    ),
    // pending = accumulating sales, submitted = agent recorded payment, paid = admin confirmed
    paymentStatus: v.union(
      v.literal("pending"),
      v.literal("submitted"),
      v.literal("paid")
    ),
    amountPaid: v.number(),
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("bank_transfer"),
        v.literal("online"),
        v.literal("other")
      )
    ),
    paidAt: v.optional(v.number()), // when admin confirmed
    // Agent payment submission fields
    paymentDate: v.optional(v.number()), // date agent says they transferred
    submittedAt: v.optional(v.number()), // when agent clicked "record payment"
    agentNotes: v.optional(v.string()), // optional note from agent
    confirmedAt: v.optional(v.number()), // when admin confirmed
    notes: v.optional(v.string()), // admin notes
    createdAt: v.number(),
  })
    .index("by_agentId", ["agentId"])
    .index("by_referenceId", ["referenceId"])
    .index("by_agentId_and_paymentStatus", ["agentId", "paymentStatus"])
    .index("by_agentId_and_direction_and_paymentStatus", [
      "agentId",
      "direction",
      "paymentStatus",
    ]),

  agentInvites: defineTable({
    email: v.string(),
    name: v.string(),
    phone: v.string(),
    role: v.optional(v.union(v.literal("agent"), v.literal("sales"))),
    inviteToken: v.string(),
    status: v.union(v.literal("pending"), v.literal("completed")),
    emailStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("failed")
      )
    ),
    emailSentAt: v.optional(v.number()),
    emailError: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedAt: v.optional(v.number()),
  })
    .index("by_inviteToken", ["inviteToken"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  interests: defineTable({
    agentId: v.id("users"),
    customerDetail: v.object({
      name: v.string(),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
    items: v.array(
      v.object({
        productId: v.id("products"),
        variantId: v.optional(v.id("productVariants")),
        quantity: v.number(),
      })
    ),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("converted"),
      v.literal("cancelled")
    ),
    convertedSaleId: v.optional(v.id("sales")),
    formId: v.optional(v.id("interestForms")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_agentId_and_status", ["agentId", "status"])
    .index("by_agentId_and_createdAt", ["agentId", "createdAt"])
    .index("by_status", ["status"])
    .index("by_formId_and_status", ["formId", "status"])
    .index("by_formId_and_createdAt", ["formId", "createdAt"]),

  interestForms: defineTable({
    agentId: v.id("users"),
    slug: v.string(),
    title: v.optional(v.string()),
    stockModel: v.union(
      v.literal("hold_paid"),
      v.literal("consignment"),
      v.literal("presell")
    ),
    date: v.string(), // ISO date string shown on the form
    offerId: v.optional(v.id("offers")),
    notes: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("closed")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_agentId_and_status", ["agentId", "status"])
    .index("by_agentId_and_createdAt", ["agentId", "createdAt"]),

  stockRequests: defineTable({
    agentId: v.id("users"),
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    quantity: v.number(),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("fulfilled"),
      v.literal("cancelled")
    ),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_agentId_and_status", ["agentId", "status"])
    .index("by_status_and_createdAt", ["status", "createdAt"]),
});
