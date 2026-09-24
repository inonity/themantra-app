/**
 * MCP over Streamable HTTP.
 *
 * The official MCP TypeScript SDK expects Node's http objects, which Convex
 * HTTP actions do not provide, so the JSON-RPC layer is implemented directly.
 * It is small: initialize, tools/list, tools/call, plus the empty capability
 * listings clients probe for.
 *
 * Responses are plain JSON. That is valid Streamable HTTP — SSE is only needed
 * for server-initiated messages, and this server has none.
 */

import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { McpIdentity } from "./auth";
import { sha256Hex } from "./crypto";
import { findTool, toWireTool, toolsForRole } from "./tools";
import { publicOrigin } from "./config";

const SERVER_NAME = "the-mantra";
const SERVER_VERSION = "1.0.0";

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL = "2025-06-18";

/** Rewrite `lastUsedAt` at most this often per token. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sent to the model once at connection time. Worth the tokens: it stops the
 * model guessing at scope, currency and date handling on every later turn.
 */
const INSTRUCTIONS = `The Mantra — inventory and sales for a perfume business in Malaysia.

For open-ended questions start with \`overview\`; it answers most "how are we doing" asks in a single call. Use \`whoami\` when you need the user's role or today's date (Malaysia, UTC+8).

Results are already formatted as compact text tables. Quote the figures as given rather than recomputing them. Money is Malaysian ringgit (RM); dates are YYYY-MM-DD in Malaysia time.

Data is scoped to whoever's token this is: agent and sales accounts see only their own sales, stock and settlements, while admins see the whole business. When a tool says a record belongs to someone else, that is the permission boundary — not a transient error to retry.

No tool here moves stock or money. \`create_stock_request\` and \`record_interest\` only file a request or a note that a person then confirms in the app.`;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};

type JsonRpcId = string | number | null;

type JsonRpcMessage = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

const ERROR_PARSE = -32700;
const ERROR_INVALID_REQUEST = -32600;
const ERROR_METHOD_NOT_FOUND = -32601;
const ERROR_INVALID_PARAMS = -32602;
const ERROR_INTERNAL = -32603;

function ok(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function fail(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extra },
  });
}

/**
 * 401 carrying the pointer an MCP client follows to start OAuth (RFC 9728).
 * Clients holding a static token simply see an auth failure.
 */
export function unauthorized(detail: string): Response {
  const origin = publicOrigin();
  const challenge = origin
    ? `Bearer realm="${SERVER_NAME}", resource_metadata="${origin}/.well-known/oauth-protected-resource"`
    : `Bearer realm="${SERVER_NAME}"`;
  return json({ error: "unauthorized", error_description: detail }, 401, {
    "WWW-Authenticate": challenge,
  });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Resolve the caller, or null when the token is missing/invalid/revoked. */
export async function authenticate(
  ctx: ActionCtx,
  request: Request,
  now: number
): Promise<McpIdentity | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const identity = await ctx.runQuery(internal.mcp.auth.resolveToken, {
    tokenHash: await sha256Hex(token),
    now,
  });
  if (!identity) return null;

  if (
    identity.lastUsedAt === null ||
    now - identity.lastUsedAt > TOUCH_INTERVAL_MS
  ) {
    await ctx.runMutation(internal.mcp.auth.touchToken, {
      tokenId: identity.tokenId,
      now,
    });
  }

  return identity;
}

function negotiateProtocol(params: unknown): string {
  const requested =
    params && typeof params === "object"
      ? (params as { protocolVersion?: unknown }).protocolVersion
      : undefined;
  return typeof requested === "string" && SUPPORTED_PROTOCOLS.includes(requested)
    ? requested
    : DEFAULT_PROTOCOL;
}

