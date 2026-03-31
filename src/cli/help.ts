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
  ['config', 'Batch get/set specialist YAML keys in config/specialists/'],
  ['run', 'Run a specialist; --json for NDJSON event stream, --raw for legacy text'],
  ['feed', 'Tail job events; use -f to follow all jobs'],
  ['poll', 'Machine-readable job status polling (for scripts/Claude Code)'],
  ['result', 'Print final output of a completed job; --wait polls until done, --timeout <ms> sets a limit'],
  ['clean', 'Purge completed job directories (TTL, --all, --keep, --dry-run)'],
  ['steer', 'Send a mid-run message to a running job'],
  ['resume', 'Resume a waiting keep-alive session with a next-turn prompt (retains full context)'],
  ['follow-up', '[deprecated] Use resume instead'],
  ['stop', 'Stop a running job'],
  ['report', 'Generate/show/list/diff session reports in .xtrm/reports/'],
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
  ['xt report show|list|diff', 'Session report surfaces (same .xtrm/reports files)'],
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
  '  Output modes',
    '    specialists run <name> --prompt "..."          # human (default): formatted event summary',
    '    specialists run <name> --prompt "..." --json   # NDJSON event stream to stdout',
    '    specialists run <name> --prompt "..." --raw    # legacy: raw LLM text deltas',
    '',
    '  Async patterns',
    '    MCP:   start_specialist + feed_specialist',
    '    CLI:   specialists run <name> --prompt "..."       # job ID prints on stderr',
    '           specialists feed|poll|result <job-id>         # observe/progress/final output',
    '    Shell: specialists run <name> --prompt "..." &      # native shell backgrounding',
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
    '  specialists config get specialist.execution.stall_timeout_ms',
    '  specialists run debugger --bead unitAI-123',
    '  specialists run codebase-explorer --prompt "Map the CLI architecture"',
    '  specialists poll abc123 --json                  # check job status',
    '  specialists feed -f                             # stream all job events',
    '  specialists steer <job-id> "focus only on supervisor.ts"',
    '  specialists resume <job-id> "now write the fix"',
    '  specialists run debugger --prompt "why does auth fail"',
    '  specialists report list',
    '  specialists report show --specialists',
    '  specialists result <job-id> --wait',
    '',
    bold('More help:'),
    '  specialists quickstart         Full guide and workflow reference',
    '  specialists run --help         Run command details and flags',
    '  specialists poll --help        Job status polling details',
    '  specialists steer --help       Mid-run steering details',
    '  specialists resume --help      Multi-turn keep-alive details',
    '  specialists init --help        Bootstrap behavior and workflow injection',
    '  specialists feed --help        Job event streaming details',
    '',
    dim('Project model: specialists are project-only; user-scope discovery is deprecated.'),
    '',
  ];

  console.log(lines.join('\n'));
}
