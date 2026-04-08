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
import { parseTimelineEvent } from '../specialist/timeline-events.js';

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

function printDbHelp(): void {
  console.log([
    '',
    'Usage: specialists db <setup|backfill>',
    '',
    'Human-only commands for the shared observability SQLite database.',
    '',
    'Commands:',
    '  setup              Provision database file + schema + .gitignore entries',
    '  init               Alias for setup',
    '  backfill           Import historical .specialists/jobs/*/status.json rows',
    '    --events         Also replay events.jsonl into specialist_events',
    '',
    'Behavior:',
    '  - resolves storage at git-root (.specialists/db/observability.db),',
    '    or $XDG_DATA_HOME/specialists/observability.db when XDG_DATA_HOME is set',
    '  - creates the DB file once (no auto-create from runtime paths)',
    '  - enforces chmod 644 on the database file',
    '  - ensures .gitignore excludes .db, .db-wal, and .db-shm files under .specialists/db/',
    '  - backfill skips jobs already present in SQLite by job_id (idempotent)',
    '',
    'Examples:',
    '  specialists db setup',
    '  specialists db backfill',
    '  specialists db backfill --events',
    '  sp db setup',
    '  sp db backfill',
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
    `specialists db ${commandName} requires an interactive terminal. This is a user-only setup command — do not invoke from scripts or agent sessions.`
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

        sqliteClient.upsertStatus(status);
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

  console.error(`Unknown db subcommand: '${subcommand}'`);
  printDbHelp();
  process.exit(1);
}
