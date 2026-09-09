/**
 * The origin the outside world uses to reach this MCP server.
 *
 * That is The Mantra's own app domain — never the Convex deployment URL.
 * Requests arrive proxied through the Next.js app, so every URL published in
 * OAuth metadata and auth challenges has to point back at the app domain, or
 * clients would follow us onto `.convex.site` and the deployment URL would
 * leak back into people's configuration.
 *
 * `SITE_URL` is the same variable the app already uses to build emailed links.
 */
export function publicOrigin(): string | null {
  const url = process.env.SITE_URL;
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

export function requirePublicOrigin(): string {
  const origin = publicOrigin();
  if (!origin) {
    throw new Error(
      "SITE_URL is not set on this Convex deployment. Set it to the app's public URL " +
        "(for example https://app.themantra.co) with: npx convex env set SITE_URL <url>"
    );
  }
  return origin;
}

/**
 * Roles allowed to connect an MCP client at all.
 *
 * Agents and sales staff have no use for MCP yet, so it is admin-only for now:
 * their settings page hides the section, the consent screen turns them away,
 * no token can be minted for them, and any token already issued stops
 * resolving. Opening it back up is a matter of adding roles to this list.
 */
const MCP_ROLES = ["admin"];

export function mcpAllowedForRole(role: string | undefined | null): boolean {
  return typeof role === "string" && MCP_ROLES.includes(role);
}
