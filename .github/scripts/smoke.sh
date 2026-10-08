#!/usr/bin/env bash
# Plays a game against a just-deployed stack: smoke.sh <cdk outputs file> <stack>.
# Retries because a brand-new API and its IAM grants can take a minute to
# propagate (the first staging deploy answered 403 for about that long).
set -euo pipefail

url=$(jq -r --arg stack "$2" '.[$stack].WebSocketUrl' "$1")
for attempt in 1 2 3 4; do
  if npm run smoke -w @tng/server -- "$url"; then exit 0; fi
  echo "Smoke test attempt $attempt failed; retrying in 20s"
  sleep 20
done
exit 1
