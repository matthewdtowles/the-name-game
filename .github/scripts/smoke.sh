#!/usr/bin/env bash
# Plays a game against a just-deployed stack: smoke.sh <cdk outputs file> <stack>.
# Retries because a brand-new API and its IAM grants take minutes to propagate:
# the first prod deploy answered 403 for longer than 80 seconds. Once a stack
# exists, the first attempt passes.
set -euo pipefail

url=$(jq -r --arg stack "$2" '.[$stack].WebSocketUrl' "$1")
for attempt in 1 2 3 4 5 6 7 8; do
  if npm run smoke -w @tng/server -- "$url"; then exit 0; fi
  echo "Smoke test attempt $attempt failed; retrying in 30s"
  sleep 30
done
exit 1
