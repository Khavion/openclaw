// pg-boss wiring for the nightly audit (design doc §2: pg-boss, no Redis).
// Schedule: 01:30 UTC nightly. The queue lives in the same Postgres.

import PgBoss from 'pg-boss';
import type pg from 'pg';
import type { AppConfig } from '../config.js';
import { healthchecksPinger, runNightlyAudits, type NightlyDeps } from './nightly.js';

export const NIGHTLY_QUEUE = 'nightly-audit';

export async function startNightlySchedule(
  cfg: AppConfig,
  db: pg.Pool,
  clientsFor: NightlyDeps['clientsFor']
): Promise<PgBoss> {
  const boss = new PgBoss(cfg.DATABASE_URL);
  await boss.start();
  await boss.createQueue(NIGHTLY_QUEUE);
  // cron in UTC; 01:30 keeps clear of most tenants' Stripe daily settling
  await boss.schedule(NIGHTLY_QUEUE, '30 1 * * *', {}, { tz: 'UTC' });
  await boss.work(NIGHTLY_QUEUE, async () => {
    const ping = cfg.HEALTHCHECKS_PING_URL
      ? healthchecksPinger(cfg.HEALTHCHECKS_PING_URL)
      : undefined;
    const summary = await runNightlyAudits({ db, clientsFor, ping });
    if (summary.failures.length > 0) {
      // Surface in pg-boss job output/logs; ops-triage reads #ops-alerts.
      throw new Error(
        `nightly audit had failures: ${summary.failures.map((f) => `${f.tenantId}: ${f.error}`).join('; ')}`
      );
    }
  });
  return boss;
}
