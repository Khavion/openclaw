#!/usr/bin/env node
// Validates ops/research/pain-log.csv: header intact, 8 columns per row,
// category in the allowed set, severity 1-3. Exits non-zero with line
// numbers on problems. No dependencies.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'research', 'pain-log.csv');
const HEADER = 'date,source,link,author_role,pain_category,quote,severity_1to3,notes';
const CATS = new Set(['rebilling','reconciliation','wallet','invoices','trials','pausing','pricing','reporting','other']);

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l !== '');
const problems = [];
if (lines[0] !== HEADER) problems.push(`line 1: header must be exactly "${HEADER}"`);
lines.slice(1).forEach((line, i) => {
  const n = i + 2;
  const cells = splitCsv(line);
  if (cells.length !== 8) { problems.push(`line ${n}: ${cells.length} columns, need 8`); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) problems.push(`line ${n}: date "${cells[0]}" not YYYY-MM-DD`);
  if (!CATS.has(cells[4])) problems.push(`line ${n}: pain_category "${cells[4]}" not in allowed set`);
  if (!['1','2','3'].includes(cells[6])) problems.push(`line ${n}: severity "${cells[6]}" must be 1, 2, or 3`);
});
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`pain-log.csv OK: ${lines.length - 1} rows`);
