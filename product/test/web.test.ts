// Web app tests via fastify.inject — no ports, no network.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/web/server.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { resetTenant, upsertTenant } from '../src/db/repo.js';
import { decryptSecret, encryptSecret } from '../src/web/crypto.js';

const KEY = 'a'.repeat(64);
const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://localhost:5432/khavion_test';

let app: FastifyInstance;

beforeAll(async () => {
  await migrate(DB_URL);
  const cfg = loadConfig({
    KHAVION_MASTER_KEY: KEY,
    DATABASE_URL: DB_URL,
    APP_MODE: 'mock'
  });
  const db = getPool(DB_URL);
  app = await buildServer({ cfg, db });
  await upsertTenant(db, { id: 'tenant_web', name: 'Web Test', ghl_company_id: 'comp_w' });
  await resetTenant(db, 'tenant_web');
});

afterAll(async () => {
  await app.close();
  await closePool();
});

describe('crypto', () => {
  it('round-trips a secret and rejects a bad key', async () => {
    const blob = await encryptSecret('rk_test_secret', KEY);
    expect(await decryptSecret(blob, KEY)).toBe('rk_test_secret');
    await expect(decryptSecret(blob, 'b'.repeat(64))).rejects.toThrow();
  });

  it('produces a different ciphertext per call (fresh nonce)', async () => {
    const a = await encryptSecret('same', KEY);
    const b = await encryptSecret('same', KEY);
    expect(a.equals(b)).toBe(false);
  });
});

describe('web app', () => {
  it('GET /health is ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, mode: 'mock' });
  });

  it('mock OAuth flow: install redirects to callback which provisions the demo tenant', async () => {
    const install = await app.inject({ method: 'GET', url: '/oauth/install' });
    expect(install.statusCode).toBe(302);
    const location = install.headers.location as string;
    expect(location).toBe('/oauth/callback?code=mock-auth-code');
    const cb = await app.inject({ method: 'GET', url: location });
    expect(cb.statusCode).toBe(200);
    expect(cb.json()).toMatchObject({ ok: true, tenantId: 'tenant_demo', mode: 'mock' });
  });

  it('callback without a code is a 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/oauth/callback' });
    expect(res.statusCode).toBe(400);
  });

  it('stores a Stripe restricted key encrypted, rejects secret keys', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/tenants/tenant_web/stripe-key',
      payload: { restrictedKey: 'rk_test_abc123' }
    });
    expect(ok.statusCode).toBe(200);

    const db = getPool(DB_URL);
    const row = await db.query<{ stripe_key_enc: Buffer }>(
      'select stripe_key_enc from tenants where id = $1',
      ['tenant_web']
    );
    const enc = row.rows[0]?.stripe_key_enc;
    expect(enc).toBeInstanceOf(Buffer);
    expect(enc?.includes('rk_test_abc123')).toBe(false); // not plaintext
    expect(await decryptSecret(enc as Buffer, KEY)).toBe('rk_test_abc123');

    const bad = await app.inject({
      method: 'POST',
      url: '/tenants/tenant_web/stripe-key',
      payload: { restrictedKey: 'sk_live_dangerous' }
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain('restricted');
  });

  it('404s a stripe key for an unknown tenant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tenants/tenant_missing/stripe-key',
      payload: { restrictedKey: 'rk_test_abc' }
    });
    expect(res.statusCode).toBe(404);
  });

  it('accepts a wallet CSV and reports row-level errors', async () => {
    const csv = [
      'location_id,date,type,description,amount,currency',
      'loc_1,2026-06-01,wallet_credit,ok,10.00,usd',
      'loc_2,BAD,wallet_credit,broken date,5.00,usd'
    ].join('\n');
    const res = await app.inject({
      method: 'POST',
      url: '/tenants/tenant_web/wallet-csv',
      headers: { 'content-type': 'text/csv' },
      payload: csv
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].line).toBe(3);
  });

  it('rejects a CSV with zero valid rows as 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tenants/tenant_web/wallet-csv',
      headers: { 'content-type': 'text/csv' },
      payload: 'totally,wrong,header\n1,2,3'
    });
    expect(res.statusCode).toBe(422);
  });

  it('serves the findings page', async () => {
    const res = await app.inject({ method: 'GET', url: '/tenants/tenant_web/findings' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Open findings — tenant_web');
  });
});
