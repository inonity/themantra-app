import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // OAuth discovery documents have to live at these exact well-known paths.
    // App Router will not create a route segment from a dot-prefixed folder,
    // so they are rewritten onto ordinary routes that proxy to Convex.
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/mcp/well-known/protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/mcp",
        destination: "/api/mcp/well-known/protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/mcp/well-known/authorization-server",
      },
      {
        source: "/.well-known/oauth-authorization-server/mcp",
        destination: "/api/mcp/well-known/authorization-server",
      },
    ];
  },
};

export default nextConfig;
