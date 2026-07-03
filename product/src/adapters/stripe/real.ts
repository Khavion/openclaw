// RealStripeClient: live Stripe API client using a customer-supplied
// RESTRICTED key with read-only grants (Subscriptions, Invoices, Charges,
// Refunds, Customers: Read). Read-only by design; this client contains no
// write calls.
//
// Endpoint citations (official API reference, fetched 2026-07-02):
//   GET /v1/subscriptions  https://docs.stripe.com/api/subscriptions/list
//   GET /v1/invoices       https://docs.stripe.com/api/invoices/list
//   GET /v1/charges        https://docs.stripe.com/api/charges/list
//   GET /v1/refunds        https://docs.stripe.com/api/refunds/list
//   GET /v1/customers/:id  https://docs.stripe.com/api/customers/retrieve
// Auth: HTTP Basic with the key as username (docs above). Pagination:
// limit (max 100) + starting_after cursor, response envelope
// { object: "list", data, has_more }.

import { AdapterError, classifyHttpStatus } from '../errors.js';
import { RateLimiter, stripeRateLimiter } from '../rateLimiter.js';
import {
  RawChargeSchema,
  RawCustomerSchema,
  RawInvoiceSchema,
  RawRefundSchema,
  RawSubscriptionSchema,
  listEnvelope,
  normalizeCharge,
  normalizeCustomer,
  normalizeInvoice,
  normalizeRefund,
  normalizeSubscription
} from './schemas.js';
import type {
  StripeCharge,
  StripeClient,
  StripeCustomer,
  StripeInvoice,
  StripeRefund,
  StripeSubscription
} from './types.js';
import { z } from 'zod';

const BASE_URL = 'https://api.stripe.com';

export interface RealStripeClientOptions {
  /** Customer-supplied restricted key (rk_live_... / rk_test_...). */
  restrictedKey: string;
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
}

export class RealStripeClient implements StripeClient {
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;

  constructor(private readonly opts: RealStripeClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.limiter = opts.limiter ?? stripeRateLimiter();
  }

  private async getJson(pathAndQuery: string): Promise<unknown> {
    await this.limiter.acquire();
    let res: Response;
    try {
      res = await this.fetchImpl(`${BASE_URL}${pathAndQuery}`, {
        headers: {
          // HTTP Basic auth, key as username, empty password
          // (https://docs.stripe.com/api/subscriptions/list example: -u "<key>").
          Authorization: `Basic ${Buffer.from(`${this.opts.restrictedKey}:`).toString('base64')}`
        }
      });
    } catch (cause) {
      throw new AdapterError({
        kind: 'network',
        provider: 'stripe',
        message: `network failure calling ${pathAndQuery}`,
        cause
      });
    }
    const text = await res.text();
    if (!res.ok) throw classifyHttpStatus('stripe', res.status, text);
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new AdapterError({
        kind: 'validation',
        provider: 'stripe',
        message: `non-JSON response from ${pathAndQuery}`,
        cause
      });
    }
  }

  /** Walk limit/starting_after pagination until has_more is false. */
  private async listAll<T extends z.ZodTypeAny>(
    basePath: string,
    baseQuery: Record<string, string>,
    itemSchema: T
  ): Promise<z.infer<T>[]> {
    const out: z.infer<T>[] = [];
    let startingAfter: string | undefined;
    for (;;) {
      const q = new URLSearchParams({ ...baseQuery, limit: '100' });
      if (startingAfter) q.set('starting_after', startingAfter);
      const raw = listEnvelope(itemSchema).parse(await this.getJson(`${basePath}?${q}`));
      out.push(...raw.data);
      if (!raw.has_more || raw.data.length === 0) break;
      const last = raw.data[raw.data.length - 1] as { id?: string };
      if (!last?.id) break;
      startingAfter = last.id;
    }
    return out;
  }

  /**
   * GET /v1/subscriptions?status=all — status "all" returns every status
   * (https://docs.stripe.com/api/subscriptions/list, `status` enum).
   */
  async listSubscriptions(): Promise<StripeSubscription[]> {
    const raw = await this.listAll('/v1/subscriptions', { status: 'all' }, RawSubscriptionSchema);
    return raw.map(normalizeSubscription);
  }

  /** GET /v1/invoices[?customer=] (https://docs.stripe.com/api/invoices/list). */
  async listInvoices(params?: { customerId?: string }): Promise<StripeInvoice[]> {
    const q: Record<string, string> = {};
    if (params?.customerId) q['customer'] = params.customerId;
    const raw = await this.listAll('/v1/invoices', q, RawInvoiceSchema);
    return raw.map(normalizeInvoice);
  }

  /** GET /v1/charges[?customer=] (https://docs.stripe.com/api/charges/list). */
  async listCharges(params?: { customerId?: string }): Promise<StripeCharge[]> {
    const q: Record<string, string> = {};
    if (params?.customerId) q['customer'] = params.customerId;
    const raw = await this.listAll('/v1/charges', q, RawChargeSchema);
    return raw.map(normalizeCharge);
  }

  /** GET /v1/refunds (https://docs.stripe.com/api/refunds/list). */
  async listRefunds(): Promise<StripeRefund[]> {
    const raw = await this.listAll('/v1/refunds', {}, RawRefundSchema);
    return raw.map(normalizeRefund);
  }

  /** GET /v1/customers/:id (https://docs.stripe.com/api/customers/retrieve). */
  async getCustomer(customerId: string): Promise<StripeCustomer> {
    const raw = RawCustomerSchema.parse(
      await this.getJson(`/v1/customers/${encodeURIComponent(customerId)}`)
    );
    return normalizeCustomer(raw);
  }
}
