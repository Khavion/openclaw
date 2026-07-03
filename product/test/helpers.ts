// Shared builders for rule unit tests: a healthy location context that each
// test mutates into the scenario it needs.

import type { LocationContext, TenantContext } from '../src/audit/types.js';
import type { StripeInvoice, StripeSubscription } from '../src/adapters/stripe/types.js';

export const NOW_MS = Date.parse('2026-07-02T12:00:00Z');
const APR = Date.parse('2026-04-01T00:00:00Z') / 1000;
const MAY = Date.parse('2026-05-01T00:00:00Z') / 1000;
const JUN = Date.parse('2026-06-01T00:00:00Z') / 1000;
const JUL = Date.parse('2026-07-01T00:00:00Z') / 1000;
export const MONTHS = { APR, MAY, JUN, JUL };

export function healthySub(over: Partial<StripeSubscription> = {}): StripeSubscription {
  return {
    id: 'sub_t',
    customerId: 'cus_t',
    status: 'active',
    priceId: 'price_basic_m',
    unitAmountCents: 9700,
    currency: 'usd',
    currentPeriodStart: JUN,
    currentPeriodEnd: JUL,
    canceledAt: null,
    trialEnd: null,
    ...over
  };
}

export function invoiceFor(
  period: [number, number],
  over: Partial<StripeInvoice> = {}
): StripeInvoice {
  return {
    id: `in_${period[0]}`,
    customerId: 'cus_t',
    subscriptionId: 'sub_t',
    status: 'paid',
    amountDueCents: 9700,
    amountPaidCents: 9700,
    currency: 'usd',
    periodStart: period[0],
    periodEnd: period[1],
    created: period[0],
    attemptFailed: false,
    ...over
  };
}

export function baseCtx(over: Partial<LocationContext> = {}): LocationContext {
  return {
    tenantId: 'tenant_t',
    location: {
      locationId: 'loc_t',
      companyId: 'comp_t',
      name: 'Test Location',
      email: 't@example.com',
      saasMode: 'saasV2',
      subscriptionId: 'sub_t',
      customerId: 'cus_t',
      saasPlanId: 'plan_basic',
      priceId: 'price_basic_m'
    },
    sub: {
      locationId: 'loc_t',
      companyId: 'comp_t',
      subscriptionId: 'sub_t',
      customerId: 'cus_t',
      priceId: 'price_basic_m',
      saasPlanId: 'plan_basic',
      subscriptionStatus: 'active',
      specialPriceCents: null,
      trialEndsAt: null,
      locationActive: true,
      paused: false,
      pausedAt: null
    },
    plan: {
      planId: 'plan_basic',
      title: 'Starter',
      trialPeriodDays: 14,
      prices: [
        { id: 'price_basic_m', billingInterval: 'month', active: true, amountCents: 9700, currency: 'usd' }
      ]
    },
    expectedMonthlyCents: 9700,
    currency: 'usd',
    stripeSub: healthySub(),
    stripeInvoices: [invoiceFor([APR, MAY]), invoiceFor([MAY, JUN]), invoiceFor([JUN, JUL])],
    stripeCharges: [],
    ghlInvoices: [],
    ghlTransactions: [],
    nowMs: NOW_MS,
    ...over
  };
}

export function baseTenantCtx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: 'tenant_t',
    refunds: [],
    chargesById: new Map(),
    customerToLocation: new Map([['cus_t', 'loc_t']]),
    walletRows: [],
    nowMs: NOW_MS,
    currency: 'usd',
    ...over
  };
}
