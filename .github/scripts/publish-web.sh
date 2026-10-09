#!/usr/bin/env bash
# Builds the web app for one stage and publishes it to that stage's bucket:
#   publish-web.sh <cdk outputs file> <Staging|Prod>
# The game server and invite URLs are baked into the build from the outputs.
set -euo pipefail

outputs=$1
web="TheNameGame$2Web"
backend="TheNameGame$2Backend"
output() { jq -re --arg stack "$1" --arg key "$2" '.[$stack][$key]' "$outputs"; }

# Read every output up front: a failed lookup inside `VAR=$(...) cmd` would be
# ignored and bake an empty URL into the build.
bucket=$(output "$web" BucketName)
distribution=$(output "$web" DistributionId)
export EXPO_PUBLIC_GAME_SERVER_URL EXPO_PUBLIC_WEB_URL
EXPO_PUBLIC_GAME_SERVER_URL=$(output "$backend" WebSocketUrl)
EXPO_PUBLIC_WEB_URL=$(output "$web" Url)
(cd app && npx expo export --platform web --output-dir dist --clear)
grep -qF "$EXPO_PUBLIC_GAME_SERVER_URL" app/dist/_expo/static/js/web/entry-*.js ||
  { echo "Build doesn't contain $EXPO_PUBLIC_GAME_SERVER_URL" >&2; exit 1; }

# Bundles and assets have content hashes in their names, so they can be cached
# for good; everything else is revalidated so a release shows up at once.
aws s3 sync app/dist "s3://$bucket" --delete --only-show-errors --exclude "*" \
  --include "_expo/*" --include "assets/*" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 sync app/dist "s3://$bucket" --delete --only-show-errors \
  --exclude "_expo/*" --exclude "assets/*" \
  --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$distribution" --paths "/*" >/dev/null
echo "Published $(output "$web" Url)"
