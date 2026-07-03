// Normalized Stripe domain types, sized to what audit rules R1-R6 consume.
// All money values are integer cents, matching Stripe's native representation.

export interface StripeSubscription {
  id: string;
  customerId: string;
  status:
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused';
  priceId: string | null;
  /** unit price in cents of the first item */
  unitAmountCents: number | null;
  currency: string;
  currentPeriodStart: number; // unix seconds
  currentPeriodEnd: number;
  canceledAt: number | null;
  trialEnd: number | null;
}

export interface StripeInvoice {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  periodStart: number; // unix seconds
  periodEnd: number;
  created: number;
  /** set when the latest payment attempt failed */
  attemptFailed: boolean;
}

export interface StripeCharge {
  id: string;
  customerId: string | null;
  invoiceId: string | null;
  amountCents: number;
  amountRefundedCents: number;
  refunded: boolean;
  status: 'succeeded' | 'pending' | 'failed';
  currency: string;
  created: number;
}

export interface StripeRefund {
  id: string;
  chargeId: string | null;
  amountCents: number;
  status: string;
  currency: string;
  created: number;
}

export interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * Read-only client surface the audit engine needs from the customer's Stripe
 * account (restricted key). Implementations: MockStripeClient (fixtures) and
 * RealStripeClient (live API).
 */
export interface StripeClient {
  /** All subscriptions regardless of status, all pages. */
  listSubscriptions(): Promise<StripeSubscription[]>;
  /** All invoices, optionally scoped to a customer, all pages. */
  listInvoices(params?: { customerId?: string }): Promise<StripeInvoice[]>;
  /** All charges, optionally scoped to a customer, all pages. */
  listCharges(params?: { customerId?: string }): Promise<StripeCharge[]>;
  /** All refunds, all pages. */
  listRefunds(): Promise<StripeRefund[]>;
  /** One customer by id. */
  getCustomer(customerId: string): Promise<StripeCustomer>;
}
