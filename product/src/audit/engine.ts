// The audit engine: joins GHL and Stripe views per tenant, runs every rule,
// and returns dollarized, stably-identified findings. Pure orchestration —
// no persistence here (see db/repo.ts) and zero LLM involvement anywhere.

import type { GhlClient } from '../adapters/ghl/types.js';
import type { StripeClient } from '../adapters/stripe/types.js';
import { r1SkippedInvoice } from './rules/r1-skipped-invoice.js';
import { r2StatusMismatch } from './rules/r2-status-mismatch.js';
import { r3PriceDrift } from './rules/r3-price-drift.js';
import { r4ExpiredTrial } from './rules/r4-expired-trial.js';
import { r5WalletRefundMismatch } from './rules/r5-wallet-refund-mismatch.js';
import { r6PausedButBilling } from './rules/r6-paused-but-billing.js';
import type { Finding, LocationContext, TenantContext, WalletCsvRow } from './types.js';

export interface AuditParams {
  tenantId: string;
  companyId: string;
  ghl: GhlClient;
  stripe: StripeClient;
  walletRows?: WalletCsvRow[];
  /** audit reference time; injectable for deterministic tests/demo */
  nowMs?: number;
}

export interface AuditResult {
  tenantId: string;
  ranAtMs: number;
  locationCount: number;
  findings: Finding[];
  totalCents: number;
}

const RULE_ORDER = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const;

export async function runAudit(params: AuditParams): Promise<AuditResult> {
  const nowMs = params.nowMs ?? Date.now();
  const { tenantId, companyId, ghl, stripe } = params;

  const [plans, locations, stripeSubs, stripeInvoices, stripeCharges, stripeRefunds] =
    await Promise.all([
      ghl.getAgencyPlans(companyId),
      ghl.listSaasLocations(companyId),
      stripe.listSubscriptions(),
      stripe.listInvoices(),
      stripe.listCharges(),
      stripe.listRefunds()
    ]);

  const planById = new Map(plans.map((p) => [p.planId, p]));
  const subByStripeId = new Map(stripeSubs.map((s) => [s.id, s]));
  const subsByCustomer = new Map<string, typeof stripeSubs>();
  for (const s of stripeSubs) {
    subsByCustomer.set(s.customerId, [...(subsByCustomer.get(s.customerId) ?? []), s]);
  }
  const invoicesByCustomer = new Map<string, typeof stripeInvoices>();
  for (const i of stripeInvoices) {
    invoicesByCustomer.set(i.customerId, [...(invoicesByCustomer.get(i.customerId) ?? []), i]);
  }
  const chargesByCustomer = new Map<string, typeof stripeCharges>();
  for (const c of stripeCharges) {
    if (!c.customerId) continue;
    chargesByCustomer.set(c.customerId, [...(chargesByCustomer.get(c.customerId) ?? []), c]);
  }

  const findings: Finding[] = [];
  const customerToLocation = new Map<string, string>();

  for (const location of locations) {
    const sub = await ghl.getLocationSubscription(companyId, location.locationId);
    const [ghlInvoices, ghlTransactions] = await Promise.all([
      ghl.listLocationInvoices(location.locationId),
      ghl.listLocationTransactions(location.locationId)
    ]);

    const customerId = sub.customerId ?? location.customerId;
    if (customerId) customerToLocation.set(customerId, location.locationId);

    // Prefer GHL's recorded Stripe subscription id; fall back to the
    // customer's newest subscription.
    const bySubId = sub.subscriptionId ? subByStripeId.get(sub.subscriptionId) : undefined;
    const byCustomer = customerId
      ? [...(subsByCustomer.get(customerId) ?? [])].sort(
          (a, b) => b.currentPeriodStart - a.currentPeriodStart
        )[0]
      : undefined;
    const stripeSub = bySubId ?? byCustomer ?? null;

    const plan = sub.saasPlanId ? (planById.get(sub.saasPlanId) ?? null) : null;
    const planMonthly =
      plan?.prices.find((p) => p.billingInterval === 'month' && p.active)?.amountCents ?? null;
    const expectedMonthlyCents = sub.specialPriceCents ?? planMonthly;

    const ctx: LocationContext = {
      tenantId,
      location,
      sub,
      plan,
      expectedMonthlyCents,
      currency: stripeSub?.currency ?? 'usd',
      stripeSub,
      stripeInvoices: customerId ? (invoicesByCustomer.get(customerId) ?? []) : [],
      stripeCharges: customerId ? (chargesByCustomer.get(customerId) ?? []) : [],
      ghlInvoices,
      ghlTransactions,
      nowMs
    };

    findings.push(
      ...r1SkippedInvoice(ctx),
      ...r2StatusMismatch(ctx),
      ...r3PriceDrift(ctx),
      ...r4ExpiredTrial(ctx),
      ...r6PausedButBilling(ctx)
    );
  }

  const tenantCtx: TenantContext = {
    tenantId,
    refunds: stripeRefunds,
    chargesById: new Map(stripeCharges.map((c) => [c.id, c])),
    customerToLocation,
    walletRows: params.walletRows ?? [],
    nowMs,
    currency: 'usd'
  };
  findings.push(...r5WalletRefundMismatch(tenantCtx));

  findings.sort(
    (a, b) =>
      RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule) ||
      a.entityId.localeCompare(b.entityId) ||
      a.period.localeCompare(b.period)
  );

  return {
    tenantId,
    ranAtMs: nowMs,
    locationCount: locations.length,
    findings,
    totalCents: findings.reduce((sum, f) => sum + f.amountCents, 0)
  };
}
