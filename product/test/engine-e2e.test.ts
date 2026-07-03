// End-to-end: mock adapters -> engine -> exact expected findings from
// fixtures/README.md, then persistence + cross-run dedupe against Postgres.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockGhlClient } from '../src/adapters/ghl/mock.js';
import { MockStripeClient } from '../src/adapters/stripe/mock.js';
import { parseWalletCsv } from '../src/audit/csv.js';
import { runAudit, type AuditResult } from '../src/audit/engine.js';
import { migrate } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { openFindings, persistAuditResult, resetTenant, upsertTenant } from '../src/db/repo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, '..', 'fixtures');
const NOW_MS = Date.parse('2026-07-02T12:00:00Z');
const TENANT = 'tenant_e2e';
const COMPANY = 'comp_khavion_demo';
const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://localhost:5432/khavion_test';

async function audit(): Promise<AuditResult> {
  const csv = await readFile(path.join(FIXTURES, 'csv', 'ghl-billing-export.csv'), 'utf8');
  const { rows: walletRows, errors } = parseWalletCsv(csv);
  expect(errors).toEqual([]);
  return runAudit({
    tenantId: TENANT,
    companyId: COMPANY,
    ghl: new MockGhlClient(path.join(FIXTURES, 'ghl')),
    stripe: new MockStripeClient(path.join(FIXTURES, 'stripe')),
    walletRows,
    nowMs: NOW_MS
  });
}

// The contract from fixtures/README.md "Expected findings":
const EXPECTED: Array<[string, string, number]> = [
  ['R1', 'loc_r1', 9700],
  ['R2', 'loc_r2a', 9700],
  ['R2', 'loc_r2b', 9700],
  ['R3', 'loc_r3', 1000],
  ['R3', 'loc_r3sp', 1800],
  ['R4', 'loc_r4', 9700],
  ['R5', 'loc_r5', 5000],
  ['R6', 'loc_r6', 9700]
];

describe('engine end-to-end over fixtures', () => {
  it('produces exactly the expected findings, dollarized', async () => {
    const result = await audit();
    const got = result.findings.map((f) => [f.rule, f.entityId, f.amountCents]);
    expect(got).toEqual(EXPECTED);
    expect(result.totalCents).toBe(56300); // $563.00
    expect(result.locationCount).toBe(12);
  });

  it('never flags the healthy accounts', async () => {
    const result = await audit();
    const flagged = new Set(result.findings.map((f) => f.entityId));
    for (const healthy of ['loc_h1', 'loc_h2', 'loc_h3', 'loc_h4']) {
      expect(flagged.has(healthy)).toBe(false);
    }
  });

  it('assigns stable ids across runs', async () => {
    const [a, b] = await Promise.all([audit(), audit()]);
    expect(a.findings.map((f) => f.id)).toEqual(b.findings.map((f) => f.id));
  });
});

describe('persistence and cross-run dedupe', () => {
  beforeAll(async () => {
    await migrate(DB_URL);
    const db = getPool(DB_URL);
    await upsertTenant(db, { id: TENANT, name: 'E2E Agency', ghl_company_id: COMPANY });
    await resetTenant(db, TENANT);
  });

  afterAll(async () => {
    await closePool();
  });

  it('first run inserts all findings as new and open', async () => {
    const db = getPool(DB_URL);
    const result = await audit();
    const { newCount, resolvedCount } = await persistAuditResult(db, result);
    expect(newCount).toBe(EXPECTED.length);
    expect(resolvedCount).toBe(0);
    const open = await openFindings(db, TENANT);
    expect(open).toHaveLength(EXPECTED.length);
    expect(open.every((f) => f.runCount === 1)).toBe(true);
  });

  it('second identical run dedupes: zero new, run_count bumps', async () => {
    const db = getPool(DB_URL);
    const result = await audit();
    // simulate the next night
    const { newCount, resolvedCount } = await persistAuditResult(db, {
      ...result,
      ranAtMs: NOW_MS + 86_400_000
    });
    expect(newCount).toBe(0);
    expect(resolvedCount).toBe(0);
    const open = await openFindings(db, TENANT);
    expect(open).toHaveLength(EXPECTED.length);
    expect(open.every((f) => f.runCount === 2)).toBe(true);
  });

  it('findings absent from the next run are marked resolved, and reopen if they return', async () => {
    const db = getPool(DB_URL);
    const result = await audit();
    const withoutR6 = {
      ...result,
      ranAtMs: NOW_MS + 2 * 86_400_000,
      findings: result.findings.filter((f) => f.rule !== 'R6')
    };
    const second = await persistAuditResult(db, withoutR6);
    expect(second.resolvedCount).toBe(1);
    let open = await openFindings(db, TENANT);
    expect(open.some((f) => f.rule === 'R6')).toBe(false);

    // R6 comes back the following night -> reopens under the same id
    const third = await persistAuditResult(db, {
      ...result,
      ranAtMs: NOW_MS + 3 * 86_400_000
    });
    expect(third.newCount).toBe(0); // same stable id, so not "new"
    open = await openFindings(db, TENANT);
    expect(open.some((f) => f.rule === 'R6')).toBe(true);
  });
});
