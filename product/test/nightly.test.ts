// Nightly job handler: runs the engine per tenant with injected adapters and
// pings healthchecks on completion. No real network anywhere.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockGhlClient } from '../src/adapters/ghl/mock.js';
import { MockStripeClient } from '../src/adapters/stripe/mock.js';
import { migrate } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { resetTenant, upsertTenant } from '../src/db/repo.js';
import { healthchecksPinger, runNightlyAudits } from '../src/jobs/nightly.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, '..', 'fixtures');
const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://localhost:5432/khavion_test';
const NOW_MS = Date.parse('2026-07-02T12:00:00Z');

beforeAll(async () => {
  await migrate(DB_URL);
  const db = getPool(DB_URL);
  // isolate: only the nightly tenants exist during this file's assertions
  await db.query(`delete from tenants where id like 'tenant_n_%'`);
  await upsertTenant(db, { id: 'tenant_n_1', name: 'N1', ghl_company_id: 'comp_khavion_demo' });
  await resetTenant(db, 'tenant_n_1');
});

afterAll(async () => {
  await closePool();
});

describe('runNightlyAudits', () => {
  it('audits each tenant and pings success', async () => {
    const db = getPool(DB_URL);
    const pings: string[] = [];
    const summary = await runNightlyAudits({
      db,
      clientsFor: async () => ({
        ghl: new MockGhlClient(path.join(FIXTURES, 'ghl')),
        stripe: new MockStripeClient(path.join(FIXTURES, 'stripe'))
      }),
      ping: async (slug) => {
        pings.push(slug);
      },
      nowMs: NOW_MS
    });
    expect(summary.failures).toEqual([]);
    expect(summary.tenants).toBeGreaterThanOrEqual(1);
    // wallet CSV not uploaded for these tenants -> R5 silent; 7 findings, not 8
    expect(summary.findings).toBeGreaterThanOrEqual(7);
    expect(pings).toEqual(['success']);
  });

  it('a tenant failure is contained and pings fail', async () => {
    const db = getPool(DB_URL);
    const pings: string[] = [];
    const summary = await runNightlyAudits({
      db,
      clientsFor: async (t) => {
        if (t.id === 'tenant_n_1') throw new Error('boom: credentials expired');
        return {
          ghl: new MockGhlClient(path.join(FIXTURES, 'ghl')),
          stripe: new MockStripeClient(path.join(FIXTURES, 'stripe'))
        };
      },
      ping: async (slug) => {
        pings.push(slug);
      },
      nowMs: NOW_MS
    });
    expect(summary.failures.some((f) => f.tenantId === 'tenant_n_1')).toBe(true);
    expect(pings).toEqual(['fail']);
  });

  it('healthchecksPinger builds the documented success and /fail URLs', async () => {
    const urls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response('OK');
    }) as typeof fetch;
    try {
      const ping = healthchecksPinger('https://hc-ping.example/uuid-1');
      await ping('success');
      await ping('fail');
      expect(urls).toEqual(['https://hc-ping.example/uuid-1', 'https://hc-ping.example/uuid-1/fail']);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
