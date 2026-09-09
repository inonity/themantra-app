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

export default crons;
