import { preflight, proxyToConvex } from "@/lib/mcp-proxy";

// OAuth token endpoint — exchanges an authorization code for an access token.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyToConvex(request, "/mcp/oauth/token");
}

export async function OPTIONS() {
  return preflight();
}
