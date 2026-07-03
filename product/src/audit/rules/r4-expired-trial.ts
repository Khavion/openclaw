// R4 — Trial expired but the location still has free access.
//
// GHL reports a trial end date in the past, the location is still active
// (being served), and there is no live Stripe subscription paying for it.
// Dollarized at one month of the expected plan price.

import { centsToUsd, findingId, monthKey } from '../findingId.js';
import type { Finding, LocationContext } from '../types.js';

const STRIPE_PAYING = new Set(['active', 'past_due', 'trialing']);
const GHL_SERVING = new Set(['active', 'trialing']);

export function r4ExpiredTrial(ctx: LocationContext): Finding[] {
  const { sub, stripeSub, expectedMonthlyCents } = ctx;
  if (!sub.trialEndsAt || expectedMonthlyCents == null) return [];
  if (!GHL_SERVING.has(sub.subscriptionStatus ?? '') || !sub.locationActive || sub.paused)
    return [];

  const trialEndMs = Date.parse(`${sub.trialEndsAt}T00:00:00Z`);
  if (Number.isNaN(trialEndMs) || trialEndMs >= ctx.nowMs) return [];

  // A live Stripe subscription means the trial converted; nothing to flag.
  if (stripeSub && STRIPE_PAYING.has(stripeSub.status)) return [];

  const period = monthKey(ctx.nowMs);
  const daysOver = Math.floor((ctx.nowMs - trialEndMs) / 86_400_000);
  return [
    {
      id: findingId('R4', ctx.tenantId, ctx.location.locationId, period),
      rule: 'R4',
      tenantId: ctx.tenantId,
      entityId: ctx.location.locationId,
      period,
      amountCents: expectedMonthlyCents,
      currency: ctx.currency,
      title: 'Trial expired but still on free access',
      detail:
        `${ctx.location.name}: trial ended ${sub.trialEndsAt} (${daysOver} days ago) with no ` +
        `paying Stripe subscription, yet the location is still active. ` +
        `Uncollected: ${centsToUsd(expectedMonthlyCents)}/month.`,
      evidence: {
        trialEndsAt: sub.trialEndsAt,
        daysOverdue: daysOver,
        ghlStatus: sub.subscriptionStatus,
        stripeSubscriptionId: stripeSub?.id ?? null,
        stripeStatus: stripeSub?.status ?? null
      }
    }
  ];
}
