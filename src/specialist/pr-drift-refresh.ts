import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { ObservabilitySqliteClient, PrDriftStatePatch } from './observability-sqlite.js';

export type PrClassification = 'clean' | 'needs-rebase' | 'conflicted' | 'blocked' | 'stale' | 'unknown';

export type PrDriftRefreshErrorKind = 'gh_unavailable' | 'no_pr' | 'parse_error' | 'network';

export interface PrDriftRefreshResult {
  ok: boolean;
  classification: PrClassification;
  error_kind?: PrDriftRefreshErrorKind;
  error_summary?: string;
  raw?: Record<string, unknown>;
}

interface GhPrViewJson {
  state?: string;
  mergeable?: string;
  mergeStateStatus?: string;
  baseRefName?: string;
  baseRefOid?: string;
  headRefOid?: string;
  url?: string;
}

function hashSummary(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function parsePrNumberFromUrl(prUrl: string): string | undefined {
  // Handles https://github.com/owner/repo/pull/123 or just 123
  const match = prUrl.match(/\/pull\/(\d+)$/);
  if (match) return match[1];
  if (/^\d+$/.test(prUrl)) return prUrl;
  return undefined;
}

function deriveClassification(raw: GhPrViewJson): PrClassification {
  const mergeState = (raw.mergeStateStatus ?? '').toUpperCase();
  const state = (raw.state ?? '').toLowerCase();

  if (state === 'merged' || state === 'closed') return 'stale';

  switch (mergeState) {
    case 'BEHIND':
      return 'needs-rebase';
    case 'DIRTY':
      return 'conflicted';
    case 'BLOCKED':
      return 'blocked';
    case 'CLEAN':
    case 'HAS_HOOKS':
    case 'UNSTABLE':
      return 'clean';
    default:
      return 'unknown';
  }
}

function classifyError(err: unknown): { kind: PrDriftRefreshErrorKind; summary: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('enoent') || lower.includes('command not found') || lower.includes('no such file')) {
    return { kind: 'gh_unavailable', summary: hashSummary(msg) };
  }
  if (lower.includes('not found') || lower.includes('could not resolve')) {
    return { kind: 'no_pr', summary: hashSummary(msg) };
  }
  if (lower.includes('json') || lower.includes('parse')) {
    return { kind: 'parse_error', summary: hashSummary(msg) };
  }
  if (lower.includes('timeout') || lower.includes('econnrefused') || lower.includes('network')) {
    return { kind: 'network', summary: hashSummary(msg) };
  }
  return { kind: 'network', summary: hashSummary(msg) };
}

export async function refreshPrDriftForJob(opts: {
  jobId: string;
  prUrl: string;
  headSha?: string;
  client: ObservabilitySqliteClient;
}): Promise<PrDriftRefreshResult> {
  const { jobId, prUrl, headSha, client } = opts;
  const now = Date.now();

  const prNumber = parsePrNumberFromUrl(prUrl);
  if (!prNumber) {
    const patch: PrDriftStatePatch = { pr_classification: 'unknown', pr_drift_checked_at_ms: now };
    client.updatePrDriftState(jobId, patch);
    return { ok: false, classification: 'unknown', error_kind: 'parse_error', error_summary: hashSummary('unparseable-pr-url') };
  }

  let stdout: string;
  try {
    stdout = execSync(
      `gh pr view ${prNumber} --json state,mergeable,mergeStateStatus,baseRefName,baseRefOid,headRefOid,url`,
      { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err: unknown) {
    const { kind, summary } = classifyError(err);
    const patch: PrDriftStatePatch = { pr_classification: 'unknown', pr_drift_checked_at_ms: now };
    client.updatePrDriftState(jobId, patch);
    return { ok: false, classification: 'unknown', error_kind: kind, error_summary: summary };
  }

  let raw: GhPrViewJson;
  try {
    raw = JSON.parse(stdout.trim()) as GhPrViewJson;
  } catch (err: unknown) {
    const summary = hashSummary(err instanceof Error ? err.message : String(err));
    const patch: PrDriftStatePatch = { pr_classification: 'unknown', pr_drift_checked_at_ms: now };
    client.updatePrDriftState(jobId, patch);
    return { ok: false, classification: 'unknown', error_kind: 'parse_error', error_summary: summary };
  }

  const classification = deriveClassification(raw);
  const patch: PrDriftStatePatch = {
    pr_url: raw.url ?? prUrl,
    pr_head_sha: raw.headRefOid ?? headSha ?? null,
    pr_state: raw.state ?? null,
    pr_merge_state: raw.mergeStateStatus ?? null,
    pr_classification: classification,
    pr_base_ref: raw.baseRefName ?? null,
    pr_base_sha: raw.baseRefOid ?? null,
    pr_drift_checked_at_ms: now,
  };
  client.updatePrDriftState(jobId, patch);

  return { ok: true, classification, raw: raw as Record<string, unknown> };
}
