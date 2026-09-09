import { headers } from "next/headers";
import { SettingsClient } from "./settings-client";

/**
 * The app origin is resolved server-side so the MCP endpoint shown under
 * "MCP access" is the origin the user actually reached the app on — correct
 * behind a reverse proxy, with no client-side guess that flickers on
 * hydration. NEXT_PUBLIC_APP_URL pins it explicitly when set.
 */
async function resolveAppOrigin(): Promise<string> {
  const pinned = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (pinned) return pinned;

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");

  return host ? `${proto}://${host}` : "";
}

export default async function SettingsPage() {
  return <SettingsClient appOrigin={await resolveAppOrigin()} />;
}
