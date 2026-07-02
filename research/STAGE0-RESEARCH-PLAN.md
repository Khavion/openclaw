# Stage 0 Research Plan: GoHighLevel Financial and Revenue-Ops Utilities

Owner: VA (lead) plus local agents. Founder reviews output only.
Timebox: 10 working days. No code, no purchases, no outbound contact of any kind.
Deliverable: `research/gap-matrix.csv` plus a one-page summary of the top 3 wedge candidates.

## Why GoHighLevel first (context for the VA)

Every GHL customer is a paying business (agency plans run $97 to $497/month), so the buyer pool is pre-qualified. The app marketplace is young (roughly 1,500 apps versus tens of thousands on Shopify) and HighLevel charges developers 0% commission on app revenue through December 31, 2026, with native support for recurring and per-sub-account pricing. Documented, long-lived complaints about SaaS-mode rebilling, reconciliation, and tax invoicing sit directly on the founder's data-engineering strengths. Sources to re-verify during this research (marked V1 to V3 in the matrix):

- V1 Marketplace size and commission terms: https://gohighlevelgrowthstack.com/guides/gohighlevel-marketplace-2026 and https://help.gohighlevel.com/support/solutions/articles/155000001217-set-up-your-marketplacapp-pricing
- V2 SaaS-mode billing bugs and gaps: https://highlevel.canny.io/saas?category=bug
- V3 Rebilling and wallet mechanics: https://help.gohighlevel.com/support/solutions/articles/155000002095-rebilling-reselling-and-wallets-explained

## Scope

In scope: anything in GHL's ecosystem touching money flows and reporting. Rebilling and SaaS-mode reconciliation, failed-payment and dunning handling, agency profitability and margin reporting per sub-account, Stripe-to-GHL revenue reconciliation, QuickBooks/Xero sync for agencies, tax invoice generation for rebilling, usage-cost tracking (SMS, email, AI credits) versus what the agency charges clients.

Out of scope: generic CRM features, booking tools, voice/AI calling apps, website builders, and anything on the CLAUDE.md hard-no list.

## Workstream A: competitor pull (local agents, days 1 to 3)

Scrape the public marketplace at https://marketplace.gohighlevel.com/ across the categories closest to the scope above (finance/payments, reporting/analytics, accounting integrations). For every app capture one CSV row:

`app_name, developer, category, pricing_model (free | flat_monthly | per_sub_account | usage | one_time), price_usd, install_count_if_shown, review_count, avg_rating, last_updated, listing_url, notes`

Also pull the off-marketplace competitors that serve GHL agencies from outside (search "<pain> for gohighlevel" on Google for each scope item). Known seed to include: AgencyAnalytics (client reporting, https://agencyanalytics.com/integrations/highlevel). Anything else found goes in the same CSV with `source=external`.

Rules for agents: public pages only, respect robots.txt, rate-limit to human speed, log the URL and access date for every data point. If a number is not visible, leave the cell blank. Never guess.

## Workstream B: demand mining (VA, days 2 to 7)

Mine these sources for complaints and praise. For every distinct pain point, log: quote, link, date, how many separate people express it.

1. HighLevel ideas board and bug board (https://ideas.gohighlevel.com and https://highlevel.canny.io/saas). Sort by votes. Pay attention to the already-confirmed threads: skipped invoices after failed payments, wallet refunds creating negative balances, missing tax invoices for rebilling ("TAX for rebilling" thread). Record vote counts and thread ages; a pain that has sat unfixed for 2+ years with high votes is a signal GHL will not build it.
2. Marketplace reviews on every app from Workstream A: 1-2 star reviews for unmet needs and broken promises, 4-5 star reviews for what buyers actually praise and pay for.
3. r/gohighlevel on Reddit and the official HighLevel Facebook community (read-only; do not post, reply, or DM anyone).
4. YouTube reviews of GHL SaaS mode; skim comments for billing complaints.

## Workstream C: platform economics check (VA, day 8)

Confirm from primary sources: current developer signup cost and approval process, what the commission becomes after December 31, 2026, whether paid apps require the developer to have a paid GHL account, and marketplace payout mechanics. Everything here needs a link to an official HighLevel page.

## Gap matrix format (`research/gap-matrix.csv`)

`pain_point, who_feels_it, evidence_count, strongest_evidence_links, existing_solutions, their_price, their_weakness_from_reviews, will_platform_build_it (likely | unlikely | unknown, with reason), technical_complexity (low | med | high), uses_founder_edge (y/n), notes`

## Go/no-go gate (founder applies after delivery)

A wedge passes if all four hold: at least 20 independent complaint instances or 100+ idea-board votes for the pain; no incumbent solves it well under $50/month; GHL is unlikely to build it natively (revenue conflict or 2+ years of ignored requests); founder judges it buildable in under 6 weeks at 15 hours/week. If nothing passes, fall back to the QuickBooks/Xero app stores and rerun this same plan with the platform swapped.

## Handoff notes

Post progress and blockers in the Slack queue channel daily. Batch questions for the founder into one message per day maximum. Do not contact any company, developer, or community member. Do not buy anything, including GHL accounts; if a data source turns out to be paywalled, log it and move on.
