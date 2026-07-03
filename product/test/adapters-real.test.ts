import { describe, expect, it } from 'vitest';
import { RealGhlClient } from '../src/adapters/ghl/real.js';
import { RealStripeClient } from '../src/adapters/stripe/real.js';
import { AdapterError } from '../src/adapters/errors.js';
import { RateLimiter } from '../src/adapters/rateLimiter.js';

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(routes: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status, body } = routes(url, init);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

const TOKENS = {
  accessToken: 'agency-token',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 86_400_000,
  companyId: 'comp_1'
};

// Recorded response shapes per the official OpenAPI specs
// (github.com/GoHighLevel/highlevel-api-docs, fetched 2026-07-02).
const SAAS_LOCATIONS_PAGE_1 = {
  locations: [
    {
      locationId: 'loc_a',
      companyId: 'comp_1',
      saasMode: 'saasV2',
      subscriptionId: 'sub_stripe_a',
      customerId: 'cus_a',
      name: 'Client A',
      email: 'a@example.com',
      isSaaSV2: true,
      subscriptionInfo: { priceId: 'price_1', saasPlanId: 'plan_1' }
    }
  ],
  pagination: { page: 1, limit: 1, total: 2, totalPages: 2, hasNext: true, hasPrev: false }
};
const SAAS_LOCATIONS_PAGE_2 = {
  locations: [
    {
      locationId: 'loc_b',
      companyId: 'comp_1',
      saasMode: 'saasV2',
      name: 'Client B',
      email: 'b@example.com'
    }
  ],
  pagination: { page: 2, limit: 1, total: 2, totalPages: 2, hasNext: false, hasPrev: true }
};

describe('RealGhlClient', () => {
  it('walks saas-locations pagination and normalizes', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.includes('/saas-api/public-api/saas-locations/comp_1?page=1'))
        return { status: 200, body: SAAS_LOCATIONS_PAGE_1 };
      if (url.includes('/saas-api/public-api/saas-locations/comp_1?page=2'))
        return { status: 200, body: SAAS_LOCATIONS_PAGE_2 };
      return { status: 404, body: 'not found' };
    });
    const client = new RealGhlClient({
      clientId: 'cid',
      clientSecret: 'sec',
      tokens: TOKENS,
      fetchImpl: impl
    });
    const locs = await client.listSaasLocations('comp_1');
    expect(locs.map((l) => l.locationId)).toEqual(['loc_a', 'loc_b']);
    expect(locs[0]?.subscriptionId).toBe('sub_stripe_a');
    expect(locs[1]?.subscriptionId).toBeNull();
    // Version header enum-locked to 2021-04-15 for saas-api (spec)
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['Version']).toBe('2021-04-15');
    expect(headers['Authorization']).toBe('Bearer agency-token');
  });

  it('refreshes the agency token on 401 and retries once', async () => {
    let refreshed = false;
    const { impl } = fakeFetch((url, init) => {
      if (url.endsWith('/oauth/token')) {
        refreshed = true;
        return {
          status: 200,
          body: { access_token: 'agency-token-2', expires_in: 86400, refresh_token: 'refresh-2' }
        };
      }
      const auth = (init?.headers as Record<string, string>)['Authorization'];
      if (auth === 'Bearer agency-token-2')
        return {
          status: 200,
          body: [{ planId: 'plan_1', title: 'Basic', trialPeriod: 14, prices: [] }]
        };
      return { status: 401, body: { message: 'expired' } };
    });
    const client = new RealGhlClient({
      clientId: 'cid',
      clientSecret: 'sec',
      tokens: TOKENS,
      fetchImpl: impl
    });
    const plans = await client.getAgencyPlans('comp_1');
    expect(refreshed).toBe(true);
    expect(plans[0]?.planId).toBe('plan_1');
  });

  it('mints a location token then pages invoices with altId/altType', async () => {
    const { impl, calls } = fakeFetch((url, init) => {
      if (url.endsWith('/oauth/locationToken')) {
        const body = init?.body as URLSearchParams;
        expect(body.get('companyId')).toBe('comp_1');
        expect(body.get('locationId')).toBe('loc_a');
        return { status: 200, body: { access_token: 'loc-token', expires_in: 86400 } };
      }
      if (url.includes('/invoices/?altId=loc_a&altType=location'))
        return {
          status: 200,
          body: {
            invoices: [
              {
                _id: 'inv_1',
                altId: 'loc_a',
                status: 'paid',
                currency: 'usd',
                total: 97,
                amountPaid: 97,
                amountDue: 0,
                issueDate: '2026-06-01',
                createdAt: '2026-06-01T00:00:00.000Z'
              }
            ],
            total: 1
          }
        };
      return { status: 404, body: 'not found' };
    });
    const client = new RealGhlClient({
      clientId: 'cid',
      clientSecret: 'sec',
      tokens: TOKENS,
      fetchImpl: impl
    });
    const invoices = await client.listLocationInvoices('loc_a');
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.totalCents).toBe(9700);
    const invoiceCall = calls.find((c) => c.url.includes('/invoices/'));
    expect((invoiceCall?.init?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer loc-token'
    );
  });

  it('classifies 429 as retryable rate_limit error', async () => {
    const { impl } = fakeFetch(() => ({ status: 429, body: { message: 'slow down' } }));
    const client = new RealGhlClient({
      clientId: 'cid',
      clientSecret: 'sec',
      tokens: TOKENS,
      fetchImpl: impl
    });
    const err = await client.getAgencyPlans('comp_1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterError);
    expect((err as AdapterError).kind).toBe('rate_limit');
    expect((err as AdapterError).retryable).toBe(true);
  });
});

