import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { CORS_HEADERS, handleMcpPost } from "./mcp/server";
import {
  authorizationServerMetadata,
  issueToken,
  protectedResourceMetadata,
  registerClient,
} from "./mcp/oauth";

const http = httpRouter();

auth.addHttpRoutes(http);

/* ------------------------------ MCP endpoint ------------------------------ */

const preflight = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
});

http.route({
  path: "/mcp",
  method: "POST",
  handler: httpAction(async (ctx, request) => handleMcpPost(ctx, request)),
});

// This server never initiates messages, so there is no SSE stream to open.
// The spec allows refusing GET outright.
http.route({
  path: "/mcp",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        error: "method_not_allowed",
        error_description:
          "This MCP server is stateless and does not provide an SSE stream. POST JSON-RPC to this URL instead.",
      }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      }
    );
  }),
});

// Stateless: there is no session to tear down, but clients expect a clean 204.
http.route({
  path: "/mcp",
  method: "DELETE",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }),
});

http.route({ path: "/mcp", method: "OPTIONS", handler: preflight });

/* --------------------------- OAuth for claude.ai --------------------------- */

// Clients look for the metadata at the bare well-known path and, since the
// 2025-06-18 spec, at a path suffixed with the resource path.
for (const path of [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
]) {
  http.route({
    path,
    method: "GET",
    handler: httpAction(async () => protectedResourceMetadata()),
  });
  http.route({ path, method: "OPTIONS", handler: preflight });
}

for (const path of [
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-authorization-server/mcp",
]) {
  http.route({
    path,
    method: "GET",
    handler: httpAction(async () => authorizationServerMetadata()),
  });
  http.route({ path, method: "OPTIONS", handler: preflight });
}

http.route({
  path: "/mcp/oauth/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => registerClient(ctx, request)),
});
http.route({ path: "/mcp/oauth/register", method: "OPTIONS", handler: preflight });

http.route({
  path: "/mcp/oauth/token",
  method: "POST",
  handler: httpAction(async (ctx, request) => issueToken(ctx, request)),
});
http.route({ path: "/mcp/oauth/token", method: "OPTIONS", handler: preflight });

export default http;
