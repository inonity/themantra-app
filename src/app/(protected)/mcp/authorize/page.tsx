import { AuthorizeConsent } from "./consent";

/**
 * OAuth consent screen for MCP connectors (claude.ai).
 *
 * The authorization server metadata published by the Convex deployment points
 * here. Sitting inside the (protected) route group means AuthGuard sends an
 * unauthenticated visitor to /login and back again with the query intact.
 */
export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <AuthorizeConsent
        params={{
          clientId: one("client_id"),
          redirectUri: one("redirect_uri"),
          responseType: one("response_type"),
          codeChallenge: one("code_challenge"),
          codeChallengeMethod: one("code_challenge_method"),
          state: one("state"),
        }}
      />
    </div>
  );
}
