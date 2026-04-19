import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ensureGitignoreHasObservabilityDbEntries,
  ensureObservabilityDbFile,
  isPathInsideJobsDirectory,
  resolveObservabilityDbLocation,
} from '../specialist/observability-db.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import type { SupervisorStatus } from '../specialist/supervisor.js';
import { derivePersistedChainIdentity } from '../specialist/chain-identity.js';
import { parseTimelineEvent } from '../specialist/timeline-events.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

interface BackfillSummary {
  jobsBackfilled: number;
  jobsSkipped: number;
  jobsFailed: number;
  eventsImported: number;
}

interface BackfillOptions {
  importEvents: boolean;
}

interface PruneOptions {
  beforeMs: number;
  apply: boolean;
  includeEpics: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function parseIsoDate(input: string): number | null {
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDuration(input: string): number | null {
  const match = input.trim().toLowerCase().match(/^(\d+)([smhdw])$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: DAY_MS,
    w: 7 * DAY_MS,
  };
  return amount * multipliers[unit];
}

function parseBeforeArgument(raw: string): number {
  const durationMs = parseDuration(raw);
  if (durationMs !== null) return Date.now() - durationMs;
  const isoMs = parseIsoDate(raw);
  if (isoMs !== null) return isoMs;
  throw new Error(`Invalid --before value '${raw}'. Use ISO date or duration like 7d.`);
}

function printDbHelp(): void {
  console.log([
    '',
    'Usage: specialists db <setup|backfill|vacuum|prune>',
    '',
    'Human-only commands for shared observability SQLite database.',
    '',
    'Commands:',
    '  setup                              Provision database file + schema + .gitignore entries',
    '  init                               Alias for setup',
    '  backfill [--events]                Import historical .specialists/jobs/*/status.json rows',
    '  vacuum                             Run SQLite VACUUM (refuses when running/starting jobs exist)',
    '  prune --before <iso|duration>      Prune old rows (default dry-run)',
    '        [--dry-run] [--apply] [--include-epics]',
    '',
    'Behavior:',
    '  - prune keeps specialist_events last 30 days always',
    '  - prune removes specialist_results and terminal specialist_jobs older than --before',
    '  - prune never touches active-chain jobs',
    '  - prune never touches epic_runs unless --include-epics',
    '',
    'Examples:',
    '  specialists db setup',
    '  specialists db backfill --events',
    '  specialists db vacuum',
    '  specialists db prune --before 30d --dry-run',
    '  specialists db prune --before 2026-01-01T00:00:00Z --apply --include-epics',
    '',
  ].join('\n'));
}

function assertHumanInteractiveTerminal(commandName: 'setup' | 'backfill'): void {
  const forceSetup = process.env.SPECIALISTS_DB_SETUP_FORCE === '1';
  const inAgentSession =
    !forceSetup && (
      !process.stdin.isTTY ||
      !!process.env.SPECIALISTS_TMUX_SESSION ||
      !!process.env.SPECIALISTS_JOB_ID ||
      !!process.env.PI_SESSION_ID ||
      !!process.env.PI_RPC_SOCKET
    );

  if (!inAgentSession) return;

  console.error(
    `specialists db ${commandName} requires interactive terminal. user-only setup command.`
  );
  process.exit(1);
}

function printSetupResult(created: boolean, gitignoreUpdated: boolean, location: ReturnType<typeof resolveObservabilityDbLocation>): void {
  console.log(`\n${bold('specialists db setup')}\n`);
  console.log(`  ${green('✓')} database path: ${location.dbPath}`);
  console.log(`  ${green('✓')} mode: chmod 644`);

  if (location.source === 'xdg-data-home') {
    console.log(`  ${yellow('○')} using XDG_DATA_HOME (${location.dbDirectory})`);
  } else {
    console.log(`  ${green('✓')} using shared git-root location (${location.dbDirectory})`);
  }

  console.log(`  ${created ? green('✓ created database file') : yellow('○ database file already exists')}`);
  console.log(`  ${gitignoreUpdated ? green('✓ updated .gitignore for DB artifacts') : yellow('○ .gitignore already excludes DB artifacts')}`);
  console.log('');
}

function parseBackfillOptions(argv: readonly string[]): BackfillOptions {
  let importEvents = false;

  for (const argument of argv) {
    if (argument === '--events') {
      importEvents = true;
      continue;
    }

    throw new Error(`Unknown option for db backfill: '${argument}'`);
  }

  return { importEvents };
}

function parsePruneOptions(argv: readonly string[]): PruneOptions {
  let beforeValue: string | null = null;
  let apply = false;
  let dryRun = true;
  let includeEpics = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--before') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value for --before');
      beforeValue = value;
      index += 1;
      continue;
    }

