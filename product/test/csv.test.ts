import { describe, expect, it } from 'vitest';
import { parseWalletCsv } from '../src/audit/csv.js';

const HEADER = 'location_id,date,type,description,amount,currency';

describe('parseWalletCsv', () => {
  it('parses valid rows including quoted descriptions with commas', () => {
    const { rows, errors } = parseWalletCsv(
      [HEADER, 'loc_1,2026-06-01,wallet_credit,"Refund, June",50.00,usd'].join('\n')
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        locationId: 'loc_1',
        date: '2026-06-01',
        type: 'wallet_credit',
        description: 'Refund, June',
        amountCents: 5000,
        currency: 'usd'
      }
    ]);
  });

  it('reports row-level errors with line numbers and keeps good rows', () => {
    const { rows, errors } = parseWalletCsv(
      [
        HEADER,
        'loc_1,2026-06-01,wallet_charge,ok,10.00,usd',
        'loc_2,junk-date,wallet_credit,bad date,5.00,usd',
        'loc_3,2026-06-02,not_a_type,bad type,5.00,usd',
        'loc_4,2026-06-03,wallet_credit,bad amount,abc,usd',
        'loc_5,2026-06-04,wallet_credit,too few cols'
      ].join('\n')
    );
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(errors[0]?.message).toContain('date');
  });

  it('rejects a wrong header outright', () => {
    const { rows, errors } = parseWalletCsv('foo,bar\n1,2');
    expect(rows).toEqual([]);
    expect(errors[0]?.line).toBe(1);
    expect(errors[0]?.message).toContain('unexpected header');
  });

  it('handles an empty file', () => {
    const { errors } = parseWalletCsv('');
    expect(errors[0]?.message).toBe('empty file');
  });

  it('parses the committed fixture export cleanly', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const content = await readFile(
      path.join(here, '..', 'fixtures', 'csv', 'ghl-billing-export.csv'),
      'utf8'
    );
    const { rows, errors } = parseWalletCsv(content);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(4);
  });
});
