# Deviations Log

Each line: what deviated from the build prompt or design doc, and why.

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
11. App configuration corrected 2026-07-02 after the founder found Sub-Account scopes unselectable on an Agency-target app: Target User must be "Sub-account (Only Agency Can Install)", not "Agency" as README-OPERATIONS originally said. Doc-verified in docs/STAGE0-API-REPORT.md "Scope architecture"; RealGhlClient's token flow was already correct and is unchanged. README §4, T-002, and the report were updated; the corresponding line in the M8 inlined-deviations copy below stands corrected by this entry.
