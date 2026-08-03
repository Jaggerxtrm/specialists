// `specialists launch-outcome` — read-only consumer of the Core K2 launcher
// outcome contract (`xtrm.command-outcome.v1`).
//
// K4 (unitAI-e67up.4). The Core launcher (`xt pi|claude|codex <role>
// --no-attach --json`) emits one detached JSON outcome per launch. This verb
// validates that outcome against the stable contract boundary and prints the
// whitelist projection: readiness, runtime, session/worktree identity for
// result retrieval, and exact follow-up actions as argv data.
//
// Creates no job, worktree, session, bead, note, or status row. It is not a
// second result authority: specialist job results stay on `sp result`. The
// surface here is the outcome's `runtime.name` (pi|claude|codex) — an
// `openai-codex/...` provider spelling never appears in this contract.
import { readFileSync } from 'node:fs';
import {
  LAUNCH_OUTCOME_SCHEMA_VERSION,
  LaunchOutcomeError,
  parseLaunchOutcome,
  projectLaunchOutcome,
  validateLaunchOutcome,
} from '../specialist/launch-outcome.js';

type VerbErrorCode = 'usage' | 'file_not_read' | LaunchOutcomeError['code'];

function fail(code: VerbErrorCode, message: string): never {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message } }, null, 2)}\n`);
  process.exit(1);
}

const USAGE = 'Usage: specialists launch-outcome <file>';

export async function run(): Promise<void> {
  const args = process.argv.slice(3).filter((arg) => arg !== '--json');
  const file = args.find((arg) => !arg.startsWith('-')) ?? '';
  if (!file) fail('usage', USAGE);

  let raw: string;
  try {
    raw = readFileSync(file, 'utf-8');
  } catch (error) {
    fail('file_not_read', `cannot read outcome file '${file}': ${(error as Error)?.message ?? String(error)}`);
  }

  let projection;
  try {
    projection = projectLaunchOutcome(validateLaunchOutcome(parseLaunchOutcome(raw)));
  } catch (error) {
    if (error instanceof LaunchOutcomeError) fail(error.code, error.message);
    throw error;
  }

  process.stdout.write(`${JSON.stringify({ ok: true, ...projection }, null, 2)}\n`);
}

export { LAUNCH_OUTCOME_SCHEMA_VERSION };
