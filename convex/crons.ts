import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keep MCP call history bounded — see RETENTION_MS in mcpUsage.ts.
crons.interval(
  "prune old MCP tool call records",
  { hours: 24 },
  internal.mcpUsage.pruneOldCalls,
  {}
);

// Lapse unpaid storefront orders — see ORDER_TTL_MS in helpers/checkout.ts.
crons.interval(
  "expire unpaid storefront orders",
  { minutes: 30 },
  internal.orders.expireStale,
  {}
);

export default crons;
