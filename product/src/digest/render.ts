// Digest rendering: templated text plus Slack Block Kit JSON. Deterministic,
// zero LLM involvement — this copy is the product's voice (design doc §2).

import { centsToUsd } from '../audit/findingId.js';
import type { Finding, RuleId } from '../audit/types.js';

export interface DigestInput {
  tenantName: string;
  /** YYYY-MM-DD of the audit run (UTC) */
  runDate: string;
  locationCount: number;
  findings: Finding[];
  newCount: number;
  resolvedCount: number;
}

const RULE_LABELS: Record<RuleId, string> = {
  R1: 'Skipped invoices',
  R2: 'Status mismatches',
  R3: 'Price drift',
  R4: 'Expired trials on free access',
  R5: 'Refund/wallet mismatches',
  R6: 'Paused but still billing'
};

const RULE_ORDER: RuleId[] = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];

function groupByRule(findings: Finding[]): Map<RuleId, Finding[]> {
  const m = new Map<RuleId, Finding[]>();
  for (const rule of RULE_ORDER) {
    const hits = findings.filter((f) => f.rule === rule);
    if (hits.length) m.set(rule, hits);
  }
  return m;
}

export function renderTextDigest(input: DigestInput): string {
  const total = input.findings.reduce((s, f) => s + f.amountCents, 0);
  const lines: string[] = [];
  lines.push(`SubAudit nightly digest — ${input.tenantName} — ${input.runDate}`);
  lines.push('='.repeat(lines[0]?.length ?? 40));
  lines.push(
    `${input.locationCount} sub-accounts audited. ` +
      `${input.findings.length} open finding${input.findings.length === 1 ? '' : 's'}, ` +
      `${centsToUsd(total)} at stake. ` +
      `(${input.newCount} new, ${input.resolvedCount} resolved since last run)`
  );
  lines.push('');

  if (input.findings.length === 0) {
    lines.push('All clear. Every sub-account reconciles.');
    return lines.join('\n');
  }

  for (const [rule, hits] of groupByRule(input.findings)) {
    const subtotal = hits.reduce((s, f) => s + f.amountCents, 0);
    lines.push(`[${rule}] ${RULE_LABELS[rule]} — ${hits.length} — ${centsToUsd(subtotal)}`);
    for (const f of hits) {
      lines.push(`  • ${f.detail}`);
    }
    lines.push('');
  }
  lines.push('Reply to this digest or open the dashboard for evidence details.');
  return lines.join('\n');
}

/** Slack Block Kit (https://api.slack.com/block-kit) message payload. */
export function renderBlockKitDigest(input: DigestInput): Record<string, unknown> {
  const total = input.findings.reduce((s, f) => s + f.amountCents, 0);
  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `SubAudit digest — ${input.runDate}`, emoji: false }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${input.tenantName}*: ${input.locationCount} sub-accounts audited, ` +
          `*${input.findings.length}* open findings, *${centsToUsd(total)}* at stake.\n` +
          `${input.newCount} new · ${input.resolvedCount} resolved since last run`
      }
    }
  ];

  if (input.findings.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: ':white_check_mark: All clear. Every sub-account reconciles.' }
    });
  } else {
    for (const [rule, hits] of groupByRule(input.findings)) {
      const subtotal = hits.reduce((s, f) => s + f.amountCents, 0);
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*${rule} · ${RULE_LABELS[rule]}* — ${hits.length} — ${centsToUsd(subtotal)}\n` +
            hits.map((f) => `• ${f.detail}`).join('\n')
        }
      });
    }
  }

  return { blocks };
}
