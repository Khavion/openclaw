# Stage 0 GHL API Verification Report

Status: **pre-run**. The live endpoint table is appended by `npm run verify:ghl`
(scripts/verify-ghl-api.ts). The scope-architecture section below was verified
against official documentation on 2026-07-02, before any live run, after the
founder observed that Sub-Account scopes are not selectable on an Agency-target app.

## Scope architecture (verified 2026-07-02, doc-cited)

**Finding: the app must NOT use Target User "Agency". The correct
configuration is Target User "Sub-account" with installation restricted to
"Only Agency Can Install".**

How the two-token model actually works:

1. Marketplace scopes are typed by Access Type (Sub-Account, Agency, or both)
   in the official scopes table
   (https://github.com/GoHighLevel/highlevel-api-docs/blob/main/docs/oauth/Scopes.md).
   The billing reads SubAudit needs — `invoices.readonly`,
   `payments/subscriptions.readonly`, `payments/transactions.readonly` — are
   Access Type **Sub-Account**, which is why an Agency-target app cannot
   select them. `saas/location.read` is Access Type "Sub-Account, Agency".
2. Per HighLevel's own token-handling guide for Sub-Account-target apps
   (https://marketplace.gohighlevel.com/docs/Authorization/TargetUserSubAccount/index.html):
   when the app is set to agency-only installs, "The Access Token generated
   here will be of type Company (Agency-level)." So a Sub-account-target app
   installed by the agency admin still receives the **agency (Company)
   token** SubAudit needs for the SaaS endpoints.
3. That agency token mints per-location tokens via `POST /oauth/locationToken`
   ("Get Location Access Token from Agency Token", requires app scope
   `oauth.write`, Access Type Agency — Scopes.md + apps/oauth.json). The
   HighLevel distribution-type article
   (https://help.gohighlevel.com/support/solutions/articles/155000002141-marketplace-app-distribution-type)
   describes exactly this pattern for reaching sub-account data: obtain the
   agency token, list locations, "Get Location Token using Agency Token".
4. Location-scoped endpoints declare security `Location-Access` — "the Access
   Token generated with user type as Sub-Account" (securitySchemes in
   apps/payments.json / apps/invoices.json). The minted location token is that
   token; the sub-account reads are authorized by it, carrying the Sub-Account
   scopes selected on the app. The app never needs those scopes "granted at
   agency level".

**Implication for RealGhlClient: no code change.** It already implements this
exact flow: Company token for `/saas-api/public-api/*`, `POST
/oauth/locationToken` per location, location token for `/invoices/` and
`/payments/transactions`.

**Action for app creation (updates README-OPERATIONS.md §4):**
- Target User / distribution: **Sub-account — Only Agency Can Install**
- Select Sub-Account scopes: `invoices.readonly`,
  `payments/subscriptions.readonly`, `payments/transactions.readonly`
  (+ `products/prices.readonly` only if a rule ever needs catalog prices)
- Select agency/dual scopes: `oauth.readonly`, `oauth.write`, and every SaaS
  read scope the UI offers (`saas/location.read`; record exact names — T-002)
- If the portal hides the SaaS read scopes for Sub-account-target apps
  (contradicting their dual Access Type in Scopes.md), stop and record it
  here; the documented fallback is two Private apps — one Agency-target for
  SaaS reads, one Sub-account-target for billing reads — but do not build
  that until the single-app path is disproven by the verify run.

## R1–R6 data-access assumption, re-verified against the scope model

| Rule | Data needed | Token that reads it | Scope (Access Type) |
|---|---|---|---|
| R1 | Stripe invoices (customer key) + GHL location/subscription linkage | agency token | `saas/location.read` (Sub-Account, Agency) |
| R2 | GHL subscription status per location | agency token | SaaS read scopes |
| R3 | plan prices + per-location price | agency token | SaaS read scopes |
| R4 | trial end per location | agency token | SaaS read scopes |
| R1 corroboration | GHL location invoices | **location token** | `invoices.readonly` (Sub-Account) |
| R6 corroboration | GHL location transactions | **location token** | `payments/transactions.readonly` (Sub-Account) |
| R5 | wallet history | none — no public endpoint (specs checked 2026-07-02) | CSV import, per design doc v1 |

## Live endpoint results

*(pending — run `npm run verify:ghl` after the app is created with the
configuration above; the script appends its PASS/FAIL table here)*
