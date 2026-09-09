#!/usr/bin/env bash
#
# Build the production image here and hand it to Coolify ready-made.
#
# Coolify normally builds on the deployment server, which takes ~9 minutes from
# cold. It skips the build entirely when an image tagged <app-uuid>:<commit-sha>
# already exists on that server:
#
#   "No build configuration changed & image found (<uuid>:<sha>) with the same
#    Git Commit SHA. Build step skipped."
#
# So this builds exactly that tag locally (~60s on Apple Silicon, even though it
# cross-compiles to x86_64), copies it over (~13s), and triggers a deploy that is
# then only a rolling restart (~26s).
#
# Nothing here reconfigures Coolify. If this script is never run, a plain
# `git push` still deploys the normal way, building on the server.

set -euo pipefail

APP_UUID="uavm2engc1l3tk1t63swzhnd"
SERVER="root@217.15.165.167"
BRANCH="main"
PLATFORM="linux/amd64"        # the Coolify server is x86_64; this Mac is arm64
ENV_FILE=".env.production.local"

cd "$(dirname "$0")/.."

die() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# --- guards ---------------------------------------------------------------
# The image is tagged with a commit SHA, and Coolify only matches it against the
# commit it checks out from origin/main. If the local tree is ahead, dirty, or on
# another branch, the tag would not match and the server would rebuild anyway --
# silently, and from different code than was tested here.

current_branch=$(git rev-parse --abbrev-ref HEAD)
[ "$current_branch" = "$BRANCH" ] || die "on branch '$current_branch', expected '$BRANCH'"

[ -z "$(git status --porcelain)" ] || die "working tree is dirty; commit or stash first"

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found -- it holds the production Convex URL"

git fetch origin "$BRANCH" --quiet
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")

# Order matters. The image is tagged with the commit SHA, which exists locally
# before the commit is pushed -- so seed the server FIRST, then push. Auto Deploy
# then fires on the push, finds the image already there and skips the build.
# Pushing first would start a ~9 minute server build that this cannot overtake.
already_pushed=false
if [ "$local_sha" = "$remote_sha" ]; then
  already_pushed=true
fi

# --- build args -----------------------------------------------------------
# Next inlines NEXT_PUBLIC_* at build time, so these must come from the
# PRODUCTION env file. .env.local points at the dev Convex deployment; baking
# that in would silently point production at the wrong backend.
set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

[ -n "${NEXT_PUBLIC_CONVEX_URL:-}" ] || die "NEXT_PUBLIC_CONVEX_URL missing from $ENV_FILE"

image="$APP_UUID:$local_sha"

step "Building $PLATFORM image"
echo "  backend: $NEXT_PUBLIC_CONVEX_URL"
echo "  tag:     $image"
docker buildx build \
  --platform "$PLATFORM" \
  --build-arg "NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL" \
  --build-arg "NEXT_PUBLIC_CONVEX_SITE_URL=${NEXT_PUBLIC_CONVEX_SITE_URL:-}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-}" \
  --tag "$image" \
  --load \
  .

step "Copying image to the deployment server"
if ssh -o BatchMode=yes "$SERVER" "docker image inspect '$image' >/dev/null 2>&1"; then
  echo "  already present, skipping transfer"
else
  docker save "$image" | ssh -C -o BatchMode=yes "$SERVER" 'docker load'
fi

# --- publish --------------------------------------------------------------
if [ "$already_pushed" = false ]; then
  step "Pushing $BRANCH (Auto Deploy picks it up from here)"
  git push origin "$BRANCH"
  printf '\nDone. Coolify will deploy %s and skip the build.\n' "$(git rev-parse --short HEAD)"
  exit 0
fi

# HEAD was already on origin before this ran, so no push will fire Auto Deploy
# and a server-side build may already have started. Trigger a fresh deploy so the
# seeded image gets used. Optional: COOLIFY_URL / COOLIFY_TOKEN in
# .env.deploy.local (gitignored) make this automatic.
if [ -f .env.deploy.local ]; then
  set -a; . ./.env.deploy.local; set +a
fi

if [ -n "${COOLIFY_URL:-}" ] && [ -n "${COOLIFY_TOKEN:-}" ]; then
  step "HEAD already pushed -- triggering deploy directly"
  curl --fail --silent --show-error \
    -X GET "${COOLIFY_URL%/}/api/v1/deploy?uuid=$APP_UUID" \
    -H "Authorization: Bearer $COOLIFY_TOKEN"
  printf '\n\nDone. Coolify will find the image and skip the build.\n'
else
  step "Image seeded (HEAD was already pushed)"
  cat <<'MSG'
  Nothing left to push, so Auto Deploy will not fire on its own.
  Hit Deploy in the Coolify UI -- it will find this image and skip the build.

  To automate this case, put COOLIFY_URL and COOLIFY_TOKEN in .env.deploy.local
MSG
fi
