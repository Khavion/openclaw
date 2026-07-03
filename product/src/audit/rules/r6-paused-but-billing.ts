// R6 — Paused in GHL but Stripe keeps charging.
//
// The agency paused the location (client offboarding, dispute, seasonal
// hold) but the Stripe subscription was never paused/canceled, so charges
// keep landing. Dollarized as the sum of succeeded charges created after
// the pause timestamp, grouped per calendar month of the charges.

import { centsToUsd, findingId, monthKey } from '../findingId.js';
import type { Finding, LocationContext } from '../types.js';

const STRIPE_BILLING = new Set(['active', 'past_due']);

export function r6PausedButBilling(ctx: LocationContext): Finding[] {
  const { sub, stripeSub, stripeCharges } = ctx;
  if (!sub.paused || !sub.pausedAt) return [];
  if (!stripeSub || !STRIPE_BILLING.has(stripeSub.status)) return [];

  const pausedAtMs = Date.parse(`${sub.pausedAt}T00:00:00Z`);
  if (Number.isNaN(pausedAtMs)) return [];

  const postPause = stripeCharges.filter(
    (c) => c.status === 'succeeded' && c.created * 1000 > pausedAtMs
  );
  if (postPause.length === 0) return [];

  // one finding per month in which post-pause charges landed
  const byMonth = new Map<string, typeof postPause>();
  for (const c of postPause) {
    const key = monthKey(c.created * 1000);
    byMonth.set(key, [...(byMonth.get(key) ?? []), c]);
  }

  const findings: Finding[] = [];
  for (const [period, charges] of byMonth) {
    const total = charges.reduce((sum, c) => sum + c.amountCents, 0);
    findings.push({
      id: findingId('R6', ctx.tenantId, ctx.location.locationId, period),
      rule: 'R6',
      tenantId: ctx.tenantId,
      entityId: ctx.location.locationId,
      period,
      amountCents: total,
      currency: ctx.currency,
      title: 'Paused location still being charged',
      detail:
        `${ctx.location.name}: paused in GHL since ${sub.pausedAt}, but Stripe subscription ` +
        `${stripeSub.id} charged ${centsToUsd(total)} in ${period} ` +
        `(${charges.length} charge${charges.length === 1 ? '' : 's'} after the pause).`,
      evidence: {
        pausedAt: sub.pausedAt,
        stripeSubscriptionId: stripeSub.id,
        postPauseChargeIds: charges.map((c) => c.id),
        ghlTransactionCount: ctx.ghlTransactions.length
      }
    });
  }
  return findings;
}
