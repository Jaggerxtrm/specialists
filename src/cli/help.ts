// src/cli/help.ts

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

type CommandEntry = [string, string];

const SETUP: CommandEntry[] = [
  ['install',    'Full-stack installer: pi, beads, dolt, MCP registration, hooks'],
  ['init',       'Scaffold specialists/, .specialists/, AGENTS.md in current project'],
  ['quickstart', 'Rich getting-started guide with examples and YAML schema reference'],
];

const DISCOVERY: CommandEntry[] = [
  ['list',    'List available specialists with model and description'],
  ['models',  'List models available on pi, flagged with thinking/images support'],
  ['status',  'Show system health (pi, beads, MCP, jobs)'],
];

const RUNNING: CommandEntry[] = [
  ['run',    'Run a specialist with a prompt (--background for async)'],
  ['edit',   'Edit a specialist field  (e.g. --model, --description)'],
];

const JOBS: CommandEntry[] = [
  ['feed',   'Tail events for a background job (--follow to stream)'],
  ['result', 'Print result of a background job'],
  ['stop',   'Send SIGTERM to a running background job'],
];

const OTHER: CommandEntry[] = [
  ['version', 'Print installed version'],
  ['help',    'Show this help message'],
];

function formatGroup(label: string, entries: CommandEntry[]): string[] {
  const colWidth = Math.max(...entries.map(([cmd]) => cmd.length));
  return [
    '',
    bold(cyan(label)),
    ...entries.map(([cmd, desc]) => `  ${cmd.padEnd(colWidth)}    ${dim(desc)}`),
  ];
}

export async function run(): Promise<void> {
  const lines: string[] = [
    '',
    bold('specialists <command> [options]'),
    '',
    dim('One MCP server. Multiple AI backends. Intelligent orchestration.'),
    ...formatGroup('Setup', SETUP),
    ...formatGroup('Discovery', DISCOVERY),
    ...formatGroup('Running', RUNNING),
    ...formatGroup('Jobs', JOBS),
    ...formatGroup('Other', OTHER),
    '',
    dim("Run 'specialists <command> --help' for command-specific options."),
    dim("Run 'specialists quickstart' for a full getting-started guide."),
    '',
  ];
  console.log(lines.join('\n'));
}
