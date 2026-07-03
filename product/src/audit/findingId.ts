import { createHash } from 'node:crypto';
import type { RuleId } from './types.js';

/**
 * Stable finding identity: sha256 of "rule|tenant|entity|period", truncated
 * to 16 hex chars. The same real-world problem keeps the same id across
 * nightly runs, which is what makes cross-run dedupe possible.
 */
export function findingId(rule: RuleId, tenantId: string, entityId: string, period: string): string {
  return createHash('sha256')
    .update(`${rule}|${tenantId}|${entityId}|${period}`)
    .digest('hex')
    .slice(0, 16);
}

/** "2026-07" for a given epoch-ms instant, in UTC. */
export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
