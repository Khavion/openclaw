// npm run demo — the acceptance demo.
// Seeds the demo tenant, runs a full audit through the MOCK adapters over the
// committed fixtures, persists to Postgres, and prints the digest to stdout.
// Deterministic: the audit reference time is pinned so output matches the
// golden file (test/golden/digest-demo.txt).

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockGhlClient } from './adapters/ghl/mock.js';
import { MockStripeClient } from './adapters/stripe/mock.js';
import { runAudit } from './audit/engine.js';
import { parseWalletCsv } from './audit/csv.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { closePool, getPool } from './db/pool.js';
import { persistAuditResult, resetTenant, upsertTenant } from './db/repo.js';
import { renderTextDigest } from './digest/render.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, '..', 'fixtures');

export const DEMO_NOW_MS = Date.parse('2026-07-02T12:00:00Z');
export const DEMO_TENANT = 'tenant_demo';
export const DEMO_COMPANY = 'comp_khavion_demo';

const cfg = loadConfig();
await migrate(cfg.DATABASE_URL);
const db = getPool(cfg.DATABASE_URL);

await upsertTenant(db, {
  id: DEMO_TENANT,
  name: 'Khavion Demo Agency',
  ghl_company_id: DEMO_COMPANY
});
// Idempotent demo: wipe prior demo runs so the digest always matches the golden file.
await resetTenant(db, DEMO_TENANT);

const csv = await readFile(path.join(FIXTURES, 'csv', 'ghl-billing-export.csv'), 'utf8');
const { rows: walletRows, errors } = parseWalletCsv(csv);
if (errors.length) {
  console.error('fixture CSV has errors:', errors);
  process.exit(1);
}

const result = await runAudit({
  tenantId: DEMO_TENANT,
  companyId: DEMO_COMPANY,
  ghl: new MockGhlClient(path.join(FIXTURES, 'ghl')),
  stripe: new MockStripeClient(path.join(FIXTURES, 'stripe')),
  walletRows,
  nowMs: DEMO_NOW_MS
});

const { newCount, resolvedCount } = await persistAuditResult(db, result);

console.log(
  renderTextDigest({
    tenantName: 'Khavion Demo Agency',
    runDate: new Date(DEMO_NOW_MS).toISOString().slice(0, 10),
    locationCount: result.locationCount,
    findings: result.findings,
    newCount,
    resolvedCount
  })
);

await closePool();
