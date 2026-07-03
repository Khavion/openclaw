#!/usr/bin/env node
// Lints ops/tasks/*.md frontmatter: required keys, allowed values, unique ids.
// Exits non-zero listing problems. No dependencies.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tasks');
const OWNERS = new Set(['VA', 'agent', 'founder', 'claude-code']);
const STATES = new Set(['NEW', 'DOING', 'BLOCKED', 'REVIEW', 'DONE']);
const problems = [];
const seen = new Set();

const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
for (const f of files) {
  const text = readFileSync(path.join(dir, f), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) { problems.push(`${f}: missing frontmatter`); continue; }
  const fm = Object.fromEntries(
    m[1].split('\n').map((l) => {
      const idx = l.indexOf(':');
      return idx === -1 ? [l.trim(), ''] : [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
  );
  for (const key of ['id', 'owner', 'state', 'gate', 'due']) {
    if (!(key in fm)) problems.push(`${f}: missing "${key}"`);
  }
  if (fm.id) {
    if (!/^T-\d{3}$/.test(fm.id)) problems.push(`${f}: id "${fm.id}" not T-nnn`);
    if (seen.has(fm.id)) problems.push(`${f}: duplicate id ${fm.id}`);
    seen.add(fm.id);
  }
  if (fm.owner && !OWNERS.has(fm.owner)) problems.push(`${f}: owner "${fm.owner}" invalid`);
  if (fm.state && !STATES.has(fm.state)) problems.push(`${f}: state "${fm.state}" invalid`);
  if (fm.gate && fm.gate !== 'none' && !/^G[1-7]$/.test(fm.gate)) problems.push(`${f}: gate "${fm.gate}" invalid`);
  if (fm.due && fm.due !== 'none' && !/^\d{4}-\d{2}-\d{2}$/.test(fm.due)) problems.push(`${f}: due "${fm.due}" invalid`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`tasks OK: ${files.length} files`);