// Recorded Stripe shapes per https://docs.stripe.com/api (fetched 2026-07-02).
const STRIPE_SUB = {
  id: 'sub_1',
  object: 'subscription',
  customer: 'cus_a',
  status: 'active',
  currency: 'usd',
  current_period_start: 1780000000,
  current_period_end: 1782600000,
  canceled_at: null,
  trial_end: null,
  items: { data: [{ price: { id: 'price_1', unit_amount: 9700 } }] }
};

describe('RealStripeClient', () => {
  it('lists subscriptions with status=all and basic auth, walking pagination', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.includes('/v1/subscriptions') && !url.includes('starting_after'))
        return { status: 200, body: { object: 'list', data: [STRIPE_SUB], has_more: true } };
      if (url.includes('starting_after=sub_1'))
        return {
          status: 200,
          body: {
            object: 'list',
            data: [{ ...STRIPE_SUB, id: 'sub_2', status: 'canceled', canceled_at: 1780100000 }],
            has_more: false
          }
        };
      return { status: 404, body: 'not found' };
    });
    const client = new RealStripeClient({ restrictedKey: 'rk_test_x', fetchImpl: impl });
    const subs = await client.listSubscriptions();
    expect(subs.map((s) => s.id)).toEqual(['sub_1', 'sub_2']);
    expect(calls[0]?.url).toContain('status=all');
    const auth = (calls[0]?.init?.headers as Record<string, string>)['Authorization'];
    expect(auth).toBe(`Basic ${Buffer.from('rk_test_x:').toString('base64')}`);
  });

  it('surfaces 401 as non-retryable auth error', async () => {
    const { impl } = fakeFetch(() => ({ status: 401, body: { error: { message: 'bad key' } } }));
    const client = new RealStripeClient({ restrictedKey: 'rk_bad', fetchImpl: impl });
    const err = await client.listRefunds().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterError);
    expect((err as AdapterError).kind).toBe('auth');
    expect((err as AdapterError).retryable).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('spaces requests beyond the window cap', async () => {
    let t = 0;
    const limiter = new RateLimiter(2, 100, () => t);
    await limiter.acquire();
    await limiter.acquire();
    const p = limiter.acquire();
    let resolved = false;
    void p.then(() => (resolved = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false); // still inside the window at t=0
    t = 150; // window has passed
    await p;
    expect(resolved).toBe(true);
  });
});
