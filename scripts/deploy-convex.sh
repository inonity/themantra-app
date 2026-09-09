#!/usr/bin/env bash
#
# Deploy the Convex backend to production and record which commit's convex/
# source went out, so scripts/deploy-local.sh can tell whether the frontend is
# about to get ahead of its backend.
#
# The marker is local state (gitignored): it records what THIS machine last
# pushed. Deploying from elsewhere leaves it stale, which shows up as a false
# warning -- re-running this is idempotent and clears it.

set -euo pipefail

cd "$(dirname "$0")/.."

MARKER=".convex-deployed"

printf '\033[1m==> Deploying Convex backend to production\033[0m\n'
npx convex deploy "$@"

convex_head=$(git log -1 --format=%H -- convex/ 2>/dev/null || true)
if [ -z "$convex_head" ]; then
  printf '\nNo commits touch convex/ yet; nothing to record.\n'
  exit 0
fi

printf '%s\n' "$convex_head" > "$MARKER"
printf '\nRecorded backend deploy at %s  %s\n' \
  "$(git log -1 --format=%h "$convex_head")" "$(git log -1 --format=%s "$convex_head")"
