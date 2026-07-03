---
id: T-002
owner: founder
state: NEW
gate: none
due: none
---
The scopes doc (docs/oauth/Scopes.md) names saas/location.read and
saas/company.write but the public-api SaaS read endpoints' exact scope
labels are unconfirmed. When creating the marketplace app, record the exact
scope names the UI offers for SaaS + payments + invoices + oauth, then run
`npm run verify:ghl` (scripts/verify-ghl-api.ts) and check docs/STAGE0-API-REPORT.md.
Acceptance: every R1-R4 data need scores PASS in the report.
