#!/usr/bin/env node

/**
 * Specialists MCP Server — entry point
 * Subcommands: install, version, list, view, models, init, db, validate, edit, config, run,
 *              chat, status, ps, result, feed, log, forensic, metrics, clean, merge, epic, end, stop, attach, quickstart, serve, script, release, help
 */

// Suppress EBADF errors from bun's internal fd handling on named pipes.
// These are benign — the fd was already closed by our explicit closeSync().
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EBADF' && err.syscall === 'close') return;
  console.error('[specialists] [ERROR] Fatal error:', err);
  process.exit(1);
});

if (typeof globalThis.Bun === 'undefined') {
  console.error([
    '[specialists] [ERROR] Bun runtime required (>=1.0.0).',
    '[specialists] Install Bun: https://bun.sh/install',
    '[specialists] Example: curl -fsSL https://bun.sh/install | bash',
  ].join('\n'));
  process.exit(1);
}

import { spawnSync } from 'node:child_process';

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

  if (sub === 'list-rules') {
    const { run: handler } = await import('./cli/list-rules.js');
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
        '  - full description (use --compact to truncate)',
        '  - permission_required + interactive mode / active-mode detection',
        '  - version + optional thinking_level',
        '  - skills.paths and configured pre/post scripts',
        '',
        'Options:',
        '  --category <name>   Filter by category tag',
        '  --json              Output as JSON array',
        '  --compact           Truncate descriptions for a shorter list',
        '  --full, --no-truncate  Show full descriptions (default)',
        '  --live              List running tmux-backed jobs; active jobs are DB-backed',
        '',
        'Examples:',
        '  specialists list',
        '  specialists list --category analysis',
        '  specialists list --json',
        '  specialists list --compact',
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

  if (sub === 'view') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists view <name> [options]',
        '       specialists view [--all]',
        '',
        'Inspect specialist config with readable prompt rendering.',
        '',
        'Modes:',
        '  specialists view <name>         Render one specialist in human-friendly sections',
        '  specialists view --section X    Render one section only (metadata/execution/prompt/...)',
        '  specialists view --raw          Print raw source config for piping',
        '  specialists view --all          Show detailed catalog for all specialists',
        '  specialists view                Show catalog, then prompt to pick a specialist',
        '',
        'Examples:',
        '  specialists view debugger',
        '  specialists view debugger --section prompt',
        '  specialists view debugger --raw',
        '  specialists view --all',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/view.js');
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
        'Usage: specialists init [--sync-defaults] [--sync-skills] [--no-xtrm-check]',
        '',
        'Bootstrap a project for specialists. This is the specialists onboarding command.',
        '',
        'What it does (always safe, idempotent):',
        '  • creates .specialists/user/ for custom specialists',
        '  • creates .specialists/jobs/ and .specialists/ready/ runtime dirs',
        '  • adds runtime dirs to .gitignore',
        '  • injects the Specialists section into AGENTS.md',
        '  • registers the Specialists MCP server at project scope (.mcp.json)',
        '  • installs hooks to .claude/hooks/ and wires .claude/settings.json',
        '  • syncs skills into .xtrm/skills/default/ and wires active symlinks',
        '',
        'Prereq:',
        '  Bun >=1.0.0 required before xtrm-tools setup.',
        '  Install order: Bun -> xtrm-tools -> xt install -> xt init ->',
        '  @jaggerxtrm/specialists -> sp init.',
        '  sp list, sp doctor --check-drift, sp prune-stale-defaults do not require xt.',
        '',
        'Options:',
        '  --sync-defaults    Also copy canonical specialists to .specialists/default/.',
        '                     Human-only: rewrites default specialist YAML files.',
        '  --sync-skills      Re-sync skills only (.xtrm/default + active symlinks).',
        '                     Skips full init flow.',
        '  --no-xtrm-check    Skip .xtrm/ + xt CLI prerequisite checks (CI/testing).',
        '  --global           Generate/extend the global ~/.config/specialists/user.json',
        '                     override layer instead of bootstrapping a project.',
        '',
        'Examples:',
        '  specialists init                  # full bootstrap',
        '  specialists init --sync-defaults  # sync canonical specialists',
        '  specialists init --sync-skills    # re-sync skills only',
        '  specialists init --global         # seed global user overrides',
        '',
        'Notes:',
        '  setup and install are deprecated; use specialists init.',
        '  Prerequisite: .claude/skills and .pi/skills must already be symlinks to',
        '  .xtrm/skills/active/ (created by xt install). specialists init does not',
        '  create those top-level symlinks.',
        '  MCP missing → specialists init (safe for anyone to call).',
        '  Specialists missing → specialists init --sync-defaults.',
        '  Skill sync only → specialists init --sync-skills.',
        '',
      ].join('\n'));
      return;
    }
    const syncDefaults = process.argv.includes('--sync-defaults');
    const syncSkills = process.argv.includes('--sync-skills');
    const noXtrmCheck = process.argv.includes('--no-xtrm-check');
    const globalFlag = process.argv.includes('--global');
    const { run: handler } = await import('./cli/init.js');
    return handler({ syncDefaults, syncSkills, noXtrmCheck, global: globalFlag });
  }

  if (sub === 'memory') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists memory <sync|refresh> [--force] [--json]',
        '',
        'Sync bd memories into local SQLite FTS cache used for specialist context injection.',
        '',
        'Commands:',
        '  sync       Sync cache when stale or mismatched (use --force to always rebuild)',
        '  refresh    Invalidate cache then full rebuild from bd memories',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/memory.js');
    return handler(process.argv.slice(3));
  }

  if (sub === 'db') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists db <setup|backfill|vacuum|prune|extract|stats|benchmark-export>',
        '',
        'Provision the shared observability SQLite database maintenance and migration (human-only).',
        '',
        'Commands:',
        '  [BOOTSTRAP] setup      Create and initialize the observability DB (one-time)',
        '  [BOOTSTRAP] init       Alias for setup',
        '  [MIGRATION] backfill   Backfill specialist_jobs from .specialists/jobs/*/status.json',
        '                       Use --events to also replay events.jsonl',
        '  [MIGRATION] vacuum     Run SQLite VACUUM (refuses when active jobs running/starting)',
        '  [MIGRATION] prune      Prune old rows: requires --before <iso|duration>, dry-run by default',
        '                       Use --apply to execute; --include-epics to also prune epic_runs',
        '  [MIGRATION] extract    Recompute KPI rows from specialist_events',
        '                       Use --job, --all-missing, --since, or --backfill',
        '  [QUERY] stats          Query KPI rows; use --with-payload for payload columns',
        '',
        'Notes:',
        '  - TTY required for legacy migration tooling (blocked in agent/non-interactive sessions)',
        '  - Resolves at git-root .specialists/db/ by default',
        '  - Uses $XDG_DATA_HOME/specialists when XDG_DATA_HOME is set',
        '',
        'Examples:',
        '  specialists db setup',
        '  specialists db backfill',
        '  specialists db backfill --events',
        '  specialists db vacuum',
        '  specialists db prune --before 30d --dry-run',
        '  specialists db prune --before 2026-01-01T00:00:00Z --apply --include-epics',
        '  sp db setup',
        '  sp db backfill',
        '  sp db extract --all-missing',
        '  sp db stats --with-payload',
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
        'Usage: specialists validate <name|path> [--target=<surface>] [--json]',
        '',
        'Validate a specialist config against the schema.',
        'Use --target=script for pre-deploy script-runner compat checks.',
        '',
        'What it checks:',
        '  - Full schema: syntax and required fields',
        '  - Script target: schema + compatGuard rules',
        '',
        'Options:',
        '  --target=<surface>  Validate for surface-specific rules; script is only supported value today',
        '  --json              Output validation result as JSON',
        '',
        'Examples:',
        '  specialists validate my-specialist',
        '  specialists validate ./docs/example.specialist.json --target=script',
        '  specialists validate ./docs/example.specialist.json --target script --json',
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
        'Usage: specialists edit <name> <dot.path> <value> [options]',
        '       specialists edit <name> --get <dot.path>',
        '       specialists edit <name> --set <dot.path> <value> [options]',
        '       specialists edit --all --get <dot.path>',
        '       specialists edit --all --set <dot.path> <value> [options]',
        '       specialists edit --all',
        '       specialists edit <name> --preset <preset> [--dry-run]',
        '       specialists edit --global [name.field value]',
        '       specialists edit --global --get name.execution.model',
        '       specialists edit --global --set name.execution.model <value>',
        '       specialists edit --list-presets',
        '',
        'Edit specialist YAML fields via schema-validated dot-paths.',
        '',
        'Options:',
        '  --global                 Edit ~/.config/specialists/user.json override layer',
        '  --append                 Append value(s) to array field',
        '  --remove                 Remove value(s) from array field',
        '  --file <path>            Read value from file (prompt.system/task_template)',
        '  --preset <name>          Apply a preset (bundle of field values)',
        '  --list-presets            Show available presets',
        '  --dry-run                Preview change without writing',
        '  --scope <default|user>   Disambiguate duplicate names across scopes (excludes --global)',
        '  --all                    Target all specialists (or open all in $EDITOR when used alone)',
        '',
        'Backwards-compat aliases:',
        '  --model, --fallback-model, --description, --permission, --timeout, --tags',
        '',
        'Examples:',
        '  specialists edit code-review specialist.execution.model anthropic/claude-opus-4-6',
        '  specialists edit code-review --get specialist.execution.timeout_ms',
        '  specialists edit code-review --set specialist.metadata.tags review,security --append',
        '  specialists edit code-review --set specialist.prompt.system _ --file ./prompt.txt',
        '  specialists edit code-review --preset power',
        '  specialists edit code-review --preset cheap --dry-run',
        '  specialists edit --all --get specialist.execution.mode',
        '  specialists edit --list-presets',
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
        'Usage: specialists config <get|set|show> <key|specialist> [value] [options]',
        '',
        '⚠ DEPRECATED: use specialists edit instead.',
        '',
        'Delegates to:',
        '  specialists edit --all --get <key>',
        '  specialists edit --all --set <key> <value>',
        '  specialists edit <name> --get <key>',
        '  specialists edit <name> --set <key> <value>',
        '  specialists config show <specialist> --resolved',
        '',
        'Options:',
        '  --all                     Target all specialists',
        '  --name <specialist>       Target one specialist',
        '  --resolved                Show resolved manifest and tool attribution',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/config.js');
    return handler();
  }

  if (sub === 'chat') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists chat <name> [prompt...] [--bead <id>] [--prompt <text>] [--context-depth N] [--model M]',
        '',
        'Interactive shell for a specialist run. Streams job output into a TUI.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/chat.js');
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
        '  explicit wt specialists run <name> --bead <id> --worktree',
        '  reuse job:  specialists run <name> --bead <id> --job <prior-job-id>',
        '',
        'Options:',
        '  --bead <id>          Use an existing bead as the prompt source',
        '  --prompt <text>      Ad-hoc prompt for untracked work',
        '  --context-depth <n>  Dependency context depth when using --bead (default: 3)',
        '  --no-beads           Do not create a new tracking bead (does not disable bead reading)',
        '  --no-bead-notes      Do not append completion notes to an external --bead',
        '  --model <model>      Override the configured model for this run',
        '  --keep-alive         Keep session alive for follow-up prompts',
        '  --worktree           Explicitly provision (or reuse) a bd-managed worktree derived from --bead.',
        '                       Requires --bead. Mutually exclusive with --job.',
        '  --job <id>           Reuse the workspace of a prior job (must have been started with',
        '                       --worktree). Caller bead context remains authoritative.',
        '                       Mutually exclusive with --worktree.',
        '  --epic <id>          Explicit epic membership for this job. Defaults to bead.parent.',
        '                       Useful for prep jobs belonging to a merge-gated epic.',
        '  --force-job          Bypass concurrency guard for active worktrees (MEDIUM/HIGH).',
        '  --force-stale-base   Bypass stale-base guard when epic sibling chains have unmerged',
        '                       substantive commits. Use at risk of later merge conflicts.',
        '',
        'Examples:',
        '  specialists run debugger --bead unitAI-55d',
        '  specialists run debugger --bead unitAI-55d --context-depth 2',
        '  specialists run executor --bead hgpu.3 --worktree',
        '  specialists run executor --bead impl-2 --worktree --force-stale-base',
        '  specialists run reviewer --bead hgpu.3 --job <prior-job-id>',
        '  specialists run reviewer --job <exec-id> --force-job --bead fix-123',
        '  specialists run explorer --bead prep.1 --epic unitAI-100',
        '  specialists run code-review --prompt "Audit src/api.ts"',
        '  cat brief.md | specialists run report-generator',
        '',
        'Rules:',
        '  Use --bead for tracked work.',
        '  MEDIUM/HIGH specialists auto-provision a worktree when requires_worktree=true.',
        '  Use --job to reuse a prior worktree without re-provisioning.',
        '  --worktree and --job are mutually exclusive.',
        '  --worktree requires --bead to derive a deterministic branch name.',
        '',
        'Async execution patterns:',
        '  MCP:   use_specialist (foreground, returns result directly)',
        '  CLI:   run prints [job started: <id>] on stderr, then use ps/feed/result',
        '  Shell: specialists run <name> --prompt "..." &',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/run.js');
    return handler();
  }

  if (sub === 'node') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists node <run|list|promote|members|memory|stop|spawn-member|create-bead|wait-phase|complete> [options]',
        '',
        'Commands:',
        '  run <node-config> [--inline JSON] [--bead <bead-id>] [--context-depth <n>] [--json]',
        '                                                      Start a NodeSupervisor run',
        '  list [--json]                                       List node configs; source order: repo config/nodes -> .specialists/default/nodes -> package config/nodes',
        '  spawn-member --node <node-ref> --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--scope <paths>] [--json]',
        '                                                      Spawn a dynamic node member',
        '  create-bead --node <node-ref> --title "..." [--type task] [--priority 2] [--depends-on <id>] [--json]',
        '                                                      Create follow-up bead from node context',
        '  wait-phase --node <node-ref> --phase <id> --members <k1,k2,...> [--timeout <ms>] [--json]',
        '                                                      Wait until listed phase members are terminal',
        '  complete --node <node-ref> --strategy <pr|manual> [--force-draft-pr] [--json]',
        '                                                      Complete node run with selected strategy',
        '  members <node-ref> [--json]                        Show member state + lineage metadata',
        '  memory <node-ref> [--json]                         Show accumulated node memory summaries',
        '  stop <node-ref> [--json]                           Gracefully stop coordinator + members',
        '  promote <node-ref> <finding-id> --to-bead <bead-id> [--json]',
        '                                                      Promote a finding to bead notes',
        '',
        'Node refs accept any unique prefix.',
        'Node configs: explicit path wins; named lookup prefers repo config/nodes, then .specialists/default/nodes, then package config/nodes.',
        'Customize repo-owned nodes in config/nodes; run specialists init to refresh managed mirror.',
        '',
        'Examples:',
        '  specialists node run research --bead unitAI-123 --context-depth 2',
        '  specialists node members research --json',
        '  specialists node memory research',
        '  specialists node spawn-member --node research --member-key explore-1 --specialist explorer --phase explore-1 --json',
        '  specialists node wait-phase --node research --phase explore-1 --members explore-1 --json',
        '  specialists result research:explore-1 --wait --json',
        '  specialists ps --node research --json',
        '  specialists node stop research',
        '  specialists node promote research finding-1 --to-bead unitAI-123',
        '',
      ].join('\n'));
      return;
    }
    const { handleNodeCommand } = await import('./cli/node.js');
    await handleNodeCommand(process.argv.slice(3));
    process.exit(0);
  }

  if (sub === 'epic') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists epic <list|status|sync|abandon|merge> [options]',
        '',
        'Epic lifecycle management for wave-bound chain groups.',
        '',
        'Commands:',
        '  list [--unresolved] [--json]                Enumerate epics with readiness',
        '  status <epic-id> [--json]                   Show derived readiness and chain status',
        '  sync <epic-id> [--apply] [--json]           Reconcile epic drift (dry-run by default)',
        '  abandon <epic-id> --reason <text> [--force] [--json]  Transition epic to abandoned',
        '  merge <epic-id> [--rebuild] [--pr] [--json] Publish epic chains (direct merge or PR mode)',
        '',
        'Options:',
        '  --unresolved    Filter list to open epics only',
        '  --json          Machine-readable JSON output',
        '',
        'Readiness:',
        '  status is derived from live chain readiness',
        '  persisted lifecycle state is compatibility metadata only',
        '',
        'Examples:',
        '  specialists epic list',
        '  specialists epic list --unresolved',
        '  specialists epic status unitAI-epic1',
        '  specialists epic merge unitAI-epic1 --pr',
        '',
      ].join('\n'));
      return;
    }
    const { handleEpicCommand } = await import('./cli/epic.js');
    handleEpicCommand(process.argv.slice(3));
    process.exit(0);
  }

  if (sub === 'status') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists status [options]',
        '',
        'Show current runtime state and active-mode status.',
        '',
        'Sections include:',
        '  - discovered specialists',
        '  - pi provider/runtime health',
        '  - beads availability',
        '  - MCP registration hints',
        '  - active background jobs and mode detection',
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

  if (sub === 'ps') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists ps [options]',
        '',
        'Process dashboard — shows active jobs plus unresolved terminal problems.',
        'Cleaned dashboard history and dead jobs are filtered by default. Includes',
        'context%, bead title, and next-action hints on every row.',
        '',
        'Options:',
        '  --json              Structured JSON output with trees[].children[] schema',
        '  --all               Include every row, including cleaned/dead/terminal history',
        '  --follow, -f        Live dashboard; TTY repaints in-place, pipes append ANSI-free snapshots',
        '  --health            Show detailed process health tables (default is aggregate only)',
        '  --active            Show active jobs only; hide unresolved terminal problems',
        '  --include-terminal  Include terminal history that has not been cleaned',
        '  --include-cleaned   Include rows hidden by sp clean --ps',
        '',
        'Output columns:',
        '  st           Status icon: ◉ running, ◐ waiting/starting, ○ done/error',
        '  id           6-char job ID',
        '  specialist   Specialist name (executor, explorer, reviewer, ...)',
        '  ctx%         Context window utilization (-- if unavailable)',
        '  elapsed      Compact elapsed time (e.g. 5m03s)',
        '  bead         Bead ID + title (if bead-linked)',
        '  next         Suggested action (feed, resume, result, ...)',
        '',
        'Grouping:',
        '  Jobs sharing a worktree (via --job) appear as nested ├─/└─ chains.',
        '  Node coordinator → member relationships are shown inline.',
        '  Standalone jobs appear ungrouped at the bottom.',
        '',
        'Node refs accept any unique prefix.',
        '',
        'Dashboard cleanup:',
        '  sp clean --ps --dry-run previews terminal rows to hide from default ps.',
        '  sp clean --ps hides terminal rows without deleting DB history or changing status.',
        '  Use --include-cleaned or --all to audit cleaned rows later.',
        '',
        'Examples:',
        '  specialists ps              Active + unresolved terminal problems',
        '  specialists ps --active     Active jobs only',
        '  specialists ps --include-terminal  Include uncleaned terminal history',
        '  specialists ps --include-cleaned   Show rows hidden by sp clean --ps',
        '  specialists ps --all        Full audit view including cleaned/dead/history',
        '  specialists ps --json       Machine-readable tree output',
        '  specialists ps --node research  Filter dashboard to one node run',
        '  specialists ps --follow     Live dashboard with auto-refresh',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/ps.js');
    return handler();
  }

  if (sub === 'result') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists result <node-ref>:<member> [--wait] [--timeout <seconds>] [--json]',
        '       specialists result <job-id> [--wait] [--timeout <seconds>] [--json]',
        '       specialists result --node <node-ref> --member <member-key> [--wait] [--timeout <seconds>] [--json]',
        '       specialists result --member <member-key> [--wait] [--timeout <seconds>] [--json]',
        '',
        'Print the final output of a completed job.',
        'Exits with code 1 if the job is still running or failed.',
        '',
        'Node refs accept any unique prefix.',
        '',
        'Examples:',
        '  specialists result research:explore-1',
        '  specialists result --member explore-1 --wait',
        '  specialists result job_a1b2c3d4 > output.md',
        '  specialists result --node research --member explore-1 --wait --json',
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
        '       specialists feed [--node <node-ref>] -f [--forever]',
        '',
        'Read job events. DB-backed in normal runtime; file scans are legacy/operator-only.',
        '',
        'Modes:',
        '  specialists feed <job-id>        Replay events for one job (DB-backed)',
        '  specialists feed <job-id> -f     Follow one job until completion',
        '  specialists feed -f              Follow all jobs globally',
        '',
        'Options:',
        '  --node <node-ref> Filter jobs by node id',
        '  --from <n>     Show only events with seq >= <n>',
        '  -f, --follow   Follow live updates',
        '  --forever      Keep following in global mode even when all jobs complete',
        '',
        'Node refs accept any unique prefix.',
        '',
        'Examples:',
        '  specialists feed 49adda',
        '  specialists feed 49adda --from 15',
        '  specialists feed 49adda --follow',
        '  specialists feed -f',
        '  specialists feed --node research -f',
        '  specialists feed -f --forever',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/feed.js');
    return handler();
  }


  if (sub === 'forensic') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists forensic [job-id] [--family <name>] [--event-name <name>] [--since <5m|iso>] [--limit <n>] [--json]',
        '',
        'Query canonical persisted xtrm.forensic.v1 events from observability SQLite.',
        '',
        'Options:',
        '  --family <name>      Filter by event_family, e.g. job/tool/model/error',
        '  --event-name <name>  Filter by event_name, e.g. tool.call.completed',
        '  --since <5m|iso>     Filter by event timestamp',
        '  --limit <n>          Maximum rows (default 1000, max 10000)',
        '  --json               Emit forensic event JSON as NDJSON (default)',
        '',
        'Examples:',
        '  specialists forensic 49adda --json',
        '  specialists forensic --family error --since 24h',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/forensic.js');
    return handler();
  }

  if (sub === 'metrics') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists metrics [--prometheus] [--since <5m|iso>]',
        '',
        'Project low-cardinality xtrm AgentOps telemetry into Prometheus text format.',
        '',
        'Source of truth:',
        '  - observability SQLite runtime state and job metrics',
        '  - forensic-event semantics from xtrm.forensic.v1',
        '',
        'Options:',
        '  --prometheus       Emit Prometheus exposition text (default)',
        '  --since <5m|iso>   Restrict job-metric backfill rows by updated_at_ms',
        '',
        'Examples:',
        '  specialists metrics',
        '  specialists metrics --prometheus --since 24h',
        '',
        'Label discipline:',
        '  Outputs only low-cardinality labels such as participant_kind/participant_role.',
        '  Opaque ids (job_id, chain_id, participant_id, trace_id) are never labels.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/metrics.js');
    return handler();
  }

  if (sub === 'log') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists log [job-id] [options]',
        '       specialists log -f [--specialist <name>] [--bead <id>]',
        '',
        'Runtime-oriented specialist log stream. From a repo root it reads that repo;',
        'from a parent directory it aggregates child repos with observability DBs.',
        'Unlike feed, it does not suppress',
        'control/lifecycle rows and every row includes timestamp, job, specialist,',
        'bead, compact worktree, status, pid, and runtime event detail.',
        '',
        'Options:',
        '  --job <id>          Filter to one job id',
        '  --specialist <name> Filter by specialist role',
        '  --bead <id>         Filter by bead id',
        '  --node <id>         Filter by node id',
        '  --repo <name>       In parent/global mode, filter to one child repo',
        '  --since <5m|iso>    Show rows after a relative/ISO timestamp',
        '  --limit <n>         Max rows per snapshot (default 200)',
        '  -f, --follow        Continue polling for new rows',
        '  --json              Emit NDJSON rows with full event payloads',
        '  --all-events        Include agent-internal feed events (tool/turn/text/etc.)',
        '',
        'Examples:',
        '  specialists log 49adda',
        '  specialists log --bead unitAI-123 --limit 500',
        '  specialists log --specialist reviewer -f',
        '  specialists log -f --json',
        '',
        'Default output is runtime-only; use --all-events for raw agent internals.',
        'Use feed for compact human progress; use log for debugging crashes,',
        'dispatch/resume/steer/stop signals, and terminal error provenance.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/log.js');
    return handler();
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
        '       specialists clean --ps [--dry-run]',
        '       specialists clean --reap-orphans [--dry-run]',
        '       specialists clean --observability --before <iso|duration> [--include-epics] [--dry-run]',
        '',
        'Clean specialist runtime artifacts and dashboard visibility.',
        '',
        'Default behavior:',
        '  - removes done/error job directories older than SPECIALISTS_JOB_TTL_DAYS',
        '  - TTL defaults to 7 days if env is unset',
        '  - never removes SQLite artifacts (*.db, *.db-wal, *.db-shm)',
        '  - never prunes observability.db rows unless --observability is explicit',
        '',
        'Dashboard cleanup:',
        '  - --ps soft-hides terminal rows from default sp ps',
        '  - --ps does not delete SQLite rows or change job status',
        '  - sp ps --include-cleaned / --all restore audit visibility',
        '',
        'Observability cleanup:',
        '  - --observability prunes terminal SQLite rows via the DB prune path',
        '  - requires --before <iso|duration>; examples: 30d, 2026-01-01T00:00:00Z',
        '  - preserves active/waiting/running jobs and memories_* tables',
        '',
        'Options:',
        '  --all           Remove all done/error job directories regardless of age',
        '  --keep <n>      Keep only the N most recent done/error job directories',
        '  --dry-run       Preview filesystem, dashboard, or process cleanup',
        '  --ps            Hide terminal rows from default ps without deleting DB history',
        '  --observability Prune terminal observability.db rows (requires --before)',
        '  --before <value> Cutoff for --observability (ISO date or duration like 30d)',
        '  --include-epics Also prune eligible terminal epic_runs with --observability',
        '  --reap-orphans  Reap orphan/stale leaked tool processes; detects',
        '                  dead-pid (PID gone), orphaned-keep-alive (PID alive,',
        '                  ppid=1, status=waiting), dead-toolchain (PID alive but',
        '                  no tool/think events in last 30min); all require 30min',
        '                  min-age threshold',
        '',
        'Examples:',
        '  specialists clean',
        '  specialists clean --all',
        '  specialists clean --keep 20',
        '  specialists clean --dry-run',
        '  specialists clean --ps --dry-run',
        '  specialists clean --ps',
        '  specialists clean --observability --before 30d --dry-run',
        '  specialists clean --observability --before 30d',
        '  specialists clean --reap-orphans --dry-run',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/clean.js');
    return handler();
  }

  if (sub === 'merge') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists merge <target-bead-id> [--target-branch <name>] [--rebuild]',
        '',
        'Publish a chain root bead branch. Epic publication belongs to `sp epic merge`.',
        '',
        'Behavior:',
        '  - chain root target: merges one associated branch',
        '  - unresolved epic member: refuses and points to `sp epic merge <epic-id>`',
        '  - runs `bunx tsc --noEmit` after each merge and stops on failure',
        '  - stops on first merge conflict and reports conflicting files',
        '  - --target-branch overrides origin/HEAD as rebase target; useful for',
        '    chains forked from non-main branches',
        '  - ignores dirty .beads/issues.jsonl and .xtrm/skills/active/**',
        '  - NOTE: for epic publication with lifecycle management, use `sp epic merge`',
        '',
        'Options:',
        '  --rebuild   Run `bun run build` after all merges complete',
        '',
        'Examples:',
        '  specialists merge unitAI-abc1',
        '  specialists merge unitAI-abc1 --rebuild',
        '',
        'See also:',
        '  specialists epic merge <epic-id> [--pr]   # lifecycle-gated epic publication',
        '  specialists end [--pr]                       # session-close publication helper',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/merge.js');
    return handler();
  }

  if (sub === 'epic') {
    const { handleEpicCommand } = await import('./cli/epic.js');
    await handleEpicCommand(process.argv.slice(3));
    return;
  }

  if (sub === 'end') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists end [--bead <id>|--epic <id>] [--pr] [--rebuild]',
        '',
        'Session-close publication helper aware of chain/epic lifecycle rules.',
        '',
        'Behavior:',
        '  - if --epic is provided: routes to `sp epic merge <epic-id>`',
        '  - if chain belongs to unresolved epic: redirects to epic publication',
        '  - otherwise publishes current/selected chain via `sp merge` semantics',
        '  - --pr publishes via pull request instead of direct merge',
        '',
        'Examples:',
        '  specialists end --bead unitAI-abc1',
        '  specialists end --epic unitAI-epic1 --pr',
        '  specialists end --pr',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/end.js');
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

  if (sub === 'finalize') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists finalize <job-id>',
        '',
        'Finalize waiting keep-alive job after reviewer PASS.',
        'Reads SQLite-first compliance verdict from observability.db specialist_results.',
        'Falls back to result.txt when SPECIALISTS_JOB_FILE_OUTPUT=on.',
        'Accepts any chain member job-id and finalizes full keep-alive chain.',
        'Refuses non-waiting or non-PASS jobs.',
        '',
        'Examples:',
        '  specialists finalize job_a1b2c3d4',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/finalize.js');
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
        'See also: specialists list --live   (DB-backed active jobs; legacy file scans are operator-only)',
      ].join('\n') + '\n');
      process.exit(0);
    }
    const { run: handler } = await import('./cli/attach.js');
    return handler();
  }

  if (sub === 'prune-stale-defaults') {
    const { run: handler } = await import('./cli/prune-stale-defaults.js');
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
        'Usage: specialists doctor [orphans]',
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
        '  8. CLAUDE.md fragments (XTRM-MANAGED sentinels) — delegates to xt claude-sync',
        '  9. drift check for stale managed mirrors (--check-drift / --drift)',
        '',
        'Behavior:',
        '  - prints fix hints for failing checks',
        '  - auto-creates missing runtime directories when possible',
        '',
        'Subcommands:',
        '  orphans   Read-only orphan scan: membership/jobs/epics/worktree pointers',
        '  --check-drift, --drift   Compare .specialists/default/ snapshots against package canonical',
        '                            Category A (specialists runtime) and Category B',
        '                            (filesystem skills/hooks) are distinct; doctor',
        '                            covers Category A only',
        '',
        'Examples:',
        '  specialists doctor',
        '  specialists doctor orphans',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/doctor.js');
    return handler(process.argv.slice(3));
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

  if (sub === 'serve') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists serve [--port <n>] [--concurrency <n>] [--shutdown-grace-ms <n>] [--project-dir <path>]',
        '',
        'HTTP wrapper for script-class specialists.',
        '',
        'Routes:',
        '  POST /v1/generate',
        '  GET  /healthz',
        '  GET  /metrics',
        '  GET  /jobs/:job_id/feed-events',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/serve.js');
    return handler(process.argv.slice(3));
  }

  if (sub === 'script') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists script <name> [--vars key=value ...] [--template <text>] [--model <override>] [--thinking <level>] [--user-dir <path>] [--db-path <path>] [--timeout-ms <n>] [--json] [--single-instance <lockpath>] [--no-trace]',
        '',
        'One-shot script-class specialist runner for cron and host scripts.',
        '',
        'Outputs:',
        '  default  assistant text only',
        '  --json   full GenerateResponse JSON',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/script.js');
    return handler(process.argv.slice(3));
  }

  if (sub === 'release') {
    console.error('Deprecated. Use `xt release prepare/publish`. This alias will be removed in v4.0.');
    const result = spawnSync('xt', ['release', ...process.argv.slice(3)], { stdio: 'inherit' });
    if (result.error) {
      console.error(`Failed to run xt release: ${result.error.message}`);
      process.exit(1);
    }
    process.exit(result.status ?? 1);
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

run()
  .then(() => {
    if (sub && sub !== 'serve') process.exit(process.exitCode ?? 0);
  })
  .catch((error) => {
    logger.error(`Fatal error: ${error}`);
    process.exit(1);
  });
