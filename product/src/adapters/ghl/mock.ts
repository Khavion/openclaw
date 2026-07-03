// MockGhlClient: reads recorded fixtures from product/fixtures/ghl/ and runs
// them through the same zod schemas + normalizers the real client uses, so
// tests exercise identical parsing paths.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AdapterError } from '../errors.js';
import {
  AgencyPlansResponseSchema,
  ListInvoicesResponseSchema,
  ListTxnsResponseSchema,
  LocationSubscriptionDtoSchema,
  SaasLocationsResponseSchema,
  normalizeAgencyPlan,
  normalizeInvoice,
  normalizeLocationSubscription,
  normalizeSaasLocation,
  normalizeTransaction
} from './schemas.js';
import type {
  AgencyPlan,
  GhlClient,
  GhlInvoice,
  GhlTransaction,
  LocationSubscription,
  SaasLocation
} from './types.js';
import { z } from 'zod';

export class MockGhlClient implements GhlClient {
  constructor(private readonly fixtureDir: string) {}

  private async load(file: string): Promise<unknown> {
    const p = path.join(this.fixtureDir, file);
    try {
      return JSON.parse(await readFile(p, 'utf8'));
    } catch (cause) {
      throw new AdapterError({
        kind: 'validation',
        provider: 'ghl',
        message: `fixture missing or unreadable: ${p}`,
        cause
      });
    }
  }

  async listSaasLocations(companyId: string): Promise<SaasLocation[]> {
    // Fixture mirrors GET /saas-api/public-api/saas-locations/{companyId},
    // possibly across several pages concatenated by the recorder.
    const raw = SaasLocationsResponseSchema.parse(await this.load('saas-locations.json'));
    return raw.locations
      .map(normalizeSaasLocation)
      .filter((l) => l.companyId === companyId);
  }

  async getAgencyPlans(_companyId: string): Promise<AgencyPlan[]> {
    const raw = AgencyPlansResponseSchema.parse(await this.load('agency-plans.json'));
    return raw.map(normalizeAgencyPlan);
  }

  async getLocationSubscription(
    _companyId: string,
    locationId: string
  ): Promise<LocationSubscription> {
    const map = z
      .record(z.string(), LocationSubscriptionDtoSchema)
      .parse(await this.load('location-subscriptions.json'));
    const raw = map[locationId];
    if (!raw) {
      throw new AdapterError({
        kind: 'http',
        provider: 'ghl',
        message: `no subscription fixture for location ${locationId}`,
        status: 404,
        retryable: false
      });
    }
    return normalizeLocationSubscription(raw);
  }

  async listLocationInvoices(locationId: string): Promise<GhlInvoice[]> {
    const raw = ListInvoicesResponseSchema.parse(await this.load('invoices.json'));
    return raw.invoices.map(normalizeInvoice).filter((i) => i.locationId === locationId);
  }

  async listLocationTransactions(locationId: string): Promise<GhlTransaction[]> {
    const raw = ListTxnsResponseSchema.parse(await this.load('transactions.json'));
    return raw.data.map(normalizeTransaction).filter((t) => t.locationId === locationId);
  }
}
