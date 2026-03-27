// src/cli/help.ts
// Top-level help for the specialists CLI.
// Richer and plainer than a terse command list, but smaller than quickstart.

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

type CommandEntry = [string, string];

const CORE_COMMANDS: CommandEntry[] = [
  ['init', 'Bootstrap a project: dirs, workflow injection, project MCP registration'],
  ['list', 'List specialists in this project'],
  ['validate', 'Validate a specialist YAML against the schema'],
  ['run', 'Run a specialist with --bead for tracked work or --prompt for ad-hoc work'],
  ['feed', 'Tail job events; use -f to follow all jobs'],
  ['poll', 'Machine-readable job status polling (for scripts/Claude Code)'],
  ['result', 'Print final output of a completed job'],
  ['steer', 'Send a mid-run message to a running job'],
  ['follow-up', 'Send a next-turn prompt to a keep-alive session (retains full context)'],
  ['stop', 'Stop a running job'],
  ['status', 'Show health, MCP state, and active jobs'],
  ['doctor', 'Diagnose installation/runtime problems'],
  ['quickstart', 'Full getting-started guide'],
  ['help', 'Show this help'],
];

const EXTENDED_COMMANDS: CommandEntry[] = [
  ['edit', 'Edit a specialist field such as model or description'],
  ['models', 'List models available on pi'],
  ['version', 'Print installed version'],
  ['setup', '[deprecated] Use specialists init instead'],
  ['install', '[deprecated] Use specialists init instead'],
];

const WORKTREE_COMMANDS: CommandEntry[] = [
  ['xt pi [name]', 'Start a Pi session in a sandboxed xt worktree'],
  ['xt claude [name]', 'Start a Claude session in a sandboxed xt worktree'],
  ['xt attach [slug]', 'Resume an existing xt worktree session'],
  ['xt worktree list', 'List worktrees with runtime and activity'],
  ['xt end', 'Close session, push, PR, cleanup'],
];

function formatCommands(entries: CommandEntry[]): string[] {
  const width = Math.max(...entries.map(([cmd]) => cmd.length));
  return entries.map(([cmd, desc]) => `  ${cmd.padEnd(width)}   ${desc}`);
}

export async function run(): Promise<void> {
  const lines: string[] = [
    '',
    'Specialists lets you run project-scoped specialist agents with a bead-first workflow.',
    '',
    bold('Usage:'),
    '  specialists|sp [command]',
    '  specialists|sp [command] --help',
    '',
    dim('  sp is a shorter alias — sp run, sp list, sp feed etc. all work identically.'),
    '',
    bold('Common flows:'),
    '',
    '  Tracked work (primary)',
    '    bd create "Task title" -t task -p 1 --json',
    '    specialists run <name> --bead <id> [--context-depth N]',
    '    specialists poll <job-id> --json   # check status',
    '    bd close <id> --reason "Done"',
    '',
    '  Ad-hoc work',
    '    specialists run <name> --prompt "..."',
    '',
    '  Rules',
    '    --bead is for tracked work',
    '    --prompt is for quick untracked work',
    '    --context-depth defaults to 1 with --bead',
    '    --no-beads does not disable bead reading',
    '',
    '  Background execution',
    '    Use Claude Code\'s native backgrounding (run_in_background: true)',
    '    or run in a separate terminal and poll with:',
    '      specialists poll <job-id> --json',
    '',
    bold('Core commands:'),
    ...formatCommands(CORE_COMMANDS),
    '',
    bold('Extended commands:'),
    ...formatCommands(EXTENDED_COMMANDS),
    '',
    bold('xtrm worktree commands:'),
    ...formatCommands(WORKTREE_COMMANDS),
    '',
    bold('Examples:'),
    '  specialists init',
    '  specialists list',
    '  specialists run debugger --bead unitAI-123',
    '  specialists run codebase-explorer --prompt "Map the CLI architecture"',
    '  specialists poll abc123 --json                  # check job status',
    '  specialists feed -f                             # stream all job events',
    '  specialists steer <job-id> "focus only on supervisor.ts"',
    '  specialists follow-up <job-id> "now write the fix"',
    '  specialists result <job-id>',
    '',
    bold('More help:'),
    '  specialists quickstart         Full guide and workflow reference',
    '  specialists run --help         Run command details and flags',
    '  specialists poll --help        Job status polling details',
    '  specialists steer --help       Mid-run steering details',
    '  specialists follow-up --help   Multi-turn keep-alive details',
    '  specialists init --help        Bootstrap behavior and workflow injection',
    '  specialists feed --help        Job event streaming details',
    '',
    dim('Project model: specialists are project-only; user-scope discovery is deprecated.'),
    '',
  ];

  console.log(lines.join('\n'));
}
