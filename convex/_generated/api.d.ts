/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminResetPassword from "../adminResetPassword.js";
import type * as agentInvites from "../agentInvites.js";
import type * as agentProfiles from "../agentProfiles.js";
import type * as agentSettlements from "../agentSettlements.js";
import type * as auth from "../auth.js";
import type * as batches from "../batches.js";
import type * as dashboard from "../dashboard.js";
import type * as emails from "../emails.js";
import type * as files from "../files.js";
import type * as helpers_auth from "../helpers/auth.js";
import type * as helpers_dates from "../helpers/dates.js";
import type * as helpers_pricing from "../helpers/pricing.js";
import type * as http from "../http.js";
import type * as interestForms from "../interestForms.js";
import type * as interests from "../interests.js";
import type * as inventory from "../inventory.js";
import type * as offerPricing from "../offerPricing.js";
import type * as offers from "../offers.js";
import type * as passwordChange from "../passwordChange.js";
import type * as passwordReset from "../passwordReset.js";
import type * as productVariants from "../productVariants.js";
import type * as products from "../products.js";
import type * as quickSwitch from "../quickSwitch.js";
import type * as rates from "../rates.js";
import type * as sales from "../sales.js";
import type * as seed from "../seed.js";
import type * as stockMovements from "../stockMovements.js";
import type * as stockRequests from "../stockRequests.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminResetPassword: typeof adminResetPassword;
  agentInvites: typeof agentInvites;
  agentProfiles: typeof agentProfiles;
  agentSettlements: typeof agentSettlements;
  auth: typeof auth;
  batches: typeof batches;
  dashboard: typeof dashboard;
  emails: typeof emails;
  files: typeof files;
  "helpers/auth": typeof helpers_auth;
  "helpers/dates": typeof helpers_dates;
  "helpers/pricing": typeof helpers_pricing;
  http: typeof http;
  interestForms: typeof interestForms;
  interests: typeof interests;
  inventory: typeof inventory;
  offerPricing: typeof offerPricing;
  offers: typeof offers;
  passwordChange: typeof passwordChange;
  passwordReset: typeof passwordReset;
  productVariants: typeof productVariants;
  products: typeof products;
  quickSwitch: typeof quickSwitch;
  rates: typeof rates;
  sales: typeof sales;
  seed: typeof seed;
  stockMovements: typeof stockMovements;
  stockRequests: typeof stockRequests;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
