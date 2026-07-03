// R3 — Price drift between the configured plan price and what Stripe
// actually bills. Honors per-location Special Prices: when a special price
// is set, drift is measured against it (a location correctly billed at its
// special price is NOT a finding). Only alive, unpaused subscriptions are
// checked; dead/paused mismatches belong to R2/R6.
// Dollarized at the absolute monthly difference.

import { centsToUsd, findingId, monthKey } from '../findingId.js';
import type { Finding, LocationContext } from '../types.js';

const ALIVE = new Set(['active', 'past_due', 'trialing']);

export function r3PriceDrift(ctx: LocationContext): Finding[] {
  const { stripeSub, sub, expectedMonthlyCents } = ctx;
  if (!stripeSub || !ALIVE.has(stripeSub.status) || sub.paused) return [];
  if (expectedMonthlyCents == null || stripeSub.unitAmountCents == null) return [];

  const actual = stripeSub.unitAmountCents;
  if (actual === expectedMonthlyCents) return [];

  const period = monthKey(ctx.nowMs);
  const driftCents = Math.abs(actual - expectedMonthlyCents);
  const usingSpecial = sub.specialPriceCents != null;
  return [
    {
      id: findingId('R3', ctx.tenantId, ctx.location.locationId, period),
      rule: 'R3',
      tenantId: ctx.tenantId,
      entityId: ctx.location.locationId,
      period,
      amountCents: driftCents,
      currency: ctx.currency,
      title: usingSpecial
        ? 'Charge does not match the Special Price'
        : 'Charge does not match the plan price',
      detail:
        `${ctx.location.name}: expected ${centsToUsd(expectedMonthlyCents)}/month ` +
        `(${usingSpecial ? 'special price' : `plan ${ctx.plan?.title ?? ctx.sub.saasPlanId ?? '?'}`}) ` +
        `but Stripe bills ${centsToUsd(actual)}/month. Drift: ${centsToUsd(driftCents)}/month ` +
        `${actual < expectedMonthlyCents ? '(undercharging)' : '(overcharging)'}.`,
      evidence: {
        expectedMonthlyCents,
        actualMonthlyCents: actual,
        specialPriceCents: sub.specialPriceCents,
        planId: sub.saasPlanId,
        stripePriceId: stripeSub.priceId,
        stripeSubscriptionId: stripeSub.id
      }
    }
  ];
}
