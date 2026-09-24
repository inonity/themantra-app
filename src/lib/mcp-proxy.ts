/**
 * Proxies MCP traffic from The Mantra's own domain to the Convex deployment
 * that implements it.
 *
 * The point is that nobody outside ever sees a `.convex.site` URL: the team
 * pastes `https://app.themantra.co/mcp` into Claude, and the deployment behind
 * it can be swapped without anyone reconfiguring a client.
 */

const FORWARD_REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "mcp-protocol-version",
  "mcp-session-id",
  "last-event-id",
];

const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "www-authenticate",
  "mcp-session-id",
];

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};

/** Convex serves HTTP actions from `.convex.site`, not the `.convex.cloud` client URL. */
export function convexSiteOrigin(): string | null {
  const explicit = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;

  const cloud = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\/+$/, "");
  if (!cloud) return null;

  const suffix = ".convex.cloud";
  return cloud.endsWith(suffix)
    ? `${cloud.slice(0, -suffix.length)}.convex.site`
    : cloud;
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function proxyToConvex(
  request: Request,
  upstreamPath: string
): Promise<Response> {
  const origin = convexSiteOrigin();
  if (!origin) {
    return Response.json(
      {
        error: "server_misconfigured",
        error_description:
          "Neither NEXT_PUBLIC_CONVEX_SITE_URL nor NEXT_PUBLIC_CONVEX_URL is set, so the MCP backend cannot be located.",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Next answers HEAD with the GET handler. Convex has no HEAD routes, and
  // fetch rejects a HEAD with a body, so ask upstream with GET and drop the body.
  const isHead = request.method === "HEAD";
  const method = isHead ? "GET" : request.method;
  const hasBody = method !== "GET" && method !== "DELETE";

  let upstream: Response;
  try {
    upstream = await fetch(`${origin}${upstreamPath}`, {
      method,
      headers,
      body: hasBody ? await request.text() : undefined,
      // Never let a CDN or the fetch cache sit between a client and its data.
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return Response.json(
      {
        error: "backend_unreachable",
        error_description: "Could not reach the MCP backend. Try again shortly.",
      },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  const responseHeaders = new Headers(CORS_HEADERS);
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  const body = isHead ? "" : await upstream.text();
  return new Response(body || null, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
