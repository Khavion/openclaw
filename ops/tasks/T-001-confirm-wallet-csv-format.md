---
id: T-001
owner: founder
state: NEW
gate: none
due: none
---
Confirm the real GHL billing/wallet export CSV format against the sandbox
(Agency Settings -> Billing). The parser assumes columns
`location_id,date,type,description,amount,currency` (see product/fixtures/README.md).
Acceptance: a real export parses with zero row errors, or the parser and
fixtures are updated to the real column set in the same commit.
