// Parser for the GHL billing/wallet CSV export consumed by rule R5 and the
// upload endpoint. Column format is documented in fixtures/README.md; the
// live export format gets confirmed in Stage 0 (docs/DEVIATIONS.md).
// Every row is zod-validated; bad rows are reported with their line number
// instead of aborting the whole file.

import { z } from 'zod';
import type { WalletCsvRow } from './types.js';

const RowSchema = z.object({
  location_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  type: z.enum(['wallet_charge', 'wallet_credit']),
  description: z.string(),
  amount: z
    .string()
    .regex(/^-?\d+(\.\d{1,2})?$/, 'amount must be a decimal number')
    .transform((s) => Math.round(parseFloat(s) * 100)),
  currency: z.string().min(3).max(3)
});

export interface CsvRowError {
  line: number; // 1-based, counting the header as line 1
  message: string;
}

export interface WalletCsvParseResult {
  rows: WalletCsvRow[];
  errors: CsvRowError[];
}

const EXPECTED_HEADER = ['location_id', 'date', 'type', 'description', 'amount', 'currency'];

/**
 * Minimal RFC-4180-ish parser: handles quoted fields with embedded commas and
 * doubled quotes. Enough for a machine-generated billing export; anything
 * malformed lands in `errors` with its line number.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseWalletCsv(content: string): WalletCsvParseResult {
  const rows: WalletCsvRow[] = [];
  const errors: CsvRowError[] = [];
  const lines = content.split(/\r?\n/).filter((l, i) => l.trim() !== '' || i === 0);

  const headerLine = lines[0];
  if (!headerLine) {
    return { rows, errors: [{ line: 1, message: 'empty file' }] };
  }
  const header = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase());
  if (JSON.stringify(header) !== JSON.stringify(EXPECTED_HEADER)) {
    return {
      rows,
      errors: [
        {
          line: 1,
          message: `unexpected header: got "${header.join(',')}", expected "${EXPECTED_HEADER.join(',')}"`
        }
      ]
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined || raw.trim() === '') continue;
    const cells = splitCsvLine(raw);
    if (cells.length !== EXPECTED_HEADER.length) {
      errors.push({ line: i + 1, message: `expected ${EXPECTED_HEADER.length} columns, got ${cells.length}` });
      continue;
    }
    const candidate = Object.fromEntries(EXPECTED_HEADER.map((h, idx) => [h, cells[idx] ?? '']));
    const parsed = RowSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      errors.push({
        line: i + 1,
        message: `${first?.path.join('.') ?? 'row'}: ${first?.message ?? 'invalid'}`
      });
      continue;
    }
    rows.push({
      locationId: parsed.data.location_id,
      date: parsed.data.date,
      type: parsed.data.type,
      description: parsed.data.description,
      amountCents: parsed.data.amount,
      currency: parsed.data.currency.toLowerCase()
    });
  }
  return { rows, errors };
}
