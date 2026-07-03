// Unit tests for R1-R6: positive, negative, and edge cases per rule.

import { describe, expect, it } from 'vitest';
import { r1SkippedInvoice } from '../src/audit/rules/r1-skipped-invoice.js';
import { r2StatusMismatch } from '../src/audit/rules/r2-status-mismatch.js';
import { r3PriceDrift } from '../src/audit/rules/r3-price-drift.js';
import { r4ExpiredTrial } from '../src/audit/rules/r4-expired-trial.js';
import { r5WalletRefundMismatch } from '../src/audit/rules/r5-wallet-refund-mismatch.js';
import { r6PausedButBilling } from '../src/audit/rules/r6-paused-but-billing.js';
import { baseCtx, baseTenantCtx, healthySub, invoiceFor, MONTHS, NOW_MS } from './helpers.js';
import type { StripeCharge, StripeRefund } from '../src/adapters/stripe/types.js';

const { APR, MAY, JUN, JUL } = MONTHS;

function charge(over: Partial<StripeCharge>): StripeCharge {
  return {
    id: 'ch_x',
    customerId: 'cus_t',
    invoiceId: null,
    amountCents: 9700,
    amountRefundedCents: 0,
    refunded: false,
    status: 'succeeded',
    currency: 'usd',
    created: JUN,
    ...over
  };
}

function refund(over: Partial<StripeRefund>): StripeRefund {
  return {
    id: 're_x',
    chargeId: 'ch_x',
    amountCents: 5000,
    status: 'succeeded',
    currency: 'usd',
    created: JUN + 86400,
    ...over
  };
}

describe('R1 skipped invoice', () => {
  it('positive: gap month after a failed payment is flagged and dollarized', () => {
    const ctx = baseCtx({
      stripeInvoices: [
        invoiceFor([APR, MAY]),
        invoiceFor([MAY, JUN], { id: 'in_failed_month' })
        // June missing
      ],
      stripeCharges: [charge({ id: 'ch_fail', invoiceId: 'in_failed_month', status: 'failed' })]
    });
    const out = r1SkippedInvoice(ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.period).toBe('2026-06');
    expect(out[0]?.amountCents).toBe(9700);
    expect(out[0]?.evidence['failedChargeIds']).toEqual(['ch_fail']);
  });

  it('negative: continuous invoice tiling produces nothing', () => {
    expect(r1SkippedInvoice(baseCtx())).toHaveLength(0);
  });

  it('negative: gap without a preceding failure is not R1', () => {
    const ctx = baseCtx({
      stripeInvoices: [invoiceFor([APR, MAY])] // May+June missing, but no failure
    });
    expect(r1SkippedInvoice(ctx)).toHaveLength(0);
  });

  it('edge: no invoices at all (fresh trial) produces nothing', () => {
    expect(r1SkippedInvoice(baseCtx({ stripeInvoices: [] }))).toHaveLength(0);
  });

  it('edge: canceled subscription is out of scope', () => {
    const ctx = baseCtx({
      stripeSub: healthySub({ status: 'canceled' }),
      stripeInvoices: [invoiceFor([APR, MAY], { attemptFailed: true })]
    });
    expect(r1SkippedInvoice(ctx)).toHaveLength(0);
  });
});

