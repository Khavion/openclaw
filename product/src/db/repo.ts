// Persistence for tenants, audit runs, and findings, including the cross-run
// dedupe contract: a finding with a known id gets its last_seen_at bumped and
// run_count incremented; findings not re-raised in the latest run flip to
// "resolved"; a resolved finding that reappears reopens.

import type pg from 'pg';
import type { AuditResult } from '../audit/engine.js';
import type { Finding, WalletCsvRow } from '../audit/types.js';

export interface TenantRow {
  id: string;
  name: string;
  ghl_company_id: string;
}

export async function upsertTenant(db: pg.Pool, t: TenantRow): Promise<void> {
  await db.query(
    `insert into tenants (id, name, ghl_company_id)
     values ($1, $2, $3)
     on conflict (id) do update set name = excluded.name, ghl_company_id = excluded.ghl_company_id`,
    [t.id, t.name, t.ghl_company_id]
  );
}

export async function saveStripeKey(db: pg.Pool, tenantId: string, enc: Buffer): Promise<void> {
  await db.query('update tenants set stripe_key_enc = $2 where id = $1', [tenantId, enc]);
}

export async function saveGhlTokens(db: pg.Pool, tenantId: string, enc: Buffer): Promise<void> {
  await db.query('update tenants set ghl_tokens_enc = $2 where id = $1', [tenantId, enc]);
}

export async function saveWalletUpload(
  db: pg.Pool,
  tenantId: string,
  rows: WalletCsvRow[],
  errorCount: number
): Promise<number> {
  const res = await db.query<{ id: number }>(
    `insert into wallet_uploads (tenant_id, row_count, error_count, rows)
     values ($1, $2, $3, $4) returning id`,
    [tenantId, rows.length, errorCount, JSON.stringify(rows)]
  );
  return res.rows[0]?.id ?? -1;
}

export async function latestWalletRows(db: pg.Pool, tenantId: string): Promise<WalletCsvRow[]> {
  const res = await db.query<{ rows: WalletCsvRow[] }>(
    `select rows from wallet_uploads where tenant_id = $1 order by uploaded_at desc limit 1`,
    [tenantId]
  );
  return res.rows[0]?.rows ?? [];
}

/**
 * Persist one audit run and its findings. Returns counts for the digest.
 */
export async function persistAuditResult(
  db: pg.Pool,
  result: AuditResult
): Promise<{ runId: number; newCount: number; resolvedCount: number }> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const ranAt = new Date(result.ranAtMs);
    const runRes = await client.query<{ id: number }>(
      `insert into audit_runs (tenant_id, started_at, finished_at, location_count, findings_count, total_cents)
       values ($1, $2, now(), $3, $4, $5) returning id`,
      [result.tenantId, ranAt, result.locationCount, result.findings.length, result.totalCents]
    );
    const runId = runRes.rows[0]?.id ?? -1;

    let newCount = 0;
    for (const f of result.findings) {
      const res = await client.query<{ inserted: boolean }>(
        `insert into findings
           (id, tenant_id, rule, entity_id, period, amount_cents, currency, title, detail, evidence,
            status, first_seen_at, last_seen_at, run_count)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,$11,1)
         on conflict (id) do update set
           amount_cents = excluded.amount_cents,
           detail = excluded.detail,
           evidence = excluded.evidence,
           status = 'open',
           last_seen_at = excluded.last_seen_at,
           run_count = findings.run_count + 1
         returning (xmax = 0) as inserted`,
        [
          f.id,
          f.tenantId,
          f.rule,
          f.entityId,
          f.period,
          f.amountCents,
          f.currency,
          f.title,
          f.detail,
          JSON.stringify(f.evidence),
          ranAt
        ]
      );
      if (res.rows[0]?.inserted) newCount++;
    }

    // Anything open that this run did not re-raise is considered resolved.
    const resolved = await client.query(
      `update findings set status = 'resolved'
       where tenant_id = $1 and status = 'open' and last_seen_at < $2`,
      [result.tenantId, ranAt]
    );

    await client.query('commit');
    return { runId, newCount, resolvedCount: resolved.rowCount ?? 0 };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/** Wipe a tenant's runs/findings/uploads. Used by the demo for idempotent output and by tests. */
export async function resetTenant(db: pg.Pool, tenantId: string): Promise<void> {
  await db.query('delete from findings where tenant_id = $1', [tenantId]);
  await db.query('delete from audit_runs where tenant_id = $1', [tenantId]);
  await db.query('delete from wallet_uploads where tenant_id = $1', [tenantId]);
}

export interface StoredFinding extends Finding {
  status: 'open' | 'resolved';
  runCount: number;
}

export async function openFindings(db: pg.Pool, tenantId: string): Promise<StoredFinding[]> {
  const res = await db.query(
    `select id, tenant_id, rule, entity_id, period, amount_cents, currency, title, detail,
            evidence, status, run_count
     from findings where tenant_id = $1 and status = 'open'
     order by rule, entity_id, period`,
    [tenantId]
  );
  return res.rows.map((r) => ({
    id: r.id as string,
    rule: r.rule as StoredFinding['rule'],
    tenantId: r.tenant_id as string,
    entityId: r.entity_id as string,
    period: r.period as string,
    amountCents: Number(r.amount_cents),
    currency: r.currency as string,
    title: r.title as string,
    detail: r.detail as string,
    evidence: r.evidence as Record<string, unknown>,
    status: r.status as StoredFinding['status'],
    runCount: Number(r.run_count)
  }));
}
