// R5 — Refund/wallet mismatch (tenant-level rule, CSV-fed in v1).
//
// The documented GHL wallet bug: a Stripe refund is issued but the location's
// wallet credits are never adjusted (or only partially), so the agency's
// books and GHL's wallet history disagree. No public wallet-transaction API
// was verified (design doc §2), so v1 consumes GHL's own billing export CSV
// uploaded by the customer; format in fixtures/README.md.
//
// Detection: per location and calendar month, total Stripe refunds (joined
// refund -> charge -> customer -> location) minus total wallet_credit rows.
// A positive difference is dollarized as-is. Skipped entirely when no CSV
// rows exist for the tenant (no data ≠ finding).

import { centsToUsd, findingId, monthKey } from '../findingId.js';
import type { Finding, TenantContext } from '../types.js';

export function r5WalletRefundMismatch(tenant: TenantContext): Finding[] {
  if (tenant.walletRows.length === 0) return [];

  // refunds per location-month
  const refundTotals = new Map<string, number>(); // "loc|YYYY-MM" -> cents
  const refundIds = new Map<string, string[]>();
  for (const refund of tenant.refunds) {
    if (!refund.chargeId) continue;
    const charge = tenant.chargesById.get(refund.chargeId);
    const customerId = charge?.customerId;
    if (!customerId) continue;
    const locationId = tenant.customerToLocation.get(customerId);
    if (!locationId) continue;
    const key = `${locationId}|${monthKey(refund.created * 1000)}`;
    refundTotals.set(key, (refundTotals.get(key) ?? 0) + refund.amountCents);
    refundIds.set(key, [...(refundIds.get(key) ?? []), refund.id]);
  }

  // wallet credits per location-month
  const creditTotals = new Map<string, number>();
  for (const row of tenant.walletRows) {
    if (row.type !== 'wallet_credit') continue;
    const key = `${row.locationId}|${row.date.slice(0, 7)}`;
    creditTotals.set(key, (creditTotals.get(key) ?? 0) + row.amountCents);
  }

  const findings: Finding[] = [];
  for (const [key, refundCents] of refundTotals) {
    const [locationId, period] = key.split('|') as [string, string];
    const creditCents = creditTotals.get(key) ?? 0;
    const gap = refundCents - creditCents;
    if (gap <= 0) continue;
    findings.push({
      id: findingId('R5', tenant.tenantId, locationId, period),
      rule: 'R5',
      tenantId: tenant.tenantId,
      entityId: locationId,
      period,
      amountCents: gap,
      currency: tenant.currency,
      title: 'Stripe refund not reflected in wallet credits',
      detail:
        `${locationId}: ${centsToUsd(refundCents)} refunded in Stripe during ${period} but only ` +
        `${centsToUsd(creditCents)} of wallet credits appear in the billing export. ` +
        `Unreconciled: ${centsToUsd(gap)}.`,
      evidence: {
        refundCents,
        walletCreditCents: creditCents,
        refundIds: refundIds.get(key) ?? [],
        month: period
      }
    });
  }
  return findings.sort((a, b) => a.entityId.localeCompare(b.entityId));
}