describe('R2 status mismatch', () => {
  it('positive A: canceled in Stripe, active in GHL', () => {
    const ctx = baseCtx({ stripeSub: healthySub({ status: 'canceled', canceledAt: MAY }) });
    const out = r2StatusMismatch(ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.evidence['direction']).toBe('canceled_in_stripe_active_in_ghl');
    expect(out[0]?.amountCents).toBe(9700);
  });

  it('positive B: active in Stripe, canceled in GHL', () => {
    const ctx = baseCtx({
      sub: { ...baseCtx().sub, subscriptionStatus: 'canceled' }
    });
    const out = r2StatusMismatch(ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.evidence['direction']).toBe('active_in_stripe_canceled_in_ghl');
  });

  it('negative: aligned statuses produce nothing', () => {
    expect(r2StatusMismatch(baseCtx())).toHaveLength(0);
    const bothDead = baseCtx({
      sub: { ...baseCtx().sub, subscriptionStatus: 'canceled', locationActive: false },
      stripeSub: healthySub({ status: 'canceled' })
    });
    expect(r2StatusMismatch(bothDead)).toHaveLength(0);
  });

  it('edge: paused locations are excluded (R6 territory)', () => {
    const ctx = baseCtx({
      sub: { ...baseCtx().sub, paused: true, pausedAt: '2026-06-10', subscriptionStatus: 'canceled' }
    });
    expect(r2StatusMismatch(ctx)).toHaveLength(0);
  });

  it('edge: no Stripe subscription at all is not R2 (R4 territory)', () => {
    expect(r2StatusMismatch(baseCtx({ stripeSub: null }))).toHaveLength(0);
  });
});

describe('R3 price drift', () => {
  it('positive: plan price vs charged amount', () => {
    const ctx = baseCtx({ stripeSub: healthySub({ unitAmountCents: 8700 }) });
    const out = r3PriceDrift(ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.amountCents).toBe(1000);
    expect(out[0]?.detail).toContain('undercharging');
  });

  it('positive: special price violated', () => {
    const ctx = baseCtx({
      sub: { ...baseCtx().sub, specialPriceCents: 7900 },
      expectedMonthlyCents: 7900,
      stripeSub: healthySub({ unitAmountCents: 9700 })
    });
    const out = r3PriceDrift(ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.amountCents).toBe(1800);
    expect(out[0]?.title).toContain('Special Price');
  });

  it('negative: charge matches plan price', () => {
    expect(r3PriceDrift(baseCtx())).toHaveLength(0);
  });

  it('edge: special price honored is NOT drift', () => {
    const ctx = baseCtx({
      sub: { ...baseCtx().sub, specialPriceCents: 7900 },
      expectedMonthlyCents: 7900,
      stripeSub: healthySub({ unitAmountCents: 7900 })
    });
    expect(r3PriceDrift(ctx)).toHaveLength(0);
  });

  it('edge: dead or paused subscriptions are out of scope', () => {
    expect(
      r3PriceDrift(baseCtx({ stripeSub: healthySub({ status: 'canceled', unitAmountCents: 100 }) }))
    ).toHaveLength(0);
    const paused = baseCtx({
      sub: { ...baseCtx().sub, paused: true },
      stripeSub: healthySub({ unitAmountCents: 100 })
    });
    expect(r3PriceDrift(paused)).toHaveLength(0);
  });
});

describe('R4 expired trial', () => {
  it('positive: trial ended, still active, no paying subscription', () => {
    const ctx = baseCtx({
      sub: { ...baseCtx().sub, subscriptionStatus: 'trialing', trialEndsAt: '2026-06-01' },
      stripeSub: null,
      stripeInvoices: []
    });
    const out = r4ExpiredTrial(ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.amountCents).toBe(9700);
    expect(out[0]?.evidence['daysOverdue']).toBe(31);
  });

  it('negative: trial still running', () => {
    const ctx = baseCtx({
      sub: { ...baseCtx().sub, subscriptionStatus: 'trialing', trialEndsAt: '2026-07-20' },
      stripeSub: healthySub({ status: 'trialing' })
    });
    expect(r4ExpiredTrial(ctx)).toHaveLength(0);
  });

  it('negative: converted trial (live Stripe sub) produces nothing', () => {
    const ctx = baseCtx({ sub: { ...baseCtx().sub, trialEndsAt: '2026-06-01' } });
    expect(r4ExpiredTrial(ctx)).toHaveLength(0);
  });

  it('edge: trial ended exactly now is not overdue', () => {
    const ctx = baseCtx({
      sub: { ...baseCtx().sub, trialEndsAt: '2026-07-03' }, // parses to > NOW_MS
      stripeSub: null
    });
    expect(r4ExpiredTrial(ctx)).toHaveLength(0);
    void NOW_MS;
  });
});

