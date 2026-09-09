import { preflight, proxyToConvex } from "@/lib/mcp-proxy";

// The MCP endpoint clients connect to: https://<app-domain>/mcp
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyToConvex(request, "/mcp");
}

export async function GET(request: Request) {
  return proxyToConvex(request, "/mcp");
}

export async function DELETE(request: Request) {
  return proxyToConvex(request, "/mcp");
}

export async function OPTIONS() {
  return preflight();
}
