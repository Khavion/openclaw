# SubAudit — Operations Guide

This guide is written for a person, not a programmer. Every step is literal:
open the Terminal app on the Mac Mini, copy the line shown, paste it, press
Return, and read what comes back. Lines starting with `#` are comments — you
don't type those.

All commands assume you start in the project folder. Get there first, every
time you open a new Terminal window:

```
cd ~/Desktop/khavion/openclaw
```

---

## 1. First-time setup (install the tools)

The Mac already has Homebrew, Node, and Postgres from the initial build. On
a fresh machine, these three lines install everything:

```
brew install node@24 postgresql@16
brew services start postgresql@16
npm install
```

What they do: install the JavaScript runtime and the database, start the
database (it restarts automatically after reboots), and download the
project's libraries.

Then create your private settings file:

```
cp product/.env.example product/.env
```

Open `product/.env` in TextEdit (`open -e product/.env`) and fill in:
- `DATABASE_URL` → put `postgres://localhost:5432/khavion_dev`
- `KHAVION_MASTER_KEY` → paste the output of running:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `HEALTHCHECKS_PING_URL` → your ping link from healthchecks.io
- leave the GHL lines empty until section 4.

This file holds secrets. It is deliberately invisible to git — never move it,
never paste its contents anywhere.

## 2. Run the tests (the health check for the code)

```
npm test
```

Wait for the last lines. You want to see every test "passed" and none
"failed". If anything fails, copy the whole output and paste it to Claude
Code with: "The SubAudit test suite is failing, please diagnose and fix."

## 3. Run the demo (see the product work end to end)

```
npm run demo
```

This audits a fake 12-client agency built into the project and prints the
nightly digest: 8 problems found, $563.00 at stake, each one explained in a
sentence. This is exactly what a customer's nightly email/Slack digest will
look like. It works with no internet and no accounts — good for showing
people the product.

## 4. Before you run the verify script (one-time GHL setup, ~30 minutes)

The verify script proves GHL's API really returns what our audit rules need,
using a free sandbox. Do these clicks first:

1. Go to https://marketplace.gohighlevel.com and click "Sign up" to create a
   free **developer account** using a khavion.com email address.
2. In the developer dashboard, find the option to create a **sandbox / test
   agency** (free Pro sandbox). Create it.
3. In the sandbox agency: go to Settings, find **SaaS Configurator / SaaS
   Mode**, and enable SaaS mode on at least one test sub-account. Give that
   sub-account a SaaS plan with any monthly price.
4. Back in the developer dashboard, go to **My Apps → Create App**:
   - Type: **Private**
   - Target User / distribution: **Sub-account**, and where it asks who can
     install, pick **Only Agency Can Install**.
   - Do NOT pick "Agency" as the target user: that hides the billing scopes
     we need. (Verified against HighLevel's docs — see
     `docs/STAGE0-API-REPORT.md`, "Scope architecture". When the agency
     installs a Sub-account app, we still receive the agency-level token our
     SaaS checks need.)
5. Open the new app's settings:
   - **Scopes**: tick `invoices.readonly`, `payments/subscriptions.readonly`,
     `payments/transactions.readonly`, `oauth.readonly`, `oauth.write`, and
     every SaaS **read** scope the list offers (e.g. `saas/location.read`).
     Write down the exact SaaS scope names you see. If NO SaaS read scope is
     offered on this app type, stop and tell Claude Code — do not improvise.
   - **Redirect URL**: enter exactly `http://localhost:3000/oauth/callback`
   - Generate the **Client ID** and **Client Secret** and copy both.
6. Put them into `product/.env` (`open -e product/.env`):
   - `GHL_CLIENT_ID=` the ID
   - `GHL_CLIENT_SECRET=` the secret
7. Install the app to your sandbox agency (the app settings page has an
   install / authorization link — but the script will also print one).

## 5. Run the verify script

```
npm run verify:ghl
```

