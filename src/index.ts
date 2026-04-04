#!/usr/bin/env node

/**
 * Specialists MCP Server — entry point
 * Subcommands: install, version, list, models, init, db, validate, edit, config, run,
 *              status, result, feed, poll, clean, stop, attach, quickstart, help
 */

import { SpecialistsServer } from "./server.js";
import { logger } from "./utils/logger.js";

const sub  = process.argv[2];
const next = process.argv[3];

/** True when the user appended --help or -h to a subcommand. */
function wantsHelp(): boolean {
  return next === '--help' || next === '-h';
}

async function run() {
  if (sub === 'install') {
    if (wantsHelp()) {
      console.log([
        '',
        '⚠ DEPRECATED: Use `specialists init` instead.',
        '',
        'The install command is deprecated. Run `specialists init` for project setup.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/install.js');
    return handler();
  }

  if (sub === 'version' || sub === '--version' || sub === '-v') {
    const { run: handler } = await import('./cli/version.js');
    return handler();
  }

  if (sub === 'list') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists list [options]',
        '',
        'List specialists in the current project.',
        '',
        'What it shows:',
        '  - specialist name',
        '  - model',
        '  - short description',
        '  - permission_required + interactive mode',
        '  - version + optional thinking_level',
        '  - skills.paths and configured pre/post scripts',
        '',
        'Options:',
        '  --category <name>   Filter by category tag',
        '  --json              Output as JSON array',
        '  --live              List running tmux-backed jobs and attach interactively',
        '',
        'Examples:',
        '  specialists list',
        '  specialists list --category analysis',
        '  specialists list --json',
        '  specialists list --live',
        '',
        'More help:',
        '  specialists help            Full command catalog',
        '  specialists run --help      Run command details and keep-alive options',
        '  specialists init --help     Bootstrap and project workflow setup',
        '',
        'Project model:',
        '  Specialists are project-only. User-scope discovery is deprecated.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/list.js');
    return handler();
  }

  if (sub === 'models') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists models',
        '',
        'List all models available on pi, with thinking and image support flags.',
        '',
        'No flags.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/models.js');
    return handler();
  }

  if (sub === 'init') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists init [--sync-defaults]',
        '',
        'Bootstrap a project for specialists. This is the sole onboarding command.',
        '',
        'What it does (always safe, idempotent):',
        '  • creates .specialists/user/ for custom specialists',
        '  • creates .specialists/jobs/ and .specialists/ready/ runtime dirs',
        '  • adds runtime dirs to .gitignore',
        '  • injects the Specialists section into AGENTS.md',
        '  • registers the Specialists MCP server at project scope (.mcp.json)',
        '  • installs hooks to .claude/hooks/ and wires .claude/settings.json',
        '  • installs skills to .claude/skills/ and .pi/skills/',
        '',
        'Options:',
        '  --sync-defaults    Also copy canonical specialists to .specialists/default/.',
        '                     Human-only: rewrites default specialist YAML files.',
        '',
        'Examples:',
        '  specialists init                 # safe for agents to call',
        '  specialists init --sync-defaults # human-only: sync canonical specialists',
        '',
        'Notes:',
        '  setup and install are deprecated; use specialists init.',
        '  MCP missing → specialists init (safe for anyone to call).',
        '  Specialists missing → specialists init --sync-defaults (human-only).',
        '',
      ].join('\n'));
      return;
    }
    const syncDefaults = process.argv.includes('--sync-defaults');
    const { run: handler } = await import('./cli/init.js');
    return handler({ syncDefaults });
  }

  if (sub === 'db') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists db setup',
        '',
        'Provision the shared observability SQLite database (human-only).',
        '',
        'Commands:',
        '  setup   Create and initialize the observability DB (one-time)',
        '  init    Alias for setup',
        '',
        'Notes:',
        '  - TTY required (blocked in agent/non-interactive sessions)',
        '  - Resolves at git-root .specialists/db/ by default',
        '  - Uses $XDG_DATA_HOME/specialists when XDG_DATA_HOME is set',
        '',
        'Examples:',
        '  specialists db setup',
        '  sp db setup',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/db.js');
    return handler(process.argv.slice(3));
  }

  if (sub === 'validate') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists validate <name> [--json]',
        '',
        'Validate a specialist YAML file against the schema.',
        '',
        'What it checks:',
        '  - YAML syntax is valid',
        '  - Required fields are present (name, version, description, category, model)',
        '  - Field values match expected formats (kebab-case names, semver versions)',
        '  - Enum values are valid (permission_required, mode, beads_integration)',
        '',
        'Options:',
        '  --json   Output validation result as JSON',
        '',
        'Examples:',
        '  specialists validate my-specialist',
        '  specialists validate my-specialist --json',
        '',
        'Exit codes:',
        '  0 — validation passed',
        '  1 — validation failed (errors) or specialist not found',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/validate.js');
    return handler();
  }

  if (sub === 'edit') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists edit <name> --<field> <value> [options]',
        '       specialists edit --all',
        '',
        'Edit a field in a .specialist.yaml without opening the file.',
        '',
        'Editable fields:',
        '  --model <value>          Primary execution model',
        '  --fallback-model <value> Fallback model (used on circuit-break)',
        '  --description <value>    One-line description',
        '  --permission <value>     READ_ONLY | LOW | MEDIUM | HIGH',
        '  --timeout <ms>           Timeout in milliseconds',
        '  --tags <a,b,c>           Comma-separated list of tags',
        '',
        'Options:',
        '  --dry-run                Preview the change without writing',
        '  --scope <default|user>   Disambiguate if same name exists in multiple scopes',
        '  --all                    Open all YAML files in config/specialists/ in $EDITOR',
        '',
        'Examples:',
        '  specialists edit code-review --model anthropic/claude-opus-4-6',
        '  specialists edit code-review --permission HIGH --dry-run',
        '  specialists edit code-review --tags analysis,security',
        '  specialists edit --all',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/edit.js');
    return handler();
  }

  if (sub === 'config') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists config <get|set> <key> [value] [options]',
        '',
        'Batch-read or batch-update specialist YAML config in config/specialists/.',
        '',
        'Commands:',
        '  get <key>                 Show a key across all specialists',
        '  set <key> <value>         Set a key across all specialists',
        '',
        'Options:',
        '  --all                     Apply to all specialists (default when --name omitted)',
        '  --name <specialist>       Target one specialist',
        '',
        'Examples:',
        '  specialists config get specialist.execution.stall_timeout_ms',
        '  specialists config set specialist.execution.stall_timeout_ms 180000',
        '  specialists config set specialist.execution.stall_timeout_ms 120000 --name executor',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/config.js');
    return handler();
  }

  if (sub === 'run') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists run <name> [options]',
        '',
        'Run a specialist. Streams output to stdout until completion.',
        '',
        'Primary modes:',
        '  tracked:    specialists run <name> --bead <id>',
        '  ad-hoc:     specialists run <name> --prompt "..."',
        '  worktree:   specialists run <name> --bead <id> --worktree',
        '  reuse job:  specialists run <name> --bead <id> --job <prior-job-id>',
        '',
        'Options:',
        '  --bead <id>          Use an existing bead as the prompt source',
        '  --prompt <text>      Ad-hoc prompt for untracked work',
        '  --context-depth <n>  Dependency context depth when using --bead (default: 1)',
        '  --no-beads           Do not create a new tracking bead (does not disable bead reading)',
        '  --no-bead-notes      Do not append completion notes to an external --bead',
        '  --model <model>      Override the configured model for this run',
        '  --keep-alive         Keep session alive for follow-up prompts',
        '  --worktree           Provision (or reuse) a bd-managed worktree derived from --bead.',
        '                       Requires --bead. Mutually exclusive with --job.',
        '  --job <id>           Reuse the workspace of a prior job (must have been started with',
        '                       --worktree). Caller bead context remains authoritative.',
        '                       Mutually exclusive with --worktree.',
        '',
        'Examples:',
        '  specialists run debugger --bead unitAI-55d',
        '  specialists run debugger --bead unitAI-55d --context-depth 2',
        '  specialists run executor --bead hgpu.3 --worktree',
        '  specialists run reviewer --bead hgpu.3 --job <prior-job-id>',
        '  specialists run code-review --prompt "Audit src/api.ts"',
        '  cat brief.md | specialists run report-generator',
        '',
        'Rules:',
        '  Use --bead for tracked work.',
        '  Use --worktree to isolate the run in its own git branch/directory.',
        '  Use --job to reuse a prior worktree without re-provisioning.',
        '  --worktree and --job are mutually exclusive.',
        '  --worktree requires --bead to derive a deterministic branch name.',
        '',
        'Async execution patterns:',
        '  MCP:   start_specialist + feed_specialist',
        '  CLI:   run prints [job started: <id>] on stderr, then use feed/poll/result',
        '  Shell: specialists run <name> --prompt "..." &',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/run.js');
    return handler();
  }

  if (sub === 'status') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists status [options]',
        '',
        'Show current runtime state.',
        '',
        'Sections include:',
        '  - discovered specialists',
        '  - pi provider/runtime health',
        '  - beads availability',
        '  - MCP registration hints',
        '  - active background jobs',
        '',
        'Options:',
        '  --json   Output machine-readable JSON',
        '',
        'Examples:',
        '  specialists status',
        '  specialists status --json',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/status.js');
    return handler();
  }

  if (sub === 'result') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists result <job-id>',
        '',
        'Print the final output of a completed job.',
        'Exits with code 1 if the job is still running or failed.',
        '',
        'Examples:',
        '  specialists result job_a1b2c3d4',
        '  specialists result job_a1b2c3d4 > output.md',
        '',
        'See also:',
        '  specialists feed <job-id> --follow   (stream live events)',
        '  specialists status                   (list all active jobs)',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/result.js');
    return handler();
  }

  if (sub === 'feed') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists feed <job-id> [options]',
        '       specialists feed -f [--forever]',
        '',
        'Read job events.',
        '',
        'Modes:',
        '  specialists feed <job-id>        Replay events for one job',
        '  specialists feed <job-id> -f     Follow one job until completion',
        '  specialists feed -f              Follow all jobs globally',
        '',
        'Options:',
        '  --from <n>     Show only events with seq >= <n>',
        '  -f, --follow   Follow live updates',
        '  --forever      Keep following in global mode even when all jobs complete',
        '',
        'Examples:',
        '  specialists feed 49adda',
        '  specialists feed 49adda --from 15',
        '  specialists feed 49adda --follow',
        '  specialists feed -f',
        '  specialists feed -f --forever',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/feed.js');
    return handler();
  }

  if (sub === 'poll') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists poll <job-id> [--cursor N] [--json]',
        '',
        'Machine-readable job status polling for scripts and Claude Code.',
        'Reads from .specialists/jobs/<id>/ files.',
        '',
        'Output (JSON mode):',
        '  {',
        '    "job_id": "abc123",',
        '    "status": "running" | "done" | "error" | "waiting",',
        '    "elapsed_ms": 45000,',
        '    "cursor": 15,',
        '    "events": [...],          // new events since cursor',
        '    "output": "...",           // full output when done',
        '    "model": "claude-sonnet-4-6",',
        '    "bead_id": "unitAI-123"',
        '  }',
        '',
        'Options:',
        '  --cursor N   Event index to start from (default: 0)',
        '  --json       Output as JSON (machine-readable)',
        '',
        'Examples:',
        '  specialists poll abc123 --json',
        '  specialists poll abc123 --cursor 5 --json',
        '',
        'Polling pattern in Claude Code:',
        '  1. Start job (blocks until done):',
        '     specialists run planner --bead xtrm-p38n.1',
        '  2. Or use Claude Code native backgrounding',
        '  3. Poll for incremental status:',
        '     specialists poll <job-id> --json',
        '',
      ].join('\n'));
      return;
    }
    const { run: pollHandler } = await import('./cli/poll.js');
    return pollHandler();
  }

  if (sub === 'steer') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists steer <job-id> "<message>"',
        '',
        'Send a mid-run steering message to a running background specialist job.',
        'The agent receives the message after its current tool calls finish,',
        'before the next LLM call.',
        '',
        'Pi RPC steer command: {"type":"steer","message":"..."}',
        'Response: {"type":"response","command":"steer","success":true}',
        '',
        'Examples:',
        '  specialists steer a1b2c3 "focus only on supervisor.ts"',
        '  specialists steer a1b2c3 "skip tests, just fix the bug"',
        '',
        'Notes:',
        '  - Only works for running jobs.',
        '  - Delivery is best-effort: the agent processes it on its next turn.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/steer.js');
    return handler();
  }

  if (sub === 'resume') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists resume <job-id> "<task>"',
        '',
        'Resume a waiting keep-alive specialist session with a next-turn prompt.',
        'The Pi session retains full conversation history between turns.',
        '',
        'Requires: job started with --keep-alive.',
        '',
        'Examples:',
        '  specialists resume a1b2c3 "Now write the fix for the bug you found"',
        '  specialists resume a1b2c3 "Focus only on the auth module"',
        '',
        'Workflow:',
        '  specialists run debugger --bead <id> --keep-alive',
        '  # → Job started: a1b2c3  (status: waiting after first turn)',
        '  specialists result a1b2c3          # read first turn output',
        '  specialists resume a1b2c3 "..."    # send next task',
        '  specialists feed a1b2c3 --follow   # watch response',
        '',
        'See also: specialists steer (mid-run redirect for running jobs)',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/resume.js');
    return handler();
  }

  if (sub === 'follow-up') {
    if (wantsHelp()) {
      console.log([
        '',
        '⚠ DEPRECATED: Use `specialists resume` instead.',
        '',
        'Usage: specialists follow-up <job-id> "<task>"',
        '',
        'Delegates to `specialists resume`. This alias will be removed in a future release.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/follow-up.js');
    return handler();
  }

  if (sub === 'clean') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists clean [--all] [--keep <n>] [--dry-run]',
        '',
        'Purge completed job directories from .specialists/jobs/.',
        '',
        'Default behavior:',
        '  - removes done/error jobs older than SPECIALISTS_JOB_TTL_DAYS',
        '  - TTL defaults to 7 days if env is unset',
        '  - never removes SQLite artifacts (*.db, *.db-wal, *.db-shm)',
        '',
        'Options:',
        '  --all        Remove all done/error jobs regardless of age',
        '  --keep <n>   Keep only the N most recent done/error jobs',
        '  --dry-run    Show what would be removed without deleting',
        '',
        'Examples:',
        '  specialists clean',
        '  specialists clean --all',
        '  specialists clean --keep 20',
        '  specialists clean --dry-run',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/clean.js');
    return handler();
  }

  if (sub === 'stop') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists stop <job-id>',
        '',
        'Send SIGTERM to the agent process for a running background job.',
        'Has no effect if the job is already done or errored.',
        '',
        'Examples:',
        '  specialists stop job_a1b2c3d4',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/stop.js');
    return handler();
  }

  if (sub === 'attach') {
    if (wantsHelp()) {
      process.stdout.write([
        'Usage: specialists attach <job-id>',
        '',
        'Attach your terminal to the tmux session of a running background specialist job.',
        'The job must have been started with --background and tmux must be installed.',
        '',
        'Arguments:',
        '  <job-id>    The job ID returned by specialists run --background',
        '',
        'Exit codes:',
        '  0 — session attached and exited normally',
        '  1 — job not found, already done, or no tmux session',
        '',
        'Examples:',
        '  specialists attach job_a1b2c3d4',
        '  specialists attach $(specialists run executor --background --prompt "...")',
        '',
        'See also: specialists list --live   (interactive session picker)',
      ].join('\n') + '\n');
      process.exit(0);
    }
    const { run: handler } = await import('./cli/attach.js');
    return handler();
  }

  if (sub === 'quickstart') {
    const { run: handler } = await import('./cli/quickstart.js');
    return handler();
  }

  if (sub === 'doctor') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists doctor',
        '',
        'Diagnose bootstrap and runtime problems.',
        '',
        'Checks:',
        '  1. pi installed and has active providers',
        '  2. beads installed and .beads/ present',
        '  3. xtrm-tools availability',
        '  4. Specialists MCP registration in .mcp.json',
        '  5. .specialists/ runtime directories',
        '  6. hook wiring expectations',
        '  7. zombie job detection',
        '',
        'Behavior:',
        '  - prints fix hints for failing checks',
        '  - auto-creates missing runtime directories when possible',
        '',
        'Examples:',
        '  specialists doctor',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/doctor.js');
    return handler();
  }

  if (sub === 'setup') {
    if (wantsHelp()) {
      console.log([
        '',
        '⚠ DEPRECATED: Use `specialists init` instead.',
        '',
        'The setup command is deprecated. Run `specialists init` for project setup.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/setup.js');
    return handler();
  }

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    const { run: handler } = await import('./cli/help.js');
    return handler();
  }

  // Unknown subcommand — error instead of silently starting the MCP server
  if (sub) {
    console.error(`Unknown command: '${sub}'\nRun 'specialists help' to see available commands.`);
    process.exit(1);
  }

  // No subcommand: MCP server mode
  logger.info("Starting Specialists MCP Server...");
  const server = new SpecialistsServer();
  await server.start();
}

run().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});
