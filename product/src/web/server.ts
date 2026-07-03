// SubAudit web app (minimal, per M5): health, GHL OAuth install/callback,
// tenant model, encrypted Stripe-key entry, R5 CSV upload with row-level
// error reporting, findings list page. No dashboard beyond that. Read-only
// product: nothing here writes to GHL or Stripe.

import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadConfig, type AppConfig } from '../config.js';
import { parseWalletCsv } from '../audit/csv.js';
import { centsToUsd } from '../audit/findingId.js';
import { RealGhlClient } from '../adapters/ghl/real.js';
import { getPool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';
import {
  openFindings,
  saveGhlTokens,
  saveStripeKey,
  saveWalletUpload,
  upsertTenant
} from '../db/repo.js';
import { encryptSecret } from './crypto.js';
import type pg from 'pg';

// GHL OAuth authorize URL template, verified against
// https://github.com/GoHighLevel/highlevel-api-docs/blob/main/docs/oauth/Authorization.md
// ("Get the app's Authorization Page URL", standard flow).
const GHL_AUTHORIZE_URL = 'https://marketplace.gohighlevel.com/v2/oauth/chooselocation';

// Read scopes SubAudit requests (docs/oauth/Scopes.md; SaaS public-api scope
// naming is confirmed empirically by scripts/verify-ghl-api.ts in Stage 0).
export const GHL_SCOPES = [
  'oauth.readonly',
  'oauth.write',
  'saas/location.read',
  'saas/company.read',
  'payments/subscriptions.readonly',
  'payments/transactions.readonly',
  'invoices.readonly'
].join(' ');

export interface BuildServerOptions {
  cfg?: AppConfig;
  db?: pg.Pool;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const cfg = opts.cfg ?? loadConfig();
  const db = opts.db ?? getPool(cfg.DATABASE_URL);
  const app = Fastify({ logger: false });

  app.get('/health', async () => {
    await db.query('select 1');
    return { ok: true, mode: cfg.APP_MODE };
  });

  // --- GHL OAuth install flow -------------------------------------------
  // GET /oauth/install redirects the agency admin to the marketplace
  // authorization page. In mock mode it short-circuits straight to the
  // callback with a mock code so the flow is exercisable offline.
  app.get('/oauth/install', async (_req, reply) => {
    if (cfg.APP_MODE === 'mock') {
      return reply.redirect(`/oauth/callback?code=mock-auth-code`);
    }
    if (!cfg.GHL_CLIENT_ID) {
      return reply.code(500).send({ error: 'GHL_CLIENT_ID not configured' });
    }
    const q = new URLSearchParams({
      response_type: 'code',
      redirect_uri: cfg.GHL_REDIRECT_URI,
      client_id: cfg.GHL_CLIENT_ID,
      scope: GHL_SCOPES
    });
    return reply.redirect(`${GHL_AUTHORIZE_URL}?${q}`);
  });

  // GET /oauth/callback?code=... exchanges the authorization code for a
  // Company token (POST /oauth/token, apps/oauth.json) and stores it
  // encrypted. Mock mode fabricates tokens for the fixture agency.
  app.get('/oauth/callback', async (req, reply) => {
    const query = z.object({ code: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'missing ?code' });

    if (cfg.APP_MODE === 'mock') {
      if (query.data.code !== 'mock-auth-code') {
        return reply.code(400).send({ error: 'unknown mock code' });
      }
      const tenantId = 'tenant_demo';
      await upsertTenant(db, {
        id: tenantId,
        name: 'Khavion Demo Agency',
        ghl_company_id: 'comp_khavion_demo'
      });
      const tokens = {
        accessToken: 'mock-agency-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 86_400_000,
        companyId: 'comp_khavion_demo'
      };
      await saveGhlTokens(
        db,
        tenantId,
        await encryptSecret(JSON.stringify(tokens), cfg.KHAVION_MASTER_KEY)
      );
      return { ok: true, tenantId, mode: 'mock' };
    }

    if (!cfg.GHL_CLIENT_ID || !cfg.GHL_CLIENT_SECRET) {
      return reply.code(500).send({ error: 'GHL client credentials not configured' });
    }
    const res = await RealGhlClient.exchangeAuthCode({
      clientId: cfg.GHL_CLIENT_ID,
      clientSecret: cfg.GHL_CLIENT_SECRET,
      code: query.data.code,
      redirectUri: cfg.GHL_REDIRECT_URI,
      userType: 'Company'
    });
    const companyId = res.companyId;
    if (!companyId) return reply.code(502).send({ error: 'token response missing companyId' });
    const tenantId = `tenant_${companyId}`;
    await upsertTenant(db, { id: tenantId, name: companyId, ghl_company_id: companyId });
    const tokens = {
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? '',
      expiresAt: Date.now() + res.expires_in * 1000,
      companyId
    };
    await saveGhlTokens(
      db,
      tenantId,
      await encryptSecret(JSON.stringify(tokens), cfg.KHAVION_MASTER_KEY)
    );
    return { ok: true, tenantId };
  });

  // --- Stripe restricted key entry (stored encrypted, never logged) -------
  app.post('/tenants/:tenantId/stripe-key', async (req, reply) => {
    const params = z.object({ tenantId: z.string().min(1) }).parse(req.params);
    const body = z
      .object({ restrictedKey: z.string().regex(/^rk_(test|live)_/, 'must be a restricted key (rk_...)') })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'invalid body' });
    }
    const exists = await db.query('select 1 from tenants where id = $1', [params.tenantId]);
    if (exists.rowCount === 0) return reply.code(404).send({ error: 'unknown tenant' });
    await saveStripeKey(
      db,
      params.tenantId,
      await encryptSecret(body.data.restrictedKey, cfg.KHAVION_MASTER_KEY)
    );
    return { ok: true };
  });

  // --- R5 wallet CSV upload ------------------------------------------------
  // text/csv body; zod-validated per row; row-level errors reported back.
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_req, body, done) =>
    done(null, body)
  );
  app.post('/tenants/:tenantId/wallet-csv', async (req, reply) => {
    const params = z.object({ tenantId: z.string().min(1) }).parse(req.params);
    if (typeof req.body !== 'string' || req.body.length === 0) {
      return reply.code(400).send({ error: 'send the CSV file as a text/csv body' });
    }
    const exists = await db.query('select 1 from tenants where id = $1', [params.tenantId]);
    if (exists.rowCount === 0) return reply.code(404).send({ error: 'unknown tenant' });

    const { rows, errors } = parseWalletCsv(req.body);
    if (rows.length === 0) {
      return reply.code(422).send({ ok: false, accepted: 0, errors });
    }
    const uploadId = await saveWalletUpload(db, params.tenantId, rows, errors.length);
    return { ok: true, uploadId, accepted: rows.length, errors };
  });

  // --- Findings list (plain page, no dashboard) ---------------------------
  app.get('/tenants/:tenantId/findings', async (req, reply) => {
    const params = z.object({ tenantId: z.string().min(1) }).parse(req.params);
    const findings = await openFindings(db, params.tenantId);
    const total = findings.reduce((s, f) => s + f.amountCents, 0);
    const rows = findings
      .map(
        (f) =>
          `<tr><td>${f.rule}</td><td>${f.entityId}</td><td>${f.period}</td>` +
          `<td>${centsToUsd(f.amountCents)}</td><td>${escapeHtml(f.title)}</td><td>${f.runCount}</td></tr>`
      )
      .join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>SubAudit findings</title>
<style>body{font-family:system-ui;margin:2rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left}</style>
</head><body>
<h1>Open findings — ${escapeHtml(params.tenantId)}</h1>
<p>${findings.length} open, ${centsToUsd(total)} at stake.</p>
<table><tr><th>Rule</th><th>Location</th><th>Period</th><th>Amount</th><th>Title</th><th>Seen in runs</th></tr>
${rows}
</table></body></html>`;
    return reply.type('text/html').send(html);
  });

  return app;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Entrypoint: `npm run web`
const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  const { default: dotenv } = await import('dotenv');
  dotenv.config();
  const cfg = loadConfig();
  await migrate(cfg.DATABASE_URL);
  const app = await buildServer({ cfg });
  await app.listen({ port: cfg.PORT, host: '127.0.0.1' });
  console.log(`SubAudit listening on http://127.0.0.1:${cfg.PORT} (${cfg.APP_MODE} mode)`);
}
