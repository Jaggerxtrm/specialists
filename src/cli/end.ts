import { spawnSync } from 'node:child_process';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { isEpicUnresolvedState } from '../specialist/epic-lifecycle.js';
import { checkEpicUnresolvedGuard, resolveMergeTargets, executePublicationPlan, printSummary } from './merge.js';
import { handleEpicMergeCommand } from './epic.js';

interface EndOptions {
  beadId?: string;
  epicId?: string;
  rebuild: boolean;
  pr: boolean;
}

function parseOptions(argv: readonly string[]): EndOptions {
  let beadId: string | undefined;
  let epicId: string | undefined;
  let rebuild = false;
  let pr = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--bead' && argv[index + 1]) {
      beadId = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--epic' && argv[index + 1]) {
      epicId = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--rebuild') {
      rebuild = true;
      continue;
    }

    if (token === '--pr') {
      pr = true;
      continue;
    }

    if (!token.startsWith('-') && !beadId && !epicId) {
      beadId = token;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return { beadId, epicId, rebuild, pr };
}

function runCommand(command: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function detectCurrentBeadIdFromWorkspace(): string | undefined {
  const sqlite = createObservabilitySqliteClient();
  if (sqlite) {
    try {
      const currentWorkspace = process.cwd();
      const candidate = sqlite
        .listStatuses()
        .filter((status) => status.worktree_path === currentWorkspace && status.chain_root_bead_id)
        .sort((left, right) => (right.started_at_ms ?? 0) - (left.started_at_ms ?? 0))[0];

      if (candidate?.chain_root_bead_id) {
        return candidate.chain_root_bead_id;
      }
    } finally {
      sqlite.close();
    }
  }

  const branchResult = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branchResult.status !== 0) {
    return undefined;
  }

  const branch = branchResult.stdout.trim();
  const match = branch.match(/^feature\/(unitAI-[^-]+)-/i);
  return match?.[1];
}

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error('Usage: specialists|sp end [--bead <id>|--epic <id>] [--pr] [--rebuild]');
  process.exit(1);
}

async function publishChain(beadId: string, options: EndOptions): Promise<void> {
  const targets = resolveMergeTargets(beadId);
  const publication = executePublicationPlan(targets, {
    rebuild: options.rebuild,
    mode: options.pr ? 'pr' : 'direct',
    publicationLabel: `chain-${beadId}`,
  });

  printSummary(publication.steps, options.rebuild);
  if (options.pr) {
    console.log(`Publication mode: PR${publication.pullRequestUrl ? ` (${publication.pullRequestUrl})` : ''}`);
  } else {
    console.log('Publication mode: direct merge');
  }
}

export async function run(): Promise<void> {
  let options: EndOptions;

  try {
    options = parseOptions(process.argv.slice(3));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    printUsageAndExit(message);
  }

  if (options.epicId) {
    const args = ['merge', options.epicId, ...(options.rebuild ? ['--rebuild'] : []), ...(options.pr ? ['--pr'] : [])];
    await handleEpicMergeCommand(args);
    return;
  }

  const beadId = options.beadId ?? detectCurrentBeadIdFromWorkspace();
  if (!beadId) {
    printUsageAndExit('Unable to infer current chain bead from workspace. Pass --bead <id> or --epic <id>.');
  }

  const guard = checkEpicUnresolvedGuard(beadId);
  if (guard.blocked && guard.epicId && guard.epicStatus && isEpicUnresolvedState(guard.epicStatus)) {
    console.log(`Chain ${beadId} belongs to unresolved epic ${guard.epicId} (${guard.epicStatus}).`);

    if (guard.epicStatus === 'open') {
      console.log(`Epic ${guard.epicId} still open. Run: sp epic resolve ${guard.epicId}`);
      process.exit(1);
    }

    console.log(`Redirecting session close publication to epic merge (${options.pr ? 'PR mode' : 'direct mode'}).`);
    const args = ['merge', guard.epicId, ...(options.rebuild ? ['--rebuild'] : []), ...(options.pr ? ['--pr'] : [])];
    await handleEpicMergeCommand(args);
    return;
  }

  await publishChain(beadId, options);
}