It prints a link. Open the link in your browser, sign in as the sandbox
agency admin, and pick the sandbox agency. Then return to the Terminal and
watch the checks run. When it finishes it writes a scorecard to
`docs/STAGE0-API-REPORT.md` and tells you plainly: "all R1-R4 data needs
PASS" or which checks failed. That scorecard is Stage 0 gate item (a).
Commit the report: paste the output to Claude Code and ask it to review and
commit.

## 6. Install the ops plane (the Slack + agent machinery)

First connect Slack (one time): create the free workspace **Khavion HQ**
with channels #rundown, #approvals, #queue, #support, #ops-alerts,
#research, then run:

```
openclaw channels add
```

and pick Slack; it walks you through creating the bot token and connecting.
To get a channel's ID: in Slack, right-click the channel name → "Copy link" —
the ID is the code at the end of the link (starts with C).

Then preview the ops install (touches nothing):

```
bash ops/install/install.sh
```

Read the plan it prints. When it looks right:

```
bash ops/install/install.sh --apply
```

Finally, copy the four `openclaw cron add` commands it printed, replace the
`C0XXXXXXX_...` placeholders with your real channel IDs, and paste each one
into Terminal. That schedules the daily rundown (7:30am), the nightly repo
commit (1:00am), the weekly community digest (Sunday 1:15am), and the weekly
competitor sweep (Monday 2:00am), all Chicago time.

## 7. What the nightly ops commit contains

Every night at 1:00am the agent commits to this repo: updated task files in
`ops/tasks/`, new lines in `ops/approvals.log`, research rows in
`ops/research/pain-log.csv`, and competitor snapshots. Nothing else — never
code, never `product/`, never any secrets. If you see a nightly commit
touching anything besides `ops/`, treat it as an incident and ask Claude
Code to investigate.

## 8. If something breaks

Paste this into Claude Code on the Mac:

> SubAudit in ~/Desktop/khavion/openclaw is misbehaving. Symptom: <describe
> what you saw>. Please run npm test and npm run demo, read docs/ and
> ops/tasks/, diagnose, and propose a fix. Follow CLAUDE.md and
> KHAVION-AUTOMATION-DESIGN.md. Do not send anything outbound.

---

## Current deviations log (docs/DEVIATIONS.md, inlined)

1. CLAUDE.md says the product is "not finalized"; built SubAudit anyway because KHAVION-AUTOMATION-DESIGN.md (newer, status "approved product 2026-07-02") supersedes it and the build prompt operationalizes that doc.
2. Design doc header says it should live at docs/AUTOMATION-DESIGN.md; it stays at repo root because the founder instructed "push as-is, no changes" when adding it.
3. The GHL billing/wallet export CSV column format is an assumption (location_id,date,type,description,amount,currency) — no public spec exists. Documented in fixtures/README.md; confirmed against a real sandbox export in Stage 0 (task T-001).
4. LocationSubscription fields specialPrice, trialEndsAt, locationActive, paused, pausedAt go beyond the published LocationSubscriptionResponseDto; they are fixture-backed and probed by the verify script (task T-007). Rules R2/R3/R4/R6 depend on them.
5. Scope list includes saas/company.read, which the scopes doc does not explicitly list (it shows saas/location.read and saas/company.write). Exact SaaS read-scope names get recorded from the app-creation UI and the verify run (task T-002).
6. GhlClient omits the location payments/subscriptions endpoint (GET /payments/subscriptions) from the prompt's adapter list: no audit rule consumes it, and the prompt's own sizing rule ("exactly what the audit rules need") wins. Add it when a rule needs it.
7. Product-plane nightly job is scheduled 01:30 UTC in pg-boss (VPS runs UTC); the design's 01:00 America/Chicago applies to the ops-plane cron, not the product job.
8. libsodium-wrappers is loaded via createRequire (CJS build) because the package's ESM entry references a file it does not ship; crypto itself is unchanged (secretbox).
9. R5 findings aggregate per location-month rather than per individual refund so the stable-ID scheme (rule|tenant|entity|period) dedupes cleanly across nightly runs.
10. Demo wipes and re-seeds only its own demo tenant on every run so `npm run demo` always matches the committed golden file.
