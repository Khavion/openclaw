#!/usr/bin/env bash
# Khavion ops-plane installer.
#
# Default run is a DRY RUN: it prints everything it would do and touches
# nothing. Re-run with --apply to actually create symlinks and the launchd
# ping. It never deletes anything.
#
#   bash ops/install/install.sh          # show the plan
#   bash ops/install/install.sh --apply  # do it
#
# What it manages:
#   1. Symlinks each ops/skills/<name> into ~/.openclaw/workspace/skills/
#   2. Prints the four `openclaw cron add` commands from the design schedule
#      (you run them yourself after filling in the Slack channel IDs)
#   3. Installs a launchd job that pings healthchecks.io hourly, reading
#      HEALTHCHECKS_PING_URL from product/.env AT INSTALL TIME. The URL is
#      written only into ~/Library/LaunchAgents (outside the repo), never
#      into any committed file. If the variable is unset, this step is
#      skipped gracefully.
set -euo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILLS_SRC="$REPO_ROOT/ops/skills"
SKILLS_DST="$HOME/.openclaw/workspace/skills"
PLIST="$HOME/Library/LaunchAgents/com.khavion.healthping.plist"
ENV_FILE="$REPO_ROOT/product/.env"

say() { printf '%s\n' "$*"; }
plan() { if [ "$APPLY" = 1 ]; then say "DOING: $*"; else say "WOULD: $*"; fi; }

say "=== Khavion ops-plane install ($([ "$APPLY" = 1 ] && echo APPLY || echo DRY RUN)) ==="
say ""

# --- 1. skill symlinks ---
say "-- Skills -> $SKILLS_DST"
plan "mkdir -p $SKILLS_DST"
[ "$APPLY" = 1 ] && mkdir -p "$SKILLS_DST"
for dir in "$SKILLS_SRC"/*/; do
  name="$(basename "$dir")"
  target="$SKILLS_DST/$name"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    say "SKIP: $target exists and is not a symlink (not touching it)"
    continue
  fi
  plan "ln -sfn $dir -> $target"
  [ "$APPLY" = 1 ] && ln -sfn "${dir%/}" "$target"
done
say ""

# --- 2. cron commands (printed, not executed: channel IDs are placeholders) ---
say "-- Run these after 'openclaw channels add slack' (replace C0XXXXXXX with real channel IDs):"
cat <<'CRONS'
openclaw cron add --name daily-rundown --cron "30 7 * * *" --tz America/Chicago \
  --session isolated --channel slack --to C0XXXXXXX_RUNDOWN \
  --message "Run the daily-rundown skill from ops/skills/daily-rundown/SKILL.md and post the rundown."

openclaw cron add --name nightly-ops-commit --cron "0 1 * * *" --tz America/Chicago \
  --session isolated \
  --message "Run the queue-clerk skill nightly section: lint tasks, commit ops/ to git, push."

openclaw cron add --name community-digest-backlog --cron "15 1 * * 0" --tz America/Chicago \
  --session isolated --channel slack --to C0XXXXXXX_RESEARCH \
  --message "Run the community-digest skill weekly backlog: process unprocessed #research pastes, post the weekly summary."

openclaw cron add --name competitor-watch --cron "0 2 * * 1" --tz America/Chicago \
  --session isolated --channel slack --to C0XXXXXXX_RESEARCH \
  --message "Run the competitor-watch skill from ops/skills/competitor-watch/SKILL.md and post the diff report."
CRONS
say ""

# --- 3. hourly healthchecks ping via launchd (Mac-alive signal) ---
say "-- Hourly healthchecks ping (launchd)"
PING_URL=""
if [ -f "$ENV_FILE" ]; then
  PING_URL="$(grep -E '^HEALTHCHECKS_PING_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
fi
if [ -z "$PING_URL" ]; then
  say "SKIP: HEALTHCHECKS_PING_URL not set in product/.env — no ping job (add it and re-run)."
else
  say "Found HEALTHCHECKS_PING_URL in product/.env (not printing it)."
  plan "write $PLIST (URL embedded there, outside the repo)"
  plan "launchctl bootstrap gui/\$(id -u) $PLIST"
  if [ "$APPLY" = 1 ]; then
    cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.khavion.healthping</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/curl</string>
    <string>-fsS</string>
    <string>-m</string><string>10</string>
    <string>${PING_URL}</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>/dev/null</string>
</dict>
</plist>
PLIST_EOF
    launchctl bootout "gui/$(id -u)/com.khavion.healthping" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    say "launchd ping installed and loaded."
  fi
fi
say ""
say "=== done ($([ "$APPLY" = 1 ] && echo applied || echo 'dry run — re-run with --apply')) ==="
