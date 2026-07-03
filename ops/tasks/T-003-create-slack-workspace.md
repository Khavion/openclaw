---
id: T-003
owner: founder
state: NEW
gate: G5
due: none
---
Create the free Slack workspace "Khavion HQ" with channels #rundown,
#approvals, #queue, #support, #ops-alerts, #research. Invite the VA. Connect
OpenClaw via `openclaw channels add` (Slack). Capture each channel ID
(right-click channel -> Copy link; the ID is the last path segment) and
substitute them into the cron commands printed by ops/install/install.sh.
Acceptance: Khavion Ops posts a test message in #rundown.
