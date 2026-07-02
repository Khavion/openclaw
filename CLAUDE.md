# Khavion — Context Brief for Claude Code

## What this file is
Background, operating model, and hard constraints for **Khavion**, a mostly-autonomous software business. Save it as `CLAUDE.md` in the repo root, or paste it at the start of a Claude Code session so the agent has full context before it builds.

This is a context primer, not a locked build spec. The specific product for Khavion was scoped by constraints but **not finalized** in planning (see Open Decisions). Do not invent a committed product; build toward the one named, or help run the validation step that picks it.

---

## The business in one line
A faceless, recurring-revenue software business run by a solo technical founder with a full-time VA and local AI agents, engineered for near-zero per-customer delivery and near-passive operation after an upfront build.

## Operating setup (the machine that runs it)
- **Founder (Zohaib):** Azure AI Solutions Engineer, strong cloud / AI / data-engineering background. Owns the technical build, the correctness/QA pass, pricing, and any irreversible or paid decision. Commits 15+ hours/week during the build phase, wants it near-passive after.
- **VA:** full-time, Philippines-based, **text and admin only (no voice)**. Handles market and competitor research, review mining, drafting listings/docs/onboarding, customer support (with founder approval), and light content.
- **Local agents:** a Mac Mini (M4) running **Ollama** local models plus **OpenClaw** and **Claude Code**. Handle scraping and data aggregation, code scaffolding, uptime/review monitoring, and first-draft generation. Cheap and orchestration tasks run on the local model (a small model such as a 7B via Ollama); heavy generation goes to cloud Claude.
- **Task queue:** a Slack workspace is the assignment and queue layer for handing jobs to the VA and agents.
- **Budget:** lean. Low ongoing spend (target well under ~$100/month new) and a small one-time budget (cap around $2k).

## Success definition
- Floor to count as a win: roughly **$500 to $1,000/month net** after the VA and tools. Founder is happy parking it there.
- Open to growing it until a hard revenue ceiling, then optimizing spend and letting it coast.
- Upside is optional. This is a cash-flowing, low-maintenance asset, not a growth startup.

---

## Hard constraints and guardrails (non-negotiable)
- **Faceless brand.** Company-forward, not personal-name-forward. Founder will show his face one-to-one (e.g., a sales or onboarding call) but will not post publicly under his own name. **No model that depends on his personal trust or reputation** to sell.
- **No cold selling by the founder.** Distribution must be inbound, platform-native, or SEO-driven. The VA and agents can execute outreach, but the business cannot hinge on the founder personally selling.
- **Recurring revenue, high margin.** Prefer a pure-software utility (~90% margin) over an AI-inference-heavy product (25 to 60% margin) unless the economics clearly favor the latter.
- **Near-passive after the upfront grind.** Low ongoing support and ops load.
- **Respect the labor split** (founder builds/QAs; VA researches/comms/support; local agents scrape/scaffold/monitor/draft).
- **Hard-no domains:** crypto, gambling, MLM, politics. Founder will leave his comfort zone only if the economics clearly justify it, but those four are out.
- **No garbage.** It must fill a real gap or be genuinely cheaper or better than incumbents.
- **Keep it fully separate from the founder's Microsoft employer.** Do not use or touch Microsoft work files, Microsoft-issued credentials, Microsoft customer names, or any internal employer data. This is a personal venture on personal machines.
- **No irreversible or paid actions and no outbound sends** (email, DMs, posts, purchases, publishes) without the founder's explicit approval. **Zero tolerance for hallucinated or unverified facts** — verify before asserting.

## How the agent should work
- Direct and brief. Prose over bullets. No em-dashes, no filler, no praise.
- Act on reasonable judgment and flag deviations after the fact rather than stopping. Batch any necessary questions into one message.
- Give a single clear recommendation when one option is best.

---

## What planning locked in
A **digital product** that sells or serves on autopilot (not a per-client retainer), built heavily with AI (Claude Code plus the local agents), faceless, recurring, near-passive, clearing the $500 to $1k/month floor. Founder does QA, support escalations, and fixes; the VA and agents do research, outreach, comms, drafting, and monitoring.

**Leading direction (recommended, not committed): a platform-native micro-SaaS utility.** A focused tool that lives inside one host platform's ecosystem or marketplace, so that platform's store becomes the distribution (no cold selling), the integration itself is the moat, and the founder's data-engineering is the edge. This threads every constraint at once: recurring, high margin, faceless, distribution without selling, and it uses his actual skill.

## What planning ruled out (do not re-pitch these as fresh ideas)
- **Shopify analytics and alerting apps.** Mature and crowded with funded incumbents. Profit tracking, custom reporting, and attribution are all locked up, and even the "proactive anomaly-alerting" escape hatch is already taken. The often-cited "98% of stores lack a dedicated analytics app" stat is misleading: those are small stores that do not buy.
- **Stripe / SaaS subscription-metrics dashboards.** Saturated with strong **free** incumbents (ProfitWell/Paddle free forever, ChartMogul free tier, Baremetrics, QuantLedger at a flat low price). Hard to win against free.
- **Sell-once template or digital-product packs and non-technical content products.** Race-to-zero on price and they do not use the founder's edge.
- **OnlyFans-style management.** A relationship and negotiation service that needs voice and trust. Fails the digital-product, faceless/no-personal-trust, and text-only-VA constraints simultaneously.

## Filter to apply to any new idea (principle from the research)
Any category that is horizontal, obvious, low-complexity, and clearly in demand is already farmed, often by free tools. A durable wedge needs either a less-farmed vertical or platform, or real technical/domain complexity as a moat. On any host platform, only build what the platform itself is dis-incentivized to build (something that would cannibalize its own revenue or lock-in).

## Last open thread on the product
After Shopify was eliminated, the recommended next validation target was **financial and revenue-ops utilities on a platform with a paying B2B base that is not already picked clean** — for example the Stripe / QuickBooks / Xero ecosystems (reconciliation, dunning and failed-payment recovery, margin and cash-flow alerting), or GoHighLevel agency tooling, or Airtable extensions. This was **not validated or committed**.

---

## Open decisions (resolve before a real build)
1. **The exact product and host platform for Khavion is not finalized.** Planning pivoted before locking it. Either name the product and have Claude Code build toward it, or run the validation step below first.
2. **Recommended pre-build validation ("Stage 0", ~1 to 2 weeks, no code, mostly VA plus agents):** pull the full competitor set in the target category, scrape pricing and install/usage counts, mine 1-2 star reviews for unmet needs and 4-5 star reviews for what wins, and build a gap matrix. Founder then picks the sharp wedge and writes a one-page spec (one-sentence value, target user, three core features, a price that undercuts incumbents). Go/no-go gate: if the wedge is weak, switch platform and repeat.

## Build approach once the product is chosen
Founder plus Claude Code scaffold the app; local agents generate boilerplate, tests, and first-draft UI; the VA drafts the store listing, help docs, onboarding, and support macros. Enforce anything touching money, quota, or access server-side. Self-testing is mandatory. Ship, then automate: the agent drafts support replies from a knowledge base for the VA to approve, watches uptime, errors, and churn, and runs growth content on a cadence. Founder does a monthly quality and pricing review, and at the revenue ceiling cuts spend and lets it coast.
