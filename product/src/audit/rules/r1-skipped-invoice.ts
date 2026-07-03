// R1 — Skipped invoice after a failed payment.
//
// The documented GHL SaaS-mode failure (HighLevel bug board, see design doc):
// a payment fails in month N, the customer later settles month N, but the
// invoice for month N+1 is never generated. Detection: for a location whose
// Stripe subscription is alive, calendar months between the first invoice
// and the last fully-elapsed month must each be covered by an invoice
// period. A gap is flagged only when the invoice immediately before the gap
// had a failed payment attempt (failed charge or failed attempt on the
// invoice), which separates the bug from benign pauses or plan changes.
// Dollarized at the location's expected monthly price per missing month.

import { centsToUsd, findingId, monthKey } from '../findingId.js';
import type { Finding, LocationContext } from '../types.js';

const ALIVE = new Set(['active', 'past_due', 'trialing']);

export function r1SkippedInvoice(ctx: LocationContext): Finding[] {
  const { stripeSub, stripeInvoices, stripeCharges, expectedMonthlyCents } = ctx;
  if (!stripeSub || !ALIVE.has(stripeSub.status)) return [];
  if (stripeInvoices.length === 0 || expectedMonthlyCents == null) return [];

  const sorted = [...stripeInvoices].sort((a, b) => a.periodStart - b.periodStart);
  const covered = new Set(sorted.map((i) => monthKey(i.periodStart * 1000)));

  // Months that should exist: first invoice month .. last fully-elapsed month.
  const first = sorted[0];
  if (!first) return [];
  const start = new Date(first.periodStart * 1000);
  const now = new Date(ctx.nowMs);
  const lastFull = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const findings: Finding[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= lastFull) {
    const key = monthKey(cursor.getTime());
    if (!covered.has(key)) {
      // The invoice immediately preceding this gap month:
      const prev = [...sorted]
        .filter((i) => i.periodStart * 1000 < cursor.getTime())
        .at(-1);
      const prevHadFailure =
        prev !== undefined &&
        (prev.attemptFailed ||
          stripeCharges.some((c) => c.invoiceId === prev.id && c.status === 'failed'));
      if (prevHadFailure) {
        findings.push({
          id: findingId('R1', ctx.tenantId, ctx.location.locationId, key),
          rule: 'R1',
          tenantId: ctx.tenantId,
          entityId: ctx.location.locationId,
          period: key,
          amountCents: expectedMonthlyCents,
          currency: ctx.currency,
          title: `Invoice never generated for ${key}`,
          detail:
            `${ctx.location.name}: after a failed payment on the ${prev ? monthKey(prev.periodStart * 1000) : 'prior'} invoice, ` +
            `no invoice was generated for ${key}. Estimated uncollected: ${centsToUsd(expectedMonthlyCents)}.`,
          evidence: {
            missingMonth: key,
            precedingInvoiceId: prev?.id ?? null,
            failedChargeIds: stripeCharges
              .filter((c) => c.invoiceId === prev?.id && c.status === 'failed')
              .map((c) => c.id),
            stripeSubscriptionId: stripeSub.id,
            ghlInvoiceCount: ctx.ghlInvoices.length
          }
        });
      }
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return findings;
}
