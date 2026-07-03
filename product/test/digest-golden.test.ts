// Golden-file lock on the digest output. Runs the same pipeline as
// `npm run demo` (mock adapters -> engine -> renderer) and compares
// byte-for-byte with test/golden/digest-demo.txt. Any intentional wording
// change must update the golden file in the same commit.

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockGhlClient } from '../src/adapters/ghl/mock.js';
import { MockStripeClient } from '../src/adapters/stripe/mock.js';
import { parseWalletCsv } from '../src/audit/csv.js';
import { runAudit } from '../src/audit/engine.js';
import { renderBlockKitDigest, renderTextDigest } from '../src/digest/render.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, '..', 'fixtures');
const NOW_MS = Date.parse('2026-07-02T12:00:00Z');

async function digestInput() {
  const csv = await readFile(path.join(FIXTURES, 'csv', 'ghl-billing-export.csv'), 'utf8');
  const { rows: walletRows } = parseWalletCsv(csv);
  const result = await runAudit({
    tenantId: 'tenant_demo',
    companyId: 'comp_khavion_demo',
    ghl: new MockGhlClient(path.join(FIXTURES, 'ghl')),
    stripe: new MockStripeClient(path.join(FIXTURES, 'stripe')),
    walletRows,
    nowMs: NOW_MS
  });
  return {
    tenantName: 'Khavion Demo Agency',
    runDate: '2026-07-02',
    locationCount: result.locationCount,
    findings: result.findings,
    newCount: result.findings.length,
    resolvedCount: 0
  };
}

describe('digest golden file', () => {
  it('text digest matches test/golden/digest-demo.txt byte for byte', async () => {
    const golden = await readFile(path.join(here, 'golden', 'digest-demo.txt'), 'utf8');
    const rendered = renderTextDigest(await digestInput());
    expect(`${rendered}\n`).toBe(golden);
  });

  it('block kit digest is valid and complete', async () => {
    const payload = renderBlockKitDigest(await digestInput());
    const blocks = payload['blocks'] as Array<{ type: string }>;
    expect(blocks[0]?.type).toBe('header');
    // 6 rule groups -> divider + section each, plus header + summary
    expect(blocks.filter((b) => b.type === 'divider')).toHaveLength(6);
    const json = JSON.stringify(payload);
    expect(json).toContain('$563.00');
    expect(json).toContain('Skipped invoices');
    expect(json).toContain('Vine Florist');
  });

  it('all-clear digest renders the zero-findings body', async () => {
    const input = { ...(await digestInput()), findings: [], newCount: 0, resolvedCount: 3 };
    const text = renderTextDigest(input);
    expect(text).toContain('All clear. Every sub-account reconciles.');
    expect(text).toContain('0 open findings');
  });
});
