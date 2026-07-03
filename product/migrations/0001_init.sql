-- SubAudit initial schema. Plain SQL, applied by src/db/migrate.ts.

create table if not exists tenants (
  id            text primary key,
  name          text not null,
  ghl_company_id text not null,
  -- libsodium secretbox blobs (see src/web/crypto.ts); null until connected
  ghl_tokens_enc     bytea,
  stripe_key_enc     bytea,
  created_at    timestamptz not null default now()
);

create table if not exists audit_runs (
  id            bigint generated always as identity primary key,
  tenant_id     text not null references tenants(id) on delete cascade,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  location_count integer not null default 0,
  findings_count integer not null default 0,
  total_cents   bigint not null default 0
);

create table if not exists findings (
  id            text primary key,          -- sha256(rule|tenant|entity|period) truncated
  tenant_id     text not null references tenants(id) on delete cascade,
  rule          text not null check (rule in ('R1','R2','R3','R4','R5','R6')),
  entity_id     text not null,             -- locationId
  period        text not null,             -- e.g. 2026-06
  amount_cents  bigint not null,
  currency      text not null,
  title         text not null,
  detail        text not null,
  evidence      jsonb not null default '{}',
  status        text not null default 'open' check (status in ('open','resolved')),
  first_seen_at timestamptz not null,
  last_seen_at  timestamptz not null,
  run_count     integer not null default 1
);

create index if not exists findings_tenant_status_idx on findings (tenant_id, status);
create index if not exists findings_tenant_rule_idx on findings (tenant_id, rule);

-- wallet CSV uploads (R5 input), kept for audit trail and re-runs
create table if not exists wallet_uploads (
  id            bigint generated always as identity primary key,
  tenant_id     text not null references tenants(id) on delete cascade,
  uploaded_at   timestamptz not null default now(),
  row_count     integer not null,
  error_count   integer not null,
  rows          jsonb not null               -- parsed WalletCsvRow[]
);
