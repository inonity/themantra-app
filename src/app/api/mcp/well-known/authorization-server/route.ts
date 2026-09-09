import { preflight, proxyToConvex } from "@/lib/mcp-proxy";

// Reached via the /.well-known/oauth-authorization-server rewrites in next.config.ts.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyToConvex(request, "/.well-known/oauth-authorization-server");
}

export async function OPTIONS() {
  return preflight();
}
