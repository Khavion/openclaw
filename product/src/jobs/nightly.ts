// Nightly audit job. The handler is dependency-injected so tests run it with
// mock adapters and a fake pinger; production wiring (pg-boss schedule) is in
// boss.ts. On success it pings HEALTHCHECKS_PING_URL when configured — a
// missed ping is what raises the external alarm (design doc §7).

import type pg from 'pg';
import type { GhlClient } from '../adapters/ghl/types.js';
import type { StripeClient } from '../adapters/stripe/types.js';
import { runAudit } from '../audit/engine.js';
import { latestWalletRows, persistAuditResult } from '../db/repo.js';

export interface NightlyDeps {
  db: pg.Pool;
  /** returns the adapter pair for one tenant */
  clientsFor: (tenant: {
    id: string;
    ghl_company_id: string;
  }) => Promise<{ ghl: GhlClient; stripe: StripeClient }>;
  /** healthchecks.io ping; undefined when HEALTHCHECKS_PING_URL is unset */
  ping?: ((slug: 'success' | 'fail') => Promise<void>) | undefined;
  nowMs?: number;
}

export interface NightlySummary {
  tenants: number;
  findings: number;
  totalCents: number;
  failures: Array<{ tenantId: string; error: string }>;
}

export async function runNightlyAudits(deps: NightlyDeps): Promise<NightlySummary> {
  const tenants = await deps.db.query<{ id: string; ghl_company_id: string }>(
    'select id, ghl_company_id from tenants order by id'
  );
  const summary: NightlySummary = { tenants: 0, findings: 0, totalCents: 0, failures: [] };

  for (const tenant of tenants.rows) {
    try {
      const { ghl, stripe } = await deps.clientsFor(tenant);
      const walletRows = await latestWalletRows(deps.db, tenant.id);
      const result = await runAudit({
        tenantId: tenant.id,
        companyId: tenant.ghl_company_id,
        ghl,
        stripe,
        walletRows,
        ...(deps.nowMs !== undefined ? { nowMs: deps.nowMs } : {})
      });
      await persistAuditResult(deps.db, result);
      summary.tenants++;
      summary.findings += result.findings.length;
      summary.totalCents += result.totalCents;
    } catch (err) {
      summary.failures.push({
        tenantId: tenant.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // Ping after the batch: success only when no tenant failed.
  if (deps.ping) {
    await deps.ping(summary.failures.length === 0 ? 'success' : 'fail').catch(() => {
      // A failed ping must never fail the audit itself.
    });
  }
  return summary;
}

/**
 * Default pinger for healthchecks.io. GET <url> signals success; GET
 * <url>/fail signals failure (https://healthchecks.io/docs/http_api/).
 */
export function healthchecksPinger(url: string): (slug: 'success' | 'fail') => Promise<void> {
  return async (slug) => {
    const target = slug === 'success' ? url : `${url}/fail`;
    await fetch(target, { method: 'GET' });
  };
}
