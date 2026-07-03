// Stage 0 GHL API verification — `npm run verify:ghl`
//
// Purpose (design doc §9): before any product build against live APIs,
// prove the sandbox actually returns what rules R1-R4 need, and record what
// wallet/transaction-history data is or is not reachable (R5).
//
// Prereqs: the human checklist in README-OPERATIONS.md ("Before you run the
// verify script") — developer account, Private marketplace app, scopes,
// redirect http://localhost:3000/oauth/callback, SaaS-enabled sandbox, and
// GHL_CLIENT_ID / GHL_CLIENT_SECRET in product/.env.
//
// Flow: local OAuth (docs/oauth/Authorization.md authorization-code flow) ->
// exercises each endpoint (all citations in-line below) -> writes
// docs/STAGE0-API-REPORT.md with PASS/FAIL per data need.
//
// All doc-path citations below (apps/*.json, docs/oauth/*.md) resolve under
// https://github.com/GoHighLevel/highlevel-api-docs (official specs,
// fetched 2026-07-02); the endpoints run against the servers[] base
// https://services.leadconnectorhq.com declared in those specs.
//
// This script is read-only against GHL and sends nothing anywhere else.

import 'dotenv/config';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RealGhlClient, type GhlTokens } from '../product/src/adapters/ghl/real.js';
import { GHL_SCOPES } from '../product/src/web/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(here, '..', 'docs', 'STAGE0-API-REPORT.md');

const BASE = 'https://services.leadconnectorhq.com';
const CLIENT_ID = process.env['GHL_CLIENT_ID'] ?? '';
const CLIENT_SECRET = process.env['GHL_CLIENT_SECRET'] ?? '';
const REDIRECT_URI = process.env['GHL_REDIRECT_URI'] ?? 'http://localhost:3000/oauth/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'GHL_CLIENT_ID and GHL_CLIENT_SECRET must be set in product/.env.\n' +
      'Follow README-OPERATIONS.md "Before you run the verify script" first.'
  );
  process.exit(1);
}

interface CheckResult {
  name: string;
  endpoint: string;
  status: number | 'ERROR';
  ok: boolean;
  note: string;
  fieldNames?: string[];
}

const results: CheckResult[] = [];

function record(r: CheckResult): void {
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} [${r.status}] ${r.note}`);
}

async function rawGet(
  url: string,
  token: string,
  version: string
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Version: version }
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  return { status: res.status, body };
}

function topLevelKeys(body: unknown): string[] {
  if (body && typeof body === 'object' && !Array.isArray(body)) return Object.keys(body);
  if (Array.isArray(body) && body[0] && typeof body[0] === 'object')
    return Object.keys(body[0] as object);
  return [];
}

// --- Step 1: local OAuth flow -------------------------------------------
// Authorize URL per docs/oauth/Authorization.md ("standard Auth URL flow"):
// https://marketplace.gohighlevel.com/v2/oauth/chooselocation?...
const authorizeUrl =
  'https://marketplace.gohighlevel.com/v2/oauth/chooselocation?' +
  new URLSearchParams({
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    scope: GHL_SCOPES
  }).toString();

console.log('\n=== Stage 0 GHL API verification ===\n');
console.log('1. Open this URL in your browser, sign in as the SANDBOX agency admin,');
console.log('   and choose the sandbox agency to install the app:\n');
console.log(authorizeUrl);
console.log('\n2. Waiting on http://localhost:3000/oauth/callback ...\n');

const code = await new Promise<string>((resolve, reject) => {
  const url = new URL(REDIRECT_URI);
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', `http://${url.host}`);
    if (u.pathname !== url.pathname) {
      res.writeHead(404).end();
      return;
    }
    const c = u.searchParams.get('code');
    if (!c) {
      res.writeHead(400).end('missing ?code');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' }).end(
      'Code received. Return to the terminal — the verification is running.'
    );
    server.close();
    resolve(c);
  });
  server.on('error', reject);
  server.listen(Number(url.port || 80), '127.0.0.1');
  // Give the human 10 minutes, then bail with guidance.
  setTimeout(() => {
    server.close();
    reject(new Error('timed out after 10 minutes waiting for the OAuth callback'));
  }, 600_000).unref();
});

// Exchange authorization code for a Company token:
// POST /oauth/token (apps/oauth.json GetAccessCodebodyDto).
const tokenRes = await RealGhlClient.exchangeAuthCode({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  code,
  redirectUri: REDIRECT_URI,
  userType: 'Company'
});
const companyId = tokenRes.companyId ?? '';
record({
  name: 'OAuth code exchange (Company token)',
  endpoint: 'POST /oauth/token',
  status: 200,
  ok: Boolean(tokenRes.access_token && companyId),
  note: companyId ? `companyId=${companyId}` : 'no companyId on response — agency install?'
});
if (!companyId) {
  await writeReport();
  process.exit(1);
}

const tokens: GhlTokens = {
  accessToken: tokenRes.access_token,
  refreshToken: tokenRes.refresh_token ?? '',
  expiresAt: Date.now() + tokenRes.expires_in * 1000,
  companyId
};
const agencyToken = tokens.accessToken;

