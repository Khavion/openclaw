---
name: daily-rundown
description: Compile the 07:30 daily rundown for #rundown from tasks, alerts, findings, and VA blockers.
---

# daily-rundown

Input: none (cron 07:30 America/Chicago).
Output: one message to #rundown, exactly this shape:

```
RUNDOWN <YYYY-MM-DD>
Queue: <n> open (<n> NEW / <n> DOING / <n> BLOCKED / <n> REVIEW) — top 3: T-0xx <title>, ...
Alerts (24h): <count by severity, or "quiet">
Product: <nightly audit ran/missed; findings count if the digest posted>
VA: <blockers pulled from #queue BLOCKED tasks, or "no blockers">
Waiting on founder: <list of #approvals threads older than 24h, or "nothing">
```

Steps:
1. Read `ops/tasks/*.md` frontmatter; count states; pick top 3 by due date.
2. Scan #ops-alerts since yesterday 07:30 for triage notes.
3. Check whether the nightly audit healthchecks ping fired (the #ops-alerts
   silence means yes; an alarm means no).
4. List #approvals threads still unanswered after 24h.
5. Post. Keep it under 15 lines. No commentary, no advice, facts only.
