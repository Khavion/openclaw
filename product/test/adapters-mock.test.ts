import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockGhlClient } from '../src/adapters/ghl/mock.js';
import { MockStripeClient } from '../src/adapters/stripe/mock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const GHL_DIR = path.join(here, '..', 'fixtures', 'ghl');
const STRIPE_DIR = path.join(here, '..', 'fixtures', 'stripe');
const COMPANY = 'comp_khavion_demo';

describe('MockGhlClient over committed fixtures', () => {
  const ghl = new MockGhlClient(GHL_DIR);

  it('lists all 12 saas locations', async () => {
    const locs = await ghl.listSaasLocations(COMPANY);
    expect(locs).toHaveLength(12);
    expect(locs.every((l) => l.companyId === COMPANY)).toBe(true);
  });

  it('returns both agency plans with cent-normalized prices', async () => {
    const plans = await ghl.getAgencyPlans(COMPANY);
    expect(plans.map((p) => p.planId).sort()).toEqual(['plan_basic', 'plan_pro']);
    const basic = plans.find((p) => p.planId === 'plan_basic');
    expect(basic?.prices.find((pr) => pr.billingInterval === 'month')?.amountCents).toBe(9700);
  });

  it('exposes special price, pause, and trial detail per location', async () => {
    const sp = await ghl.getLocationSubscription(COMPANY, 'loc_r3sp');
    expect(sp.specialPriceCents).toBe(7900);
    const paused = await ghl.getLocationSubscription(COMPANY, 'loc_r6');
    expect(paused.paused).toBe(true);
    expect(paused.pausedAt).toBe('2026-06-10');
    const trial = await ghl.getLocationSubscription(COMPANY, 'loc_r4');
    expect(trial.trialEndsAt).toBe('2026-06-01');
    expect(trial.subscriptionId).toBeNull();
  });

  it('filters location invoices and transactions by location', async () => {
    const inv = await ghl.listLocationInvoices('loc_r1');
    expect(inv).toHaveLength(2); // June missing by design
    const tx = await ghl.listLocationTransactions('loc_r1');
    expect(tx.some((t) => t.status === 'failed')).toBe(true);
  });

  it('404s on an unknown location subscription', async () => {
    await expect(ghl.getLocationSubscription(COMPANY, 'loc_nope')).rejects.toMatchObject({
      kind: 'http',
      status: 404
    });
  });
});

describe('MockStripeClient over committed fixtures', () => {
  const stripe = new MockStripeClient(STRIPE_DIR);

  it('parses every fixture file through the raw schemas', async () => {
    const [subs, invoices, charges, refunds] = await Promise.all([
      stripe.listSubscriptions(),
      stripe.listInvoices(),
      stripe.listCharges(),
      stripe.listRefunds()
    ]);
    expect(subs.length).toBeGreaterThanOrEqual(10);
    expect(invoices).toHaveLength(28);
    expect(charges).toHaveLength(31);
    expect(refunds).toHaveLength(2);
  });

  it('scopes invoices by customer', async () => {
    const inv = await stripe.listInvoices({ customerId: 'cus_r1' });
    expect(inv).toHaveLength(2);
    expect(inv.every((i) => i.customerId === 'cus_r1')).toBe(true);
  });

  it('reflects the canceled subscription for loc_r2a', async () => {
    const subs = await stripe.listSubscriptions();
    const r2a = subs.find((s) => s.id === 'sub_r2a');
    expect(r2a?.status).toBe('canceled');
    expect(r2a?.canceledAt).not.toBeNull();
  });

  it('finds a customer and 404s an unknown one', async () => {
    const c = await stripe.getCustomer('cus_h1');
    expect(c.name).toBe('Bright Dental');
    await expect(stripe.getCustomer('cus_nope')).rejects.toMatchObject({ status: 404 });
  });
});
