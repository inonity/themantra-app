import { preflight, proxyToConvex } from "@/lib/mcp-proxy";

// RFC 7591 dynamic client registration.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyToConvex(request, "/mcp/oauth/register");
}

export async function OPTIONS() {
  return preflight();
}
