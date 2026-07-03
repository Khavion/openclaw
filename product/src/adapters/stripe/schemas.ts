// Zod schemas for raw Stripe API payloads (the subset SubAudit reads).
// Shapes verified against the official API reference on 2026-07-02:
//   https://docs.stripe.com/api/subscriptions/list   (GET /v1/subscriptions)
//   https://docs.stripe.com/api/invoices/list        (GET /v1/invoices)
//   https://docs.stripe.com/api/charges/list         (GET /v1/charges)
//   https://docs.stripe.com/api/refunds/list         (GET /v1/refunds)
// List envelope: { object: "list", data: [...], has_more: boolean }.

import { z } from 'zod';
import type {
  StripeCharge,
  StripeCustomer,
  StripeInvoice,
  StripeRefund,
  StripeSubscription
} from './types.js';

export function listEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    object: z.literal('list'),
    data: z.array(item),
    has_more: z.boolean()
  });
}

// expandable fields arrive as id-string or object with id
const idOrObject = z.union([z.string(), z.object({ id: z.string() }).passthrough()]);
export function refId(v: z.infer<typeof idOrObject> | null | undefined): string | null {
  if (v == null) return null;
  return typeof v === 'string' ? v : v.id;
}

export const RawSubscriptionSchema = z.object({
  id: z.string(),
  object: z.literal('subscription'),
  customer: idOrObject,
  status: z.enum([
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused'
  ]),
  currency: z.string(),
  current_period_start: z.number(),
  current_period_end: z.number(),
  canceled_at: z.number().nullable().optional(),
  trial_end: z.number().nullable().optional(),
  items: z.object({
    data: z.array(
      z.object({
        price: z
          .object({
            id: z.string(),
            unit_amount: z.number().nullable().optional()
          })
          .passthrough()
      })
    )
  })
});

export function normalizeSubscription(
  raw: z.infer<typeof RawSubscriptionSchema>
): StripeSubscription {
  const first = raw.items.data[0];
  return {
    id: raw.id,
    customerId: refId(raw.customer) ?? '',
    status: raw.status,
    priceId: first?.price.id ?? null,
    unitAmountCents: first?.price.unit_amount ?? null,
    currency: raw.currency.toLowerCase(),
    currentPeriodStart: raw.current_period_start,
    currentPeriodEnd: raw.current_period_end,
    canceledAt: raw.canceled_at ?? null,
    trialEnd: raw.trial_end ?? null
  };
}

export const RawInvoiceSchema = z.object({
  id: z.string(),
  object: z.literal('invoice'),
  customer: idOrObject,
  subscription: idOrObject.nullable().optional(),
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']),
  amount_due: z.number(),
  amount_paid: z.number(),
  currency: z.string(),
  period_start: z.number(),
  period_end: z.number(),
  created: z.number(),
  attempted: z.boolean().optional(),
  paid: z.boolean().optional()
});

export function normalizeInvoice(raw: z.infer<typeof RawInvoiceSchema>): StripeInvoice {
  return {
    id: raw.id,
    customerId: refId(raw.customer) ?? '',
    subscriptionId: refId(raw.subscription ?? null),
    status: raw.status,
    amountDueCents: raw.amount_due,
    amountPaidCents: raw.amount_paid,
    currency: raw.currency.toLowerCase(),
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    created: raw.created,
    attemptFailed: (raw.attempted ?? false) && !(raw.paid ?? false) && raw.status === 'open'
  };
}

export const RawChargeSchema = z.object({
  id: z.string(),
  object: z.literal('charge'),
  customer: idOrObject.nullable().optional(),
  invoice: idOrObject.nullable().optional(),
  amount: z.number(),
  amount_refunded: z.number(),
  refunded: z.boolean(),
  status: z.enum(['succeeded', 'pending', 'failed']),
  currency: z.string(),
  created: z.number()
});

export function normalizeCharge(raw: z.infer<typeof RawChargeSchema>): StripeCharge {
  return {
    id: raw.id,
    customerId: refId(raw.customer ?? null),
    invoiceId: refId(raw.invoice ?? null),
    amountCents: raw.amount,
    amountRefundedCents: raw.amount_refunded,
    refunded: raw.refunded,
    status: raw.status,
    currency: raw.currency.toLowerCase(),
    created: raw.created
  };
}

export const RawRefundSchema = z.object({
  id: z.string(),
  object: z.literal('refund'),
  charge: idOrObject.nullable().optional(),
  amount: z.number(),
  status: z.string(),
  currency: z.string(),
  created: z.number()
});

export function normalizeRefund(raw: z.infer<typeof RawRefundSchema>): StripeRefund {
  return {
    id: raw.id,
    chargeId: refId(raw.charge ?? null),
    amountCents: raw.amount,
    status: raw.status,
    currency: raw.currency.toLowerCase(),
    created: raw.created
  };
}

export const RawCustomerSchema = z.object({
  id: z.string(),
  object: z.literal('customer'),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional()
});

export function normalizeCustomer(raw: z.infer<typeof RawCustomerSchema>): StripeCustomer {
  return { id: raw.id, email: raw.email ?? null, name: raw.name ?? null };
}
