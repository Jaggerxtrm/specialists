// src/cli/help.ts

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`;

const COMMANDS: [string, string][] = [
  ['install', 'Full-stack installer: pi, beads, dolt, MCP registration, hooks'],
  ['list',    'List available specialists with model and description'],
  ['models',  'List models available on pi, flagged with thinking/images support'],
  ['version', 'Print installed version'],
  ['init',    'Initialize specialists in the current project'],
  ['edit',    'Edit a specialist field  (e.g. --model, --description)'],
  ['run',     'Run a specialist with a prompt'],
  ['status',  'Show system health (pi, beads, MCP)'],
  ['help',    'Show this help message'],
];

const COL_WIDTH = Math.max(...COMMANDS.map(([cmd]) => cmd.length));

export async function run(): Promise<void> {
  const lines: string[] = [
    '',
    bold('specialists <command>'),
    '',
    'Commands:',
    ...COMMANDS.map(([cmd, desc]) => `  ${cmd.padEnd(COL_WIDTH)}    ${dim(desc)}`),
    '',
    dim("Run 'specialists <command> --help' for command-specific options."),
    '',
  ];
  console.log(lines.join('\n'));
}