// --- Step 2: agency-level SaaS endpoints ---------------------------------
// GET /saas-api/public-api/agency-plans/{companyId} (apps/saas-api.json,
// Version 2021-04-15).
{
  const { status, body } = await rawGet(
    `${BASE}/saas-api/public-api/agency-plans/${companyId}`,
    agencyToken,
    '2021-04-15'
  );
  const plans = Array.isArray(body) ? body : [];
  record({
    name: 'Agency SaaS plans (R3 needs prices)',
    endpoint: 'GET /saas-api/public-api/agency-plans/{companyId}',
    status,
    ok: status === 200 && plans.length > 0,
    note:
      status === 200
        ? `${plans.length} plan(s); first has prices: ${JSON.stringify((plans[0] as { prices?: unknown })?.prices !== undefined)}`
        : String(JSON.stringify(body)).slice(0, 120),
    fieldNames: topLevelKeys(plans[0])
  });
}

// GET /saas-api/public-api/saas-locations/{companyId}?page=1 (pagination).
let firstLocationId = '';
{
  const { status, body } = await rawGet(
    `${BASE}/saas-api/public-api/saas-locations/${companyId}?page=1`,
    agencyToken,
    '2021-04-15'
  );
  const b = body as { locations?: Array<{ locationId?: string }>; pagination?: unknown };
  firstLocationId = b?.locations?.[0]?.locationId ?? '';
  record({
    name: 'SaaS locations list with pagination (R1-R4 base)',
    endpoint: 'GET /saas-api/public-api/saas-locations/{companyId}?page=N',
    status,
    ok: status === 200 && Array.isArray(b?.locations) && b?.pagination !== undefined,
    note:
      status === 200
        ? `${b?.locations?.length ?? 0} location(s) on page 1; pagination present: ${b?.pagination !== undefined}`
        : String(JSON.stringify(body)).slice(0, 120),
    fieldNames: topLevelKeys(b?.locations?.[0])
  });
}

// GET /saas-api/public-api/get-saas-subscription/{locationId}?companyId= —
// also the probe for the extended fields R2/R4/R6 assume (T-007).
if (firstLocationId) {
  const { status, body } = await rawGet(
    `${BASE}/saas-api/public-api/get-saas-subscription/${firstLocationId}?companyId=${companyId}`,
    agencyToken,
    '2021-04-15'
  );
  const keys = topLevelKeys(body);
  const wanted = ['subscriptionStatus', 'specialPrice', 'trialEndsAt', 'paused', 'pausedAt'];
  const present = wanted.filter((w) => keys.includes(w));
  record({
    name: 'Per-location subscription detail (R2 status, R3 special price, R4 trial, R6 pause)',
    endpoint: 'GET /saas-api/public-api/get-saas-subscription/{locationId}',
    status,
    ok: status === 200,
    note:
      status === 200
        ? `fields present of ${wanted.join('/')}: ${present.join(', ') || 'NONE — update schemas per T-007'}`
        : String(JSON.stringify(body)).slice(0, 120),
    fieldNames: keys
  });
} else {
  record({
    name: 'Per-location subscription detail',
    endpoint: 'GET /saas-api/public-api/get-saas-subscription/{locationId}',
    status: 'ERROR',
    ok: false,
    note: 'skipped — no SaaS location returned; enable SaaS mode on a sandbox sub-account first'
  });
}

