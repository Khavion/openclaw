#!/usr/bin/env bash
# Fetch GHL marketplace category pages, store dated snapshots, print diffs
# vs the previous snapshot. Public pages only, polite pacing. No deps beyond
# curl and diff.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$REPO_ROOT/ops/research/competitor-snapshots"
mkdir -p "$OUT"
STAMP="$(date +%Y-%m-%d)"
UA="KhavionResearch/1.0 (market research; contact: support@khavion.com)"

# category slug -> URL (public marketplace category listings)
CATEGORIES=(
  "billing-payments|https://marketplace.gohighlevel.com/category/billing-payments"
  "analytics|https://marketplace.gohighlevel.com/category/analytics"
)

for entry in "${CATEGORIES[@]}"; do
  slug="${entry%%|*}"
  url="${entry##*|}"
  new="$OUT/${slug}-${STAMP}.txt"
  echo "fetching $slug ..."
  # strip tags crudely; the agent reads the text, not the markup
  curl -fsSL -A "$UA" "$url" | sed -e 's/<[^>]*>/ /g' -e 's/&amp;/\&/g' \
    | tr -s ' \t' ' ' | grep -v '^ *$' > "$new" || {
      echo "FETCH FAILED: $slug ($url)"; continue;
    }
  prev="$(ls "$OUT/${slug}"-*.txt 2>/dev/null | grep -v "$STAMP" | sort | tail -1 || true)"
  if [ -n "$prev" ]; then
    echo "--- diff for $slug (prev: $(basename "$prev")) ---"
    diff "$prev" "$new" || true
  else
    echo "--- first snapshot for $slug, no diff ---"
  fi
  sleep 2
done
echo "snapshots in $OUT"
