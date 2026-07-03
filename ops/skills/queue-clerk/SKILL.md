---
name: queue-clerk
description: Keep ops/tasks/*.md and the #queue mirror in sync; log approvals; commit ops state nightly.
---

# queue-clerk

Input: task-state events (new task, state change, approval decision) or the
01:00 nightly cron.
Output: updated task files, `ops/approvals.log` entries, #queue mirror
messages, and (nightly) one git commit.

Task file format `ops/tasks/T-<nnn>-<slug>.md`:
```
---
id: T-<nnn>
owner: VA | agent | founder | claude-code
state: NEW | DOING | BLOCKED | REVIEW | DONE
gate: G1..G7 | none
due: YYYY-MM-DD | none
---
<one-paragraph description; links; acceptance criteria>
```

On any task event:
1. Edit the file's frontmatter (validate with
   `node ops/skills/queue-clerk/tasks-lint.mjs` before finishing).
2. Mirror to #queue: `T-0xx → <STATE> (<owner>) <title>`.

On an approval decision in #approvals (author must be U0BEPUK1BH9):
1. Append to `ops/approvals.log`:
   `<ISO date> | T-0xx | G<n> | approve|reject | <quoted reason if any>`
2. Update the task state (approve → DOING for the executor; reject → BLOCKED
   with the reason in the body).

Nightly (01:00 cron):
1. Run the lint script; fix or report problems.
2. `git add ops/ && git commit -m "ops: nightly log/task sync <date>"` and push.
   Commit only `ops/` paths. Never commit `.env` or `product/` changes.
3. Then process any community-digest backlog (see that skill).