async function callTool(
  ctx: ActionCtx,
  identity: McpIdentity,
  params: unknown,
  now: number
) {
  const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
  const name = typeof p.name === "string" ? p.name : null;
  if (!name) {
    return { error: { code: ERROR_INVALID_PARAMS, message: "Missing tool name" } };
  }

  const tool = findTool(name, identity.role);
  if (!tool) {
    // A tool that exists but is barred for this role gets the same answer as
    // one that does not exist — the catalogue already reflects the role.
    return {
      result: {
        content: [
          {
            type: "text",
            text: `No tool named "${name}" is available to your account (role: ${identity.role}).`,
          },
        ],
        isError: true,
      },
    };
  }

  const input =
    p.arguments && typeof p.arguments === "object" ? p.arguments : {};

  const startedAt = Date.now();
  let text: string;
  let ok = true;

  try {
    text =
      tool.kind === "read"
        ? await ctx.runQuery(internal.mcp.read.runReadTool, {
            tool: tool.name,
            input,
            userId: identity.userId,
            now,
          })
        : await ctx.runMutation(internal.mcp.write.runWriteTool, {
            tool: tool.name,
            input,
            userId: identity.userId,
            now,
          });
  } catch (error) {
    // Tool failures belong in the result, not as a JSON-RPC error, so the
    // model can read them and correct itself.
    ok = false;
    text =
      error instanceof Error ? error.message : "Unexpected error running tool";
  }

  // Usage record. Never let bookkeeping fail the call the user asked for.
  try {
    await ctx.runMutation(internal.mcpUsage.log, {
      tokenId: identity.tokenId,
      userId: identity.userId,
      tool: tool.name,
      ok,
      durationMs: Date.now() - startedAt,
      errorMessage: ok ? undefined : text,
      calledAt: startedAt,
    });
  } catch {
    // Ignored on purpose.
  }

  return { result: { content: [{ type: "text", text }], isError: !ok } };
}

async function handleMessage(
  ctx: ActionCtx,
  identity: McpIdentity,
  message: JsonRpcMessage,
  now: number
): Promise<object | null> {
  const id = (message.id ?? null) as JsonRpcId;
  const isNotification = message.id === undefined || message.id === null;
  const method = typeof message.method === "string" ? message.method : null;

  if (!method) {
    return isNotification
      ? null
      : fail(id, ERROR_INVALID_REQUEST, "Missing method");
  }

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: negotiateProtocol(message.params),
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: SERVER_NAME,
          title: "The Mantra",
          version: SERVER_VERSION,
        },
        instructions: INSTRUCTIONS,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
    case "notifications/progress":
      return null;

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: toolsForRole(identity.role).map(toWireTool),
      });

    case "tools/call": {
      const outcome = await callTool(ctx, identity, message.params, now);
      if ("error" in outcome && outcome.error) {
        return fail(id, outcome.error.code, outcome.error.message);
      }
      return ok(id, outcome.result);
    }

    // Probed by some clients during handshake; answering emptily is cheaper
    // than letting them retry a "method not found".
    case "resources/list":
      return ok(id, { resources: [] });
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });

    default:
      return isNotification
        ? null
        : fail(id, ERROR_METHOD_NOT_FOUND, `Unknown method: ${method}`);
  }
}

export const TOKEN_REQUIRED =
  "A valid MCP access token is required. Create one in The Mantra under Settings → MCP access.";

export async function handleMcpPost(
  ctx: ActionCtx,
  request: Request
): Promise<Response> {
  const now = Date.now();

  const identity = await authenticate(ctx, request, now);
  if (!identity) {
    return unauthorized(TOKEN_REQUIRED);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(fail(null, ERROR_PARSE, "Request body is not valid JSON"), 400);
  }

  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as JsonRpcMessage[];
  if (messages.length === 0) {
    return json(fail(null, ERROR_INVALID_REQUEST, "Empty batch"), 400);
  }

  const responses: object[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      responses.push(fail(null, ERROR_INVALID_REQUEST, "Malformed message"));
      continue;
    }
    try {
      const response = await handleMessage(ctx, identity, message, now);
      if (response) responses.push(response);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Internal server error";
      responses.push(fail((message.id ?? null) as JsonRpcId, ERROR_INTERNAL, detail));
    }
  }

  // Notifications only — nothing to send back.
  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  return json(batch ? responses : responses[0]);
}