// --- Step 3: location-token flow ----------------------------------------
// POST /oauth/locationToken (apps/oauth.json, Version 2021-07-28, scope oauth.write).
let locationToken = '';
if (firstLocationId) {
  const res = await fetch(`${BASE}/oauth/locationToken`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${agencyToken}`,
      Version: '2021-07-28',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ companyId, locationId: firstLocationId })
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string };
  locationToken = body.access_token ?? '';
  record({
    name: 'Location token exchange',
    endpoint: 'POST /oauth/locationToken',
    status: res.status,
    ok: res.status === 200 && Boolean(locationToken),
    note: locationToken ? 'location token minted' : 'no access_token in response'
  });
}

// GET /invoices/?altId&altType=location&limit&offset (apps/invoices.json,
// scope invoices.readonly, Version 2021-07-28).
if (locationToken) {
  const { status, body } = await rawGet(
    `${BASE}/invoices/?altId=${firstLocationId}&altType=location&limit=10&offset=0`,
    locationToken,
    '2021-07-28'
  );
  const b = body as { invoices?: unknown[]; total?: number };
  record({
    name: 'Location invoices (R1 corroboration)',
    endpoint: 'GET /invoices/?altId={locationId}&altType=location',
    status,
    ok: status === 200 && Array.isArray(b?.invoices),
    note: status === 200 ? `total=${b?.total}` : String(JSON.stringify(body)).slice(0, 120)
  });

  // GET /payments/transactions?altId&altType=location (apps/payments.json,
  // scope payments/transactions.readonly) — the transaction history that IS
  // publicly documented.
  const tx = await rawGet(
    `${BASE}/payments/transactions?altId=${firstLocationId}&altType=location&limit=10&offset=0`,
    locationToken,
    '2021-07-28'
  );
  const tb = tx.body as { data?: unknown[]; totalCount?: number };
  record({
    name: 'Location payment transactions (documented history endpoint)',
    endpoint: 'GET /payments/transactions?altId={locationId}&altType=location',
    status: tx.status,
    ok: tx.status === 200 && Array.isArray(tb?.data),
    note: tx.status === 200 ? `totalCount=${tb?.totalCount}` : String(JSON.stringify(tx.body)).slice(0, 120)
  });
}

// --- Step 4: wallet probes (R5) ------------------------------------------
// As of 2026-07-02 the official specs (apps/saas-api.json, apps/payments.json)
// name NO wallet-transaction endpoint; "wallet" appears only inside
// unrelated schema enums. We probe plausible paths anyway and record the
// exact status codes as evidence for the v1 CSV decision.
for (const probe of [
  `/payments/wallet/transactions?altId=${firstLocationId}&altType=location`,
  `/saas-api/public-api/wallet/${firstLocationId}?companyId=${companyId}`,
  `/saas-api/public-api/wallet-transactions/${firstLocationId}?companyId=${companyId}`
]) {
  const token = probe.startsWith('/payments') ? locationToken || agencyToken : agencyToken;
  const version = probe.startsWith('/payments') ? '2021-07-28' : '2021-04-15';
  try {
    const { status } = await rawGet(`${BASE}${probe}`, token, version);
    record({
      name: 'Wallet probe (undocumented path)',
      endpoint: `GET ${probe.split('?')[0]}`,
      status,
      ok: status === 200, // 200 would be a happy surprise worth promoting R5
      note: status === 200 ? 'WALLET DATA REACHABLE — promote R5 off CSV (update T-001)' : 'not available (expected; R5 stays CSV-fed)'
    });
  } catch (err) {
    record({
      name: 'Wallet probe (undocumented path)',
      endpoint: `GET ${probe.split('?')[0]}`,
      status: 'ERROR',
      ok: false,
      note: err instanceof Error ? err.message : String(err)
    });
  }
}

await writeReport();
const failures = results.filter((r) => !r.ok && !r.name.startsWith('Wallet probe'));
console.log(`\nReport written to docs/STAGE0-API-REPORT.md`);
console.log(failures.length === 0 ? 'GATE: all R1-R4 data needs PASS.' : `GATE: ${failures.length} check(s) FAILED — see report.`);
process.exit(failures.length === 0 ? 0 : 1);

async function writeReport(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Stage 0 GHL API Verification Report`);
  lines.push('');
  lines.push(`Run date: ${date}. Generated by \`npm run verify:ghl\` (scripts/verify-ghl-api.ts).`);
  lines.push('');
  lines.push('| Check | Endpoint | HTTP | Result | Note |');
  lines.push('|---|---|---|---|---|');
  for (const r of results) {
    lines.push(
      `| ${r.name} | \`${r.endpoint}\` | ${r.status} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.note.replace(/\|/g, '\\|')} |`
    );
  }
  lines.push('');
  lines.push('## Data-need scoring (rules R1-R4)');
  lines.push('');
  const ok = (name: string) => results.some((r) => r.name.startsWith(name) && r.ok);
  const score = (need: string, pass: boolean, why: string) =>
    lines.push(`- **${need}: ${pass ? 'PASS' : 'FAIL'}** — ${why}`);
  score(
    'R1 (skipped invoices)',
    ok('SaaS locations') && ok('Per-location subscription detail'),
    'needs locations + subscription/customer linkage; Stripe invoices come from the customer key'
  );
  score(
    'R2 (status mismatch)',
    ok('Per-location subscription detail'),
    'needs GHL-side subscriptionStatus per location (see field note above)'
  );
  score(
    'R3 (price drift)',
    ok('Agency SaaS plans') && ok('Per-location subscription detail'),
    'needs plan prices and per-location price/special price'
  );
  score(
    'R4 (expired trials)',
    ok('Per-location subscription detail'),
    'needs trial-end visibility per location (see field note above)'
  );
  lines.push('');
  lines.push('## R5 (wallet) API availability finding');
  lines.push('');
  const walletHit = results.some((r) => r.name.startsWith('Wallet probe') && r.ok);
  lines.push(
    walletHit
      ? 'A wallet probe returned 200 — promote R5 from CSV import to API (update T-001/T-007 and the adapters).'
      : 'No wallet or wallet-transaction endpoint is reachable (statuses above) and none is named in the official specs as of the run date. R5 ships CSV-fed, per the design doc v1 constraint.'
  );
  lines.push('');
  lines.push('## Field inventory (for T-007)');
  lines.push('');
  for (const r of results) {
    if (r.fieldNames?.length) lines.push(`- \`${r.endpoint}\`: ${r.fieldNames.join(', ')}`);
  }
  lines.push('');
  await writeFile(REPORT_PATH, lines.join('\n') + '\n');
}
