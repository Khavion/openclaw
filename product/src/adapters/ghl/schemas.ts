// Zod schemas for raw GHL API payloads. Field names and shapes verified
// against the official OpenAPI specs on 2026-07-02:
//   https://github.com/GoHighLevel/highlevel-api-docs/blob/main/apps/saas-api.json
//   https://github.com/GoHighLevel/highlevel-api-docs/blob/main/apps/payments.json
//   https://github.com/GoHighLevel/highlevel-api-docs/blob/main/apps/invoices.json
//   https://github.com/GoHighLevel/highlevel-api-docs/blob/main/apps/oauth.json
// Every external payload (fixture or live response) passes through these.

import { z } from 'zod';
import type {
  AgencyPlan,
  GhlInvoice,
  GhlTransaction,
  LocationSubscription,
  SaasLocation
} from './types.js';

// --- OAuth (apps/oauth.json: POST /oauth/token) ---
export const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  userType: z.string().optional(),
  companyId: z.string().optional(),
  locationId: z.string().optional()
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

// --- SaaS locations (apps/saas-api.json: GetSaasLocationsResponseDto) ---
const SaasLocationDtoSchema = z.object({
  locationId: z.string(),
  companyId: z.string(),
  saasMode: z.string().optional(),
  subscriptionId: z.string().optional(),
  customerId: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  isSaaSV2: z.boolean().optional(),
  subscriptionInfo: z
    .object({
      priceId: z.string().optional(),
      saasPlanId: z.string().optional()
    })
    .passthrough()
    .optional()
});

export const SaasLocationsResponseSchema = z.object({
  locations: z.array(SaasLocationDtoSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number().optional(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean().optional()
  })
});

export function normalizeSaasLocation(raw: z.infer<typeof SaasLocationDtoSchema>): SaasLocation {
  return {
    locationId: raw.locationId,
    companyId: raw.companyId,
    name: raw.name ?? '',
    email: raw.email ?? '',
    saasMode: raw.saasMode ?? 'saasV2',
    subscriptionId: raw.subscriptionId ?? null,
    customerId: raw.customerId ?? null,
    saasPlanId: raw.subscriptionInfo?.saasPlanId ?? null,
    priceId: raw.subscriptionInfo?.priceId ?? null
  };
}

// --- Agency plans (apps/saas-api.json: AgencyPlanResponseDto[]) ---
const PlanPriceDtoSchema = z.object({
  id: z.string(),
  billingInterval: z.enum(['month', 'year']),
  active: z.boolean(),
  amount: z.number(), // plan currency units (dollars for USD)
  currency: z.string()
});

const AgencyPlanDtoSchema = z.object({
  planId: z.string(),
  title: z.string().optional(),
  trialPeriod: z.number().optional(),
  prices: z.array(PlanPriceDtoSchema).default([])
});

export const AgencyPlansResponseSchema = z.array(AgencyPlanDtoSchema);

export function normalizeAgencyPlan(raw: z.infer<typeof AgencyPlanDtoSchema>): AgencyPlan {
  return {
    planId: raw.planId,
    title: raw.title ?? '',
    trialPeriodDays: raw.trialPeriod ?? 0,
    prices: raw.prices.map((p) => ({
      id: p.id,
      billingInterval: p.billingInterval,
      active: p.active,
      amountCents: Math.round(p.amount * 100),
      currency: p.currency.toLowerCase()
    }))
  };
}

// --- Location subscription detail (apps/saas-api.json: LocationSubscriptionResponseDto) ---
// Core fields are from the spec. The fields below marked "extended" are not in
// the published DTO; they arrive via fixtures today and the Stage 0 verify
// script (scripts/verify-ghl-api.ts) probes what the live API actually returns.
export const LocationSubscriptionDtoSchema = z.object({
  locationId: z.string(),
  companyId: z.string(),
  isSaaSV2: z.boolean().optional(),
  saasMode: z.string().optional(),
  subscriptionId: z.string().optional(),
  customerId: z.string().optional(),
  productId: z.string().optional(),
  priceId: z.string().optional(),
  saasPlanId: z.string().optional(),
  subscriptionStatus: z.string().optional(),
  // extended (fixture-backed, verified in Stage 0):
  specialPrice: z.number().nullable().optional(),
  trialEndsAt: z.string().nullable().optional(),
  locationActive: z.boolean().optional(),
  paused: z.boolean().optional(),
  pausedAt: z.string().nullable().optional()
});

export function normalizeLocationSubscription(
  raw: z.infer<typeof LocationSubscriptionDtoSchema>
): LocationSubscription {
  return {
    locationId: raw.locationId,
    companyId: raw.companyId,
    subscriptionId: raw.subscriptionId ?? null,
    customerId: raw.customerId ?? null,
    priceId: raw.priceId ?? null,
    saasPlanId: raw.saasPlanId ?? null,
    subscriptionStatus: raw.subscriptionStatus ?? null,
    specialPriceCents: raw.specialPrice == null ? null : Math.round(raw.specialPrice * 100),
    trialEndsAt: raw.trialEndsAt ?? null,
    locationActive: raw.locationActive ?? true,
    paused: raw.paused ?? false,
    pausedAt: raw.pausedAt ?? null
  };
}

// --- Invoices (apps/invoices.json: ListInvoicesResponseDto / GetInvoiceResponseDto) ---
const InvoiceDtoSchema = z.object({
  _id: z.string(),
  altId: z.string(),
  altType: z.string().optional(),
  status: z.string(),
  currency: z.string(),
  total: z.number(),
  amountPaid: z.number().optional(),
  amountDue: z.number().optional(),
  issueDate: z.string(),
  createdAt: z.string()
});

export const ListInvoicesResponseSchema = z.object({
  invoices: z.array(InvoiceDtoSchema),
  total: z.number()
});

export function normalizeInvoice(raw: z.infer<typeof InvoiceDtoSchema>): GhlInvoice {
  return {
    id: raw._id,
    locationId: raw.altId,
    status: raw.status,
    currency: raw.currency.toLowerCase(),
    totalCents: Math.round(raw.total * 100),
    amountPaidCents: Math.round((raw.amountPaid ?? 0) * 100),
    amountDueCents: Math.round((raw.amountDue ?? 0) * 100),
    issueDate: raw.issueDate,
    createdAt: raw.createdAt
  };
}

// --- Transactions (apps/payments.json: ListTxnsResponseDto / TxnResponseSchema) ---
const TxnDtoSchema = z.object({
  _id: z.string(),
  altId: z.string(),
  currency: z.string().optional(),
  amount: z.number(),
  status: z.string(),
  subscriptionId: z.string().nullable().optional(),
  chargeId: z.string().nullable().optional(),
  createdAt: z.string()
});

export const ListTxnsResponseSchema = z.object({
  data: z.array(TxnDtoSchema),
  totalCount: z.number()
});

export function normalizeTransaction(raw: z.infer<typeof TxnDtoSchema>): GhlTransaction {
  return {
    id: raw._id,
    locationId: raw.altId,
    currency: (raw.currency ?? 'usd').toLowerCase(),
    amountCents: Math.round(raw.amount * 100),
    status: raw.status,
    subscriptionId: raw.subscriptionId ?? null,
    chargeId: raw.chargeId ?? null,
    createdAt: raw.createdAt
  };
}
