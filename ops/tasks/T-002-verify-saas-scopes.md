---
id: T-002
owner: founder
state: NEW
gate: none
due: none
---
App target user is "Sub-account (Only Agency Can Install)" per the
scope-architecture finding in docs/STAGE0-API-REPORT.md (founder confirmed
Sub-Account billing scopes are hidden on Agency-target apps). Remaining
unknowns: the exact SaaS read-scope labels offered on a Sub-account-target
app (Scopes.md types saas/location.read as "Sub-Account, Agency" so it
should appear), and whether the agency-install Company token passes the
public-api SaaS endpoints' Agency-Access check. Record the scope names seen
in the UI, run `npm run verify:ghl`, check the appended results table.
Acceptance: every R1-R4 data need scores PASS in the report. If no SaaS
read scope is selectable, escalate — fallback (two Private apps) is
documented in the report but needs founder sign-off before building.
