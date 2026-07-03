# SubAudit Fixtures — Synthetic Agency `comp_khavion_demo`

One agency, two plans, twelve sub-accounts. Every audit rule R1–R6 has at
least one positive case and clean negatives. The end-to-end test
(`test/engine-e2e.test.ts`) asserts against the **Expected findings** table
below, so keep this file in sync with any fixture change.

Audit reference date used by tests and the demo: **2026-07-02T12:00:00Z**.

## Plans

| Plan | Price (monthly) | Trial |
|---|---|---|
| `plan_basic` "Starter" (`price_basic_m`) | $97.00 | 14 days |
| `plan_pro` "Pro" (`price_pro_m`) | $297.00 | 14 days |

## Sub-accounts and what each exercises

| Location | Name | Scenario | Rule coverage |
|---|---|---|---|
| `loc_h1` | Bright Dental | Fully healthy. Apr–Jun invoices paid at $97. Has a $20 Stripe refund (`re_h1`) **matched** by a $20 `wallet_credit` row in the CSV export. | Negative for all rules; R5 negative-with-refund edge |
| `loc_h2` | Peak Realty | Fully healthy on Pro at $297. | Negative for all rules (second plan) |
| `loc_h3` | Cafe Luna | Healthy **Special Price** case: custom price $79, Stripe charges exactly $79. | R3 negative edge (special price honored) |
| `loc_h4` | Nova Fitness | Healthy trial: `trialing` in both systems, trial ends 2026-07-20 (future), no invoices yet. | R1 negative (no invoices ≠ gap), R4 negative edge (unexpired trial) |
| `loc_r1` | Delta Plumbing | Apr paid. May payment **failed** (`ch_r1_1_fail`) then recovered May 9. **June invoice never generated** — the documented GHL skip bug. Subscription still active. | **R1 positive**: 1 skipped month × $97 |
| `loc_r2a` | Harbor Law | Stripe subscription **canceled** 2026-05-15; GHL still `active` and serving. | **R2 positive** (canceled-in-Stripe / active-in-GHL): $97/mo leak |
| `loc_r2b` | Summit Yoga | Stripe **active** and billing Apr–Jun; GHL shows `canceled`. | **R2 positive** (reverse direction): $97/mo refund exposure |
| `loc_r3` | Iron Gym | Plan says $97; Stripe subscription and charges are $87. | **R3 positive**: $10/mo drift |
| `loc_r3sp` | Vine Florist | **Special Price** $79 configured; Stripe charges $97. | **R3 positive** (special-price case): $18/mo drift vs special price |
| `loc_r4` | Echo Media | Trial ended 2026-06-01; **no Stripe subscription exists**; location still active in GHL. | **R4 positive**: $97/mo free access |
| `loc_r5` | Coast Cleaners | $50 Stripe refund (`re_r5`) on its June charge; **no matching `wallet_credit`** row in the CSV export. | **R5 positive**: $50.00 mismatch |
| `loc_r6` | Pine Consulting | GHL `paused: true` since 2026-06-10; Stripe still active and a $97 charge landed 2026-06-15. | **R6 positive**: $97.00 charged while paused |

## Expected findings (asserted by the e2e test)

| Rule | Location | Amount | Note |
|---|---|---|---|
| R1 | `loc_r1` | $97.00 | period `2026-06` |
| R2 | `loc_r2a` | $97.00 | direction: canceled_in_stripe_active_in_ghl |
| R2 | `loc_r2b` | $97.00 | direction: active_in_stripe_canceled_in_ghl |
| R3 | `loc_r3` | $10.00 | plan $97 vs charged $87 |
| R3 | `loc_r3sp` | $18.00 | special $79 vs charged $97 |
| R4 | `loc_r4` | $97.00 | trial ended 2026-06-01 |
| R5 | `loc_r5` | $50.00 | refund not credited to wallet |
| R6 | `loc_r6` | $97.00 | one post-pause charge (2026-06-15) |

Total: **8 findings, $563.00**. The four `loc_h*` accounts must produce zero.

## File map

- `ghl/saas-locations.json` — mirrors `GET /saas-api/public-api/saas-locations/{companyId}` (GetSaasLocationsResponseDto)
- `ghl/agency-plans.json` — mirrors `GET /saas-api/public-api/agency-plans/{companyId}` (AgencyPlanResponseDto[])
- `ghl/location-subscriptions.json` — map locationId → LocationSubscriptionResponseDto (plus fixture-backed extended fields `specialPrice`, `trialEndsAt`, `locationActive`, `paused`, `pausedAt`; Stage 0 verify script confirms live names)
- `ghl/invoices.json` — mirrors `GET /invoices/` (ListInvoicesResponseDto), all locations in one file, mock filters by `altId`
- `ghl/transactions.json` — mirrors `GET /payments/transactions` (ListTxnsResponseDto)
- `stripe/*.json` — arrays of raw Stripe objects (subscription, invoice, charge, refund, customer) per https://docs.stripe.com/api shapes
- `csv/ghl-billing-export.csv` — assumed GHL billing-export columns `location_id,date,type,description,amount,currency` with `type` ∈ `wallet_charge|wallet_credit`. The real export format gets confirmed against a live sandbox in Stage 0 (see docs/DEVIATIONS.md).
