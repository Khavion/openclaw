// MockStripeClient: reads recorded fixtures from product/fixtures/stripe/ and
// parses them with the same schemas the real client uses.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AdapterError } from '../errors.js';
import {
  RawChargeSchema,
  RawCustomerSchema,
  RawInvoiceSchema,
  RawRefundSchema,
  RawSubscriptionSchema,
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

export class MockStripeClient implements StripeClient {
  constructor(private readonly fixtureDir: string) {}

  private async load(file: string): Promise<unknown> {
    const p = path.join(this.fixtureDir, file);
    try {
      return JSON.parse(await readFile(p, 'utf8'));
    } catch (cause) {
      throw new AdapterError({
        kind: 'validation',
        provider: 'stripe',
        message: `fixture missing or unreadable: ${p}`,
        cause
      });
    }
  }

  async listSubscriptions(): Promise<StripeSubscription[]> {
    const raw = z.array(RawSubscriptionSchema).parse(await this.load('subscriptions.json'));
    return raw.map(normalizeSubscription);
  }

  async listInvoices(params?: { customerId?: string }): Promise<StripeInvoice[]> {
    const raw = z.array(RawInvoiceSchema).parse(await this.load('invoices.json'));
    const all = raw.map(normalizeInvoice);
    return params?.customerId ? all.filter((i) => i.customerId === params.customerId) : all;
  }

  async listCharges(params?: { customerId?: string }): Promise<StripeCharge[]> {
    const raw = z.array(RawChargeSchema).parse(await this.load('charges.json'));
    const all = raw.map(normalizeCharge);
    return params?.customerId ? all.filter((c) => c.customerId === params.customerId) : all;
  }

  async listRefunds(): Promise<StripeRefund[]> {
    const raw = z.array(RawRefundSchema).parse(await this.load('refunds.json'));
    return raw.map(normalizeRefund);
  }

  async getCustomer(customerId: string): Promise<StripeCustomer> {
    const raw = z.array(RawCustomerSchema).parse(await this.load('customers.json'));
    const hit = raw.find((c) => c.id === customerId);
    if (!hit) {
      throw new AdapterError({
        kind: 'http',
        provider: 'stripe',
        message: `no customer fixture for ${customerId}`,
        status: 404,
        retryable: false
      });
    }
    return normalizeCustomer(hit);
  }
}