    if (argument === '--apply') {
      apply = true;
      dryRun = false;
      continue;
    }

    if (argument === '--dry-run') {
      dryRun = true;
      apply = false;
      continue;
    }

    if (argument === '--include-epics') {
      includeEpics = true;
      continue;
    }

    throw new Error(`Unknown option for db prune: '${argument}'`);
  }

  if (!beforeValue) throw new Error('Missing required --before for db prune');

  return {
    beforeMs: parseBeforeArgument(beforeValue),
    apply: apply && !dryRun,
    includeEpics,
  };
}

function parseStatusFile(jobDirectoryPath: string, fallbackJobId: string): SupervisorStatus {
  const statusPath = join(jobDirectoryPath, 'status.json');
  const statusRaw = readFileSync(statusPath, 'utf-8');
  const parsed = JSON.parse(statusRaw) as Partial<SupervisorStatus>;

  const jobId = typeof parsed.id === 'string' && parsed.id.length > 0 ? parsed.id : fallbackJobId;
  const specialist = typeof parsed.specialist === 'string' && parsed.specialist.length > 0
    ? parsed.specialist
    : 'unknown';
  const status = typeof parsed.status === 'string' && parsed.status.length > 0
    ? parsed.status as SupervisorStatus['status']
    : 'starting';
  const startedAtMs = typeof parsed.started_at_ms === 'number' ? parsed.started_at_ms : Date.now();

  return {
    ...parsed,
    id: jobId,
    specialist,
    status,
    started_at_ms: startedAtMs,
  } as SupervisorStatus;
}

function replayEvents(
  eventsPath: string,
  sqliteClient: NonNullable<ReturnType<typeof createObservabilitySqliteClient>>,
  status: SupervisorStatus,
): number {
  if (!existsSync(eventsPath)) return 0;

  const rawContent = readFileSync(eventsPath, 'utf-8');
  const lines = rawContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  let importedEvents = 0;

  for (const line of lines) {
    const event = parseTimelineEvent(line);
    if (!event) continue;
    sqliteClient.appendEvent(status.id, status.specialist, status.bead_id, event);
    importedEvents += 1;
  }

  return importedEvents;
}

function runBackfill(options: BackfillOptions): void {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Failed to initialize observability SQLite schema. Run `specialists db setup` first and ensure sqlite3 is installed.');
  }

  const summary: BackfillSummary = {
    jobsBackfilled: 0,
    jobsSkipped: 0,
    jobsFailed: 0,
    eventsImported: 0,
  };

  try {
    const jobsDirectoryPath = resolveJobsDir(process.cwd());
    if (!existsSync(jobsDirectoryPath)) {
      console.log('No jobs directory found. Nothing to backfill.');
      return;
    }

    const jobEntries = readdirSync(jobsDirectoryPath, { withFileTypes: true });

    for (const jobEntry of jobEntries) {
      if (!jobEntry.isDirectory()) continue;

      const jobDirectoryPath = join(jobsDirectoryPath, jobEntry.name);
      const statusPath = join(jobDirectoryPath, 'status.json');
      if (!existsSync(statusPath)) continue;

      try {
        const status = parseStatusFile(jobDirectoryPath, jobEntry.name);
        const existingStatus = sqliteClient.readStatus(status.id);

        if (existingStatus) {
          summary.jobsSkipped += 1;
          continue;
        }

        const chainIdentity = derivePersistedChainIdentity(status);
        const normalizedStatus: SupervisorStatus = {
          ...status,
          chain_kind: chainIdentity.chain_kind,
          chain_id: chainIdentity.chain_id,
          chain_root_job_id: chainIdentity.chain_root_job_id,
          chain_root_bead_id: chainIdentity.chain_root_bead_id,
        };

        sqliteClient.upsertStatus(normalizedStatus);
        if (normalizedStatus.epic_id && normalizedStatus.chain_id) {
          sqliteClient.upsertEpicRun({
            epic_id: normalizedStatus.epic_id,
            status: 'open',
            updated_at_ms: Date.now(),
            status_json: JSON.stringify({
              epic_id: normalizedStatus.epic_id,
              status: 'open',
              source: 'db-backfill',
              chain_id: normalizedStatus.chain_id,
            }),
          });
          sqliteClient.upsertEpicChainMembership({
            epic_id: normalizedStatus.epic_id,
            chain_id: normalizedStatus.chain_id,
            chain_root_bead_id: normalizedStatus.chain_root_bead_id,
            chain_root_job_id: normalizedStatus.chain_root_job_id,
            updated_at_ms: Date.now(),
          });
        }
        summary.jobsBackfilled += 1;

        if (options.importEvents) {
          const eventsPath = join(jobDirectoryPath, 'events.jsonl');
          summary.eventsImported += replayEvents(eventsPath, sqliteClient, status);
        }
      } catch {
        summary.jobsFailed += 1;
      }
    }
  } finally {
    sqliteClient.close();
  }

  console.log(`\n${bold('specialists db backfill')}\n`);
  console.log(`  ${green('✓')} jobs backfilled: ${summary.jobsBackfilled}`);
  console.log(`  ${yellow('○')} jobs skipped (already in DB): ${summary.jobsSkipped}`);
  console.log(`  ${summary.jobsFailed > 0 ? yellow('○') : green('✓')} jobs failed: ${summary.jobsFailed}`);
  if (options.importEvents) {
    console.log(`  ${green('✓')} events imported: ${summary.eventsImported}`);
  }
  console.log('');
}