describe('R5 wallet/refund mismatch', () => {
  const chargesById = new Map([['ch_x', charge({})]]);

  it('positive: refund with no wallet credit', () => {
    const tenant = baseTenantCtx({
      refunds: [refund({})],
      chargesById,
      walletRows: [
        {
          locationId: 'loc_t',
          date: '2026-06-01',
          type: 'wallet_charge',
          description: 'usage',
          amountCents: 800,
          currency: 'usd'
        }
      ]
    });
    const out = r5WalletRefundMismatch(tenant);
    expect(out).toHaveLength(1);
    expect(out[0]?.amountCents).toBe(5000);
    expect(out[0]?.period).toBe('2026-06');
  });

  it('negative: refund fully credited in the wallet', () => {
    const tenant = baseTenantCtx({
      refunds: [refund({})],
      chargesById,
      walletRows: [
        {
          locationId: 'loc_t',
          date: '2026-06-05',
          type: 'wallet_credit',
          description: 'refund credit',
          amountCents: 5000,
          currency: 'usd'
        }
      ]
    });
    expect(r5WalletRefundMismatch(tenant)).toHaveLength(0);
  });

  it('edge: partial credit flags only the difference', () => {
    const tenant = baseTenantCtx({
      refunds: [refund({})],
      chargesById,
      walletRows: [
        {
          locationId: 'loc_t',
          date: '2026-06-05',
          type: 'wallet_credit',
          description: 'partial',
          amountCents: 2000,
          currency: 'usd'
        }
      ]
    });
    const out = r5WalletRefundMismatch(tenant);
    expect(out[0]?.amountCents).toBe(3000);
  });

  it('edge: no CSV rows at all disables the rule (no data is not a finding)', () => {
    const tenant = baseTenantCtx({ refunds: [refund({})], chargesById, walletRows: [] });
    expect(r5WalletRefundMismatch(tenant)).toHaveLength(0);
  });
});

describe('R6 paused but billing', () => {
  const pausedSub = () => ({
    ...baseCtx().sub,
    paused: true,
    pausedAt: '2026-06-10'
  });

  it('positive: post-pause charge is flagged with the charged sum', () => {
    const ctx = baseCtx({
      sub: pausedSub(),
      stripeCharges: [
        charge({ id: 'ch_pre', created: JUN }), // before pause
        charge({ id: 'ch_post', created: JUN + 14 * 86400 }) // after pause
      ]
    });
    const out = r6PausedButBilling(ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.amountCents).toBe(9700);
    expect(out[0]?.evidence['postPauseChargeIds']).toEqual(['ch_post']);
  });

  it('negative: paused with a properly paused/canceled Stripe sub', () => {
    const ctx = baseCtx({
      sub: pausedSub(),
      stripeSub: healthySub({ status: 'canceled' }),
      stripeCharges: [charge({ created: JUL })]
    });
    expect(r6PausedButBilling(ctx)).toHaveLength(0);
  });

  it('negative: not paused at all', () => {
    expect(r6PausedButBilling(baseCtx({ stripeCharges: [charge({})] }))).toHaveLength(0);
  });

  it('edge: failed post-pause charges do not count', () => {
    const ctx = baseCtx({
      sub: pausedSub(),
      stripeCharges: [charge({ status: 'failed', created: JUN + 14 * 86400 })]
    });
    expect(r6PausedButBilling(ctx)).toHaveLength(0);
  });

  it('edge: charges spanning two months yield one finding per month', () => {
    const ctx = baseCtx({
      sub: pausedSub(),
      stripeCharges: [
        charge({ id: 'ch_jun', created: JUN + 14 * 86400 }),
        charge({ id: 'ch_jul', created: JUL + 86400 })
      ]
    });
    const out = r6PausedButBilling(ctx);
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.period).sort()).toEqual(['2026-06', '2026-07']);
  });
});
