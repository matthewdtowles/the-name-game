#!/usr/bin/env bash
# Games and players per day, from the game server's aggregate counters:
#   ./usage.sh [Prod|Staging] [days]
# Uses the the-name-game profile, which may read these counters and nothing
# else in the table.
set -euo pipefail

stage=${1:-Prod}
days=${2:-14}
export AWS_PROFILE="${AWS_PROFILE:-the-name-game}" AWS_PAGER=""
[ "$days" -ge 1 ] && [ "$days" -le 100 ] || { echo "days must be 1-100" >&2; exit 64; }

table=$(aws cloudformation describe-stacks --stack-name "TheNameGame${stage}Backend" \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text)

keys=$(for i in $(seq $((days - 1)) -1 0); do
  printf '{"pk":{"S":"STATS#%s"}}\n' "$(date -u -d "-$i day" +%F)"
done | jq -s .)

aws dynamodb batch-get-item --output json \
  --request-items "$(jq -n --arg t "$table" --argjson k "$keys" '{($t): {Keys: $k}}')" |
  jq -r --arg t "$table" --argjson k "$keys" '
    (.Responses[$t] | map({key: .pk.S, value: .}) | from_entries) as $found
    | ["day", "created", "started", "finished", "players"],
      ($k[] | .pk.S as $pk | $found[$pk] as $row
        | [($pk | ltrimstr("STATS#"))]
          + ([ "gamesCreated", "gamesStarted", "gamesFinished", "players" ]
             | map($row[.].N // "0")))
    | @tsv' | column -t
