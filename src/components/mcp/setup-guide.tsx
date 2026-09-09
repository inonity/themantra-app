"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlugIcon } from "lucide-react";
import { CopyBlock, CopyField } from "./copy-field";

const TOKEN_PLACEHOLDER = "PASTE_YOUR_TOKEN_HERE";

export function SetupGuide({ endpoint }: { endpoint: string }) {
  const [tab, setTab] = useState("claude-code");

  const claudeCode = `claude mcp add --transport http the-mantra ${endpoint} \\
  --header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`;

  const claudeDesktop = `{
  "mcpServers": {
    "the-mantra": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${endpoint}",
        "--header",
        "Authorization: Bearer ${TOKEN_PLACEHOLDER}"
      ]
    }
  }
}`;

  const codex = `[mcp_servers.the_mantra]
command = "npx"
args = [
  "-y",
  "mcp-remote",
  "${endpoint}",
  "--header",
  "Authorization: Bearer ${TOKEN_PLACEHOLDER}",
]`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlugIcon className="size-4" />
          Connect a client
        </CardTitle>
        <CardDescription>
          Every client needs the same two things: this URL, and a token from
          below. Replace{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {TOKEN_PLACEHOLDER}
          </code>{" "}
          with the token you created.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">Server URL</p>
          <CopyField value={endpoint} label="server URL" />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <TabsList>
            <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
            <TabsTrigger value="claude-desktop">Claude Desktop</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
            <TabsTrigger value="claude-ai">claude.ai</TabsTrigger>
          </TabsList>

          <TabsContent value="claude-code" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Run this in your terminal. Add <code>--scope user</code> to make it
              available in every project rather than just the current one.
            </p>
            <CopyBlock value={claudeCode} label="Claude Code command" />
            <p className="text-sm text-muted-foreground">
              Check it worked with <code>claude mcp list</code>.
            </p>
          </TabsContent>

          <TabsContent value="claude-desktop" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Open Settings → Developer → Edit Config, paste this into
              <code className="mx-1">claude_desktop_config.json</code>, then
              restart Claude Desktop. It needs Node.js installed.
            </p>
            <CopyBlock value={claudeDesktop} label="Claude Desktop config" />
          </TabsContent>

          <TabsContent value="codex" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Add this to <code>~/.codex/config.toml</code>. This uses the
              <code className="mx-1">mcp-remote</code> bridge, which works on
              every Codex version; recent versions can also talk to HTTP servers
              directly, so check the Codex docs if you would rather configure a
              <code className="mx-1">url</code> and auth header natively.
            </p>
            <CopyBlock value={codex} label="Codex config" />
          </TabsContent>

          <TabsContent value="claude-ai" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              On claude.ai there is no token to paste — you sign in instead.
            </p>
            <ol className="ml-4 list-decimal space-y-1.5 text-sm text-muted-foreground">
              <li>Go to Settings → Connectors → Add custom connector.</li>
              <li>Paste the server URL above and confirm.</li>
              <li>
                Claude sends you back here to sign in and approve the
                connection.
              </li>
              <li>
                Approving creates a token automatically. It shows up in the
                table below marked <em>connector</em>, and you can revoke it
                there like any other.
              </li>
            </ol>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