function runVacuum(): void {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Failed to initialize observability SQLite schema. Run `specialists db setup` first and ensure sqlite3 is installed.');
  }

  try {
    const activeJobs = sqliteClient.listActiveJobs(['running', 'starting']);
    if (activeJobs.length > 0) {
      const listing = activeJobs.slice(0, 5).map(job => `${job.job_id}:${job.status}`).join(', ');
      throw new Error(`Refusing vacuum while active jobs exist (${activeJobs.length}): ${listing}`);
    }

    const { beforeBytes, afterBytes } = sqliteClient.vacuumDatabase();
    const savedBytes = Math.max(0, beforeBytes - afterBytes);

    console.log(`\n${bold('specialists db vacuum')}\n`);
    console.log(`  ${green('✓')} before: ${formatBytes(beforeBytes)} (${beforeBytes} bytes)`);
    console.log(`  ${green('✓')} after:  ${formatBytes(afterBytes)} (${afterBytes} bytes)`);
    console.log(`  ${green('✓')} saved:  ${formatBytes(savedBytes)} (${savedBytes} bytes)`);
    console.log('');
  } finally {
    sqliteClient.close();
  }
}

function runPrune(options: PruneOptions): void {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Failed to initialize observability SQLite schema. Run `specialists db setup` first and ensure sqlite3 is installed.');
  }

  try {
    const report = sqliteClient.pruneObservabilityData({
      beforeMs: options.beforeMs,
      includeEpics: options.includeEpics,
      apply: options.apply,
    });

    console.log(`\n${bold('specialists db prune')}\n`);
    console.log(`  ${report.dryRun ? yellow('○ dry-run') : green('✓ applied')}`);
    console.log(`  ${green('✓')} before: ${new Date(report.beforeMs).toISOString()}`);
    console.log(`  ${green('✓')} events cutoff (fixed 30d): ${new Date(report.eventsCutoffMs).toISOString()}`);
    console.log(`  ${green('✓')} specialist_events: ${report.deletedEvents}`);
    console.log(`  ${green('✓')} specialist_results: ${report.deletedResults}`);
    console.log(`  ${green('✓')} specialist_jobs: ${report.deletedJobs}`);
    console.log(`  ${report.includeEpics ? green('✓') : yellow('○')} epic_runs: ${report.deletedEpicRuns} ${report.includeEpics ? '' : '(skipped, use --include-epics)'}`);
    console.log(`  ${yellow('○')} skipped active-chain jobs: ${report.skippedActiveChainJobs}`);
    console.log('');
  } finally {
    sqliteClient.close();
  }
}

function runSetup(): void {
  const location = resolveObservabilityDbLocation(process.cwd());
  if (isPathInsideJobsDirectory(location.dbPath, location.gitRoot)) {
    throw new Error(`Refusing to place observability DB inside jobs directory: ${location.dbPath}`);
  }

  const setupResult = ensureObservabilityDbFile(location);
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Failed to initialize observability SQLite schema. Ensure sqlite3 is installed and retry.');
  }
  sqliteClient.close();

  const gitignoreResult = ensureGitignoreHasObservabilityDbEntries(location.gitRoot);

  printSetupResult(setupResult.created, gitignoreResult.changed, location);
}

export async function run(argv: readonly string[] = process.argv.slice(3)): Promise<void> {
  const subcommand = argv[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printDbHelp();
    return;
  }

  if (subcommand === 'setup' || subcommand === 'init') {
    assertHumanInteractiveTerminal('setup');
    runSetup();
    return;
  }

  if (subcommand === 'backfill') {
    assertHumanInteractiveTerminal('backfill');
    const options = parseBackfillOptions(argv.slice(1));
    runBackfill(options);
    return;
  }

  if (subcommand === 'vacuum') {
    runVacuum();
    return;
  }

  if (subcommand === 'prune') {
    const options = parsePruneOptions(argv.slice(1));
    runPrune(options);
    return;
  }

  console.error(`Unknown db subcommand: '${subcommand}'`);
  printDbHelp();
  process.exit(1);
}
