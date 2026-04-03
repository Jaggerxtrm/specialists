import {
  ensureGitignoreHasObservabilityDbEntries,
  ensureObservabilityDbFile,
  isPathInsideJobsDirectory,
  resolveObservabilityDbLocation,
} from '../specialist/observability-db.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function printDbHelp(): void {
  console.log([
    '',
    'Usage: specialists db setup',
    '',
    'Human-only command to provision the shared observability SQLite database.',
    '',
    'Behavior:',
    '  - resolves storage at git-root (.specialists/db/observability.db),',
    '    or $XDG_DATA_HOME/specialists/observability.db when XDG_DATA_HOME is set',
    '  - creates the DB file once (no auto-create from runtime paths)',
    '  - enforces chmod 644 on the database file',
    '  - ensures .gitignore excludes .db, .db-wal, and .db-shm files under .specialists/db/',
    '',
    'Examples:',
    '  specialists db setup',
    '  sp db setup',
    '',
  ].join('\n'));
}

function assertHumanInteractiveTerminal(): void {
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
    'specialists db setup requires an interactive terminal. This is a user-only setup command — do not invoke from scripts or agent sessions.'
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

export async function run(argv: readonly string[] = process.argv.slice(3)): Promise<void> {
  const subcommand = argv[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printDbHelp();
    return;
  }

  if (subcommand !== 'setup' && subcommand !== 'init') {
    console.error(`Unknown db subcommand: '${subcommand}'`);
    printDbHelp();
    process.exit(1);
  }

  assertHumanInteractiveTerminal();

  const location = resolveObservabilityDbLocation(process.cwd());
  if (isPathInsideJobsDirectory(location.dbPath, location.gitRoot)) {
    throw new Error(`Refusing to place observability DB inside jobs directory: ${location.dbPath}`);
  }

  const setupResult = ensureObservabilityDbFile(location);
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Failed to initialize observability SQLite schema. Ensure sqlite3 is installed and retry.');
  }

  const gitignoreResult = ensureGitignoreHasObservabilityDbEntries(location.gitRoot);

  printSetupResult(setupResult.created, gitignoreResult.changed, location);
}
