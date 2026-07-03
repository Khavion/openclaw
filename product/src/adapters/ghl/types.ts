// Normalized GHL domain types, sized to exactly what audit rules R1-R6 need.
// Raw API shapes live in schemas.ts; adapters normalize into these.

/** One SaaS sub-account (location) under the agency. */
export interface SaasLocation {
  locationId: string;
  companyId: string;
  name: string;
  email: string;
  saasMode: string;
  /** Stripe subscription id GHL believes bills this location, if any. */
  subscriptionId: string | null;
  /** Stripe customer id for the end-client, if any. */
  customerId: string | null;
  saasPlanId: string | null;
  priceId: string | null;
}

/** An agency SaaS plan with its price points. */
export interface AgencyPlan {
  planId: string;
  title: string;
  trialPeriodDays: number;
  prices: PlanPrice[];
}

export interface PlanPrice {
  id: string;
  billingInterval: 'month' | 'year';
  active: boolean;
  amountCents: number;
  currency: string;
}

/** Per-location subscription detail as GHL sees it. */
export interface LocationSubscription {
  locationId: string;
  companyId: string;
  subscriptionId: string | null;
  customerId: string | null;
  priceId: string | null;
  saasPlanId: string | null;
  /** GHL's view of the billing status, e.g. "active", "canceled", "trialing", "paused". */
  subscriptionStatus: string | null;
  /**
   * Special (custom) price for this location in cents, when the agency
   * overrode the plan price. Null when the location is on the standard plan
   * price. Fixture-backed; the verify script checks the live field name.
   */
  specialPriceCents: number | null;
  /** Trial end as ISO date, when GHL reports one. */
  trialEndsAt: string | null;
  /** Whether the location itself is currently active (serving the client). */
  locationActive: boolean;
  /** Whether the agency paused this location in SaaS mode. */
  paused: boolean;
  pausedAt: string | null;
}

/** Normalized GHL invoice (from the location-level Invoices API). */
export interface GhlInvoice {
  id: string;
  locationId: string;
  status: string;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  issueDate: string; // YYYY-MM-DD
  createdAt: string; // ISO
}

/** Normalized GHL payment transaction (location level). */
export interface GhlTransaction {
  id: string;
  locationId: string;
  currency: string;
  amountCents: number;
  status: string;
  subscriptionId: string | null;
  chargeId: string | null;
  createdAt: string; // ISO
}

/**
 * Read-only client surface the audit engine needs from GHL.
 * Implementations: MockGhlClient (fixtures) and RealGhlClient (live API).
 */
export interface GhlClient {
  /** All SaaS locations for the agency, all pages. */
  listSaasLocations(companyId: string): Promise<SaasLocation[]>;
  /** The agency's SaaS plans with price points. */
  getAgencyPlans(companyId: string): Promise<AgencyPlan[]>;
  /** GHL's subscription detail for one location. */
  getLocationSubscription(companyId: string, locationId: string): Promise<LocationSubscription>;
  /** Invoices for one location (uses the location-token flow in the real client). */
  listLocationInvoices(locationId: string): Promise<GhlInvoice[]>;
  /** Payment transactions for one location (location-token flow). */
  listLocationTransactions(locationId: string): Promise<GhlTransaction[]>;
}
