# Heartbeat — every 30 min, 07:00–22:00 America/Chicago

Three sweeps. Do them in order, act on each item, stay quiet if all clear.

1. **#support** — new inbound mail since last sweep?
   → run `support-drafter` on each new thread. Draft in-thread, never send.
2. **#ops-alerts** — new alarms?
   → run `ops-triage`. Sev-1: DM Zohaib now + triage note. Else: note for rundown.
3. **#approvals** — new replies from `U0BEPUK1BH9`?
   → run `queue-clerk`: log decision to ops/approvals.log, update the task
   file state, notify the VA in the task's #queue thread if she executes.

Nothing new in any sweep → end the turn with no output.
