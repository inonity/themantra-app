/**
 * The MCP endpoint is served from The Mantra's own domain — the Next.js app
 * proxies it through to Convex. Clients only ever see this URL, so moving or
 * renaming the Convex deployment never invalidates anyone's configuration.
 */
export function mcpEndpointUrl(appOrigin: string | null | undefined): string | null {
  const trimmed = appOrigin?.replace(/\/+$/, "");
  return trimmed ? `${trimmed}/mcp` : null;
}

/**
 * Roles allowed to connect an MCP client. Mirrors `mcpAllowedForRole` in
 * `convex/mcp/config.ts` — that copy is the one that actually enforces it;
 * this one only decides what the UI bothers to show.
 */
export function mcpAllowedForRole(role: string | undefined | null): boolean {
  return role === "admin";
}
