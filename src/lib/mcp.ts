/**
 * The MCP endpoint is served from The Mantra's own domain — the Next.js app
 * proxies it through to Convex. Clients only ever see this URL, so moving or
 * renaming the Convex deployment never invalidates anyone's configuration.
 */
export function mcpEndpointUrl(appOrigin: string | null | undefined): string | null {
  const trimmed = appOrigin?.replace(/\/+$/, "");
  return trimmed ? `${trimmed}/mcp` : null;
}
