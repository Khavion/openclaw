---
id: T-007
owner: claude-code
state: NEW
gate: none
due: none
---
LocationSubscription fields specialPrice, trialEndsAt, locationActive,
paused, pausedAt are fixture-backed assumptions beyond the published
LocationSubscriptionResponseDto (see product/src/adapters/ghl/schemas.ts).
The verify script probes the live field names in Stage 0. Update schema +
normalizer + fixtures to the real names in one commit.
Acceptance: verify report section "R2/R4/R6 field availability" all PASS.
