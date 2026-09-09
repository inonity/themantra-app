import { preflight, proxyToConvex } from "@/lib/mcp-proxy";

// Reached via the /.well-known/oauth-protected-resource rewrites in next.config.ts.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyToConvex(request, "/.well-known/oauth-protected-resource");
}

export async function OPTIONS() {
  return preflight();
}
