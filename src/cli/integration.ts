// `specialists integration record` — published write verb for
// `xtrm.branch.integration.v1` (core xtrm-vtqlg.2, unblocks core xtrm-1pc8c).
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
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
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

export function run(): void {
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
