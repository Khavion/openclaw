// R2 — Status mismatch between Stripe and GHL, both directions.
//
// Direction A (revenue leak): the Stripe subscription is canceled/expired
// but GHL still shows the location active and being served.
// Direction B (refund exposure): Stripe is actively billing but GHL shows
// the location canceled/inactive — the end-client pays for nothing.
// Paused locations are R6's domain and excluded here.
// Dollarized at one month of the expected price (A) or the actual Stripe
// unit price (B).

import { centsToUsd, findingId, monthKey } from '../findingId.js';
import type { Finding, LocationContext } from '../types.js';

const STRIPE_DEAD = new Set(['canceled', 'unpaid', 'incomplete_expired']);
const STRIPE_BILLING = new Set(['active', 'past_due']);
const GHL_ACTIVE = new Set(['active', 'trialing']);

export function r2StatusMismatch(ctx: LocationContext): Finding[] {
  const { stripeSub, sub } = ctx;
  if (!stripeSub || sub.paused) return [];
  const period = monthKey(ctx.nowMs);
  const findings: Finding[] = [];

  const ghlActive = GHL_ACTIVE.has(sub.subscriptionStatus ?? '') && sub.locationActive;

  // Direction A: canceled in Stripe, active in GHL.
  if (STRIPE_DEAD.has(stripeSub.status) && ghlActive && ctx.expectedMonthlyCents != null) {
    findings.push({
      id: findingId('R2', ctx.tenantId, ctx.location.locationId, period),
      rule: 'R2',
      tenantId: ctx.tenantId,
      entityId: ctx.location.locationId,
      period,
      amountCents: ctx.expectedMonthlyCents,
      currency: ctx.currency,
      title: 'Canceled in Stripe but still active in GHL',
      detail:
        `${ctx.location.name}: Stripe subscription ${stripeSub.id} is "${stripeSub.status}" ` +
        `but the location is still active in GHL. Serving unbilled: ${centsToUsd(ctx.expectedMonthlyCents)}/month.`,
      evidence: {
        direction: 'canceled_in_stripe_active_in_ghl',
        stripeStatus: stripeSub.status,
        stripeCanceledAt: stripeSub.canceledAt,
        ghlStatus: sub.subscriptionStatus,
        ghlLocationActive: sub.locationActive
      }
    });
  }

  // Direction B: billing in Stripe, canceled in GHL.
  const ghlDead = !ghlActive;
  if (STRIPE_BILLING.has(stripeSub.status) && ghlDead) {
    const amount = stripeSub.unitAmountCents ?? ctx.expectedMonthlyCents ?? 0;
    findings.push({
      id: findingId('R2', ctx.tenantId, ctx.location.locationId, period),
      rule: 'R2',
      tenantId: ctx.tenantId,
      entityId: ctx.location.locationId,
      period,
      amountCents: amount,
      currency: ctx.currency,
      title: 'Still billing in Stripe but canceled in GHL',
      detail:
        `${ctx.location.name}: GHL shows "${sub.subscriptionStatus ?? 'inactive'}" but Stripe ` +
        `subscription ${stripeSub.id} is still "${stripeSub.status}". ` +
        `Client charged without service: ${centsToUsd(amount)}/month (refund exposure).`,
      evidence: {
        direction: 'active_in_stripe_canceled_in_ghl',
        stripeStatus: stripeSub.status,
        ghlStatus: sub.subscriptionStatus,
        ghlLocationActive: sub.locationActive
      }
    });
  }

  return findings;
}
