// Core audit domain types. Rules are pure functions over these inputs.

import type {
  AgencyPlan,
  GhlInvoice,
  GhlTransaction,
  LocationSubscription,
  SaasLocation
} from '../adapters/ghl/types.js';
import type {
  StripeCharge,
  StripeInvoice,
  StripeRefund,
  StripeSubscription
} from '../adapters/stripe/types.js';

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

export interface Finding {
  /** sha256(rule|tenant|entity|period) truncated to 16 hex chars */
  id: string;
  rule: RuleId;
  tenantId: string;
  /** locationId the finding is about */
  entityId: string;
  /** stable period key, e.g. "2026-06" */
  period: string;
  amountCents: number;
  currency: string;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
}

/** One parsed row of the GHL billing/wallet CSV export (see fixtures/README.md). */
export interface WalletCsvRow {
  locationId: string;
  date: string; // YYYY-MM-DD
  type: 'wallet_charge' | 'wallet_credit';
  description: string;
  amountCents: number;
  currency: string;
}

/** Everything the rules need about one location, joined across both systems. */
export interface LocationContext {
  tenantId: string;
  location: SaasLocation;
  sub: LocationSubscription;
  plan: AgencyPlan | null;
  /**
   * The monthly price this location is expected to pay:
   * special price if set, else the plan's active monthly price.
   */
  expectedMonthlyCents: number | null;
  currency: string;
  stripeSub: StripeSubscription | null;
  stripeInvoices: StripeInvoice[];
  stripeCharges: StripeCharge[];
  ghlInvoices: GhlInvoice[];
  ghlTransactions: GhlTransaction[];
  /** audit reference time, epoch ms */
  nowMs: number;
}

/** Tenant-level extras for rules that operate across locations. */
export interface TenantContext {
  tenantId: string;
  refunds: StripeRefund[];
  chargesById: Map<string, StripeCharge>;
  customerToLocation: Map<string, string>;
  walletRows: WalletCsvRow[];
  nowMs: number;
  currency: string;
}
