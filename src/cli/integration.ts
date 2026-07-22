// `specialists integration` — the read/write surface for
// `xtrm.branch.integration.v1`.
//
//   record  published WRITE verb (core xtrm-vtqlg.2, unblocks core xtrm-1pc8c)
//   list    READ verb (core xtrm-vtqlg.6)
//
// ── record ───────────────────────────────────────────────────────────────────
//
// Core is barred from writing `.specialists/db/observability.db` directly: that
// schema is private to this repo and core's CLI deliberately carries no sqlite
// dependency. This verb is the sanctioned shell-out surface, the mirror image of
// `sp ps --json` that core already consumes in the read direction.
//
// It records exactly ONE event from a MANUAL invocation. The automatic emission
// path (`sp merge` → recordBranchIntegrationAfterMerge) is untouched and remains
// the only in-code emitter. Like that path this is an observation, never a second
// Git authority: it does not inspect, verify, or mutate git state, and the event
// is never read back to drive a merge.
import { resolve } from 'node:path';
import { createBranchIntegrationEvent, type BranchIntegrationEvent } from '../specialist/branch-integration-events.js';
import { createObservabilitySqliteClient, type ListBranchIntegrationFilters } from '../specialist/observability-sqlite.js';
import { resolveObservabilityDbLocation } from '../specialist/observability-db.js';

/** Source job id recorded when the merge came from outside a specialist job. */
const MANUAL_JOB_ID = 'manual';

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

interface Args {
  sourceJobId: string;
  sourceBranch: string;
  sourceWorktree: string;
  targetBranch: string;
  targetWorktree: string;
  targetRole?: string;
  commit: string;
  cwd: string;
  json: boolean;
}

// Stable, machine-readable failure codes. The core consumer branches on these.
type ErrorCode = 'usage' | 'observability_db_missing' | 'record_failed';

const USAGE = 'Usage: specialists integration record --source-branch <b> --source-worktree <p> '
  + '--target-branch <b> --target-worktree <p> --commit <sha> '
  + '[--source-job-id <id>] [--target-role <role>] [--status merged] [--cwd <path>] [--json]';

function fail(code: ErrorCode, message: string, json: boolean): never {
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message } }, null, 2)}\n`);
  } else {
    console.error(`error (${code}): ${message}`);
  }
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') json = true;
    else if (arg.startsWith('--')) values.set(arg.slice(2), argv[++i] ?? '');
  }

  const required = (name: string): string => {
    const value = values.get(name)?.trim();
    if (!value) fail('usage', `--${name} is required\n${USAGE}`, json);
    return value;
  };

  const commit = required('commit');
  if (!COMMIT_PATTERN.test(commit)) {
    fail('usage', `--commit must be a 7-40 char hex sha (got '${commit}')`, json);
  }

  const status = values.get('status')?.trim();
  if (status && status !== 'merged') {
    fail('usage', `--status must be 'merged' (got '${status}')`, json);
  }

  return {
    // Manual merges have no specialist job. The sentinel keeps source_job_id
    // (NOT NULL) meaningful and greppable instead of an empty string.
    sourceJobId: values.get('source-job-id')?.trim() || MANUAL_JOB_ID,
    sourceBranch: required('source-branch'),
    sourceWorktree: resolve(required('source-worktree')),
    targetBranch: required('target-branch'),
    targetWorktree: resolve(required('target-worktree')),
    targetRole: values.get('target-role')?.trim() || undefined,
    commit,
    cwd: values.get('cwd')?.trim() || process.cwd(),
    json,
  };
}

export function runRecord(): void {
  const args = parseArgs(process.argv.slice(4));

  // The db is created by the specialist runtime, never by an observation verb —
  // a repo that has never run a specialist has nothing to observe.
  const client = createObservabilitySqliteClient(args.cwd);
  if (!client) {
    fail(
      'observability_db_missing',
      `no observability db at ${resolveObservabilityDbLocation(args.cwd).dbPath} (run a specialist first)`,
      args.json,
    );
  }

  const event: BranchIntegrationEvent = createBranchIntegrationEvent({
    source: { job_id: args.sourceJobId, branch: args.sourceBranch, worktree: args.sourceWorktree },
    target: { branch: args.targetBranch, worktree: args.targetWorktree, role: args.targetRole },
    status: 'merged',
    commit: args.commit,
  });

  try {
    client.recordBranchIntegration(event);
  } catch (error) {
    fail('record_failed', (error as Error)?.message ?? String(error), args.json);
  } finally {
    client.close();
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, event }, null, 2)}\n`);
    return;
  }
  console.log(`recorded ${event.schema_version}: ${event.source.branch} → ${event.target.branch} @ ${event.commit}`);
}

// ── list ─────────────────────────────────────────────────────────────────────
//
// The store shipped with a single producer (`sp merge` ->
// recordBranchIntegrationAfterMerge) and zero readers, so nobody could tell
// whether the recorded job_id -> commit_sha lineage was correct. This verb is
// that reader. Query-only: it never writes, and nothing consults it to drive a
// merge — git remains the merge authority, exactly as `record` states above.

export interface IntegrationListOptions extends ListBranchIntegrationFilters {
  json: boolean;
}

const DEFAULT_LIMIT = 100;

export function parseIntegrationListArgs(argv: readonly string[]): IntegrationListOptions {
  const options: IntegrationListOptions = { json: false, limit: DEFAULT_LIMIT };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') { options.json = true; continue; }
    if (token === '--target-branch') {
      const value = argv[i + 1];
      if (!value) throw new Error('--target-branch requires a value');
      options.targetBranch = value;
      i += 1;
      continue;
    }
    if (token === '--job') {
      const value = argv[i + 1];
      if (!value) throw new Error('--job requires a value');
      options.sourceJobId = value;
      i += 1;
      continue;
    }
    if (token === '--limit') {
      const value = argv[i + 1];
      if (!value) throw new Error('--limit requires a value');
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid --limit value: ${value}`);
      options.limit = parsed;
      i += 1;
      continue;
    }
    throw new Error(`Unknown integration list option: ${token}`);
  }
  return options;
}

interface IntegrationRowView {
  source: { job_id: string; branch: string };
  target: { branch: string; role?: string };
  status: string;
  commit: string;
}

function formatIntegrationRow(t: number, event: IntegrationRowView): string {
  const role = event.target.role ? ` role=${event.target.role}` : '';
  return `${new Date(t).toISOString()} ${event.status} ${event.source.branch} -> ${event.target.branch}${role} commit=${event.commit.slice(0, 12)} job=${event.source.job_id}`;
}

/** Pure rendering seam: `--json` emits the stored event verbatim, so the output IS
 *  the recorded xtrm.branch.integration.v1 payload rather than a re-projection. */
export function renderIntegrationRows(
  rows: ReadonlyArray<{ t: number; event: IntegrationRowView }>,
  options: { json: boolean },
): string[] {
  if (options.json) return rows.map((row) => JSON.stringify(row.event));
  if (rows.length === 0) return ['No branch integrations recorded.'];
  return rows.map((row) => formatIntegrationRow(row.t, row.event));
}

export async function runList(): Promise<void> {
  const options = parseIntegrationListArgs(process.argv.slice(4));

  const client = createObservabilitySqliteClient();
  if (!client) throw new Error('Observability SQLite is unavailable; run under Bun with an initialized specialists database.');
  try {
    for (const line of renderIntegrationRows(client.listBranchIntegrations(options), options)) {
      console.log(line);
    }
  } finally {
    client.close();
  }
}
