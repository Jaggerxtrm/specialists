#!/usr/bin/env node

/**
 * Specialists MCP Server — entry point
 * Subcommands: install, version, list, models, init, validate, edit, run, status,
 *              result, feed, poll, stop, quickstart, help
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
        '',
        'Options:',
        '  --category <name>   Filter by category tag',
        '  --json              Output as JSON array',
        '',
        'Examples:',
        '  specialists list',
        '  specialists list --category analysis',
        '  specialists list --json',
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
        'Usage: specialists init [--force-workflow]',
        '',
        'Bootstrap a project for specialists. This is the sole onboarding command.',
        '',
        'What it does:',
        '  • creates specialists/ for project .specialist.yaml files',
        '  • creates .specialists/ runtime dirs (jobs/, ready/)',
        '  • adds .specialists/ to .gitignore',
        '  • injects the managed workflow block into AGENTS.md and CLAUDE.md',
        '  • registers the Specialists MCP server at project scope',
        '',
        'Options:',
        '  --force-workflow   Overwrite existing managed workflow blocks',
        '',
        'Examples:',
        '  specialists init',
        '  specialists init --force-workflow',
        '',
        'Notes:',
        '  setup and install are deprecated; use specialists init.',
        '  Safe to run again; existing project state is preserved where possible.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/init.js');
    return handler();
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
        '',
        'Examples:',
        '  specialists edit code-review --model anthropic/claude-opus-4-6',
        '  specialists edit code-review --permission HIGH --dry-run',
        '  specialists edit code-review --tags analysis,security',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/edit.js');
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
        '  tracked:  specialists run <name> --bead <id>',
        '  ad-hoc:   specialists run <name> --prompt "..."',
        '',
        'Options:',
        '  --bead <id>          Use an existing bead as the prompt source',
        '  --prompt <text>      Ad-hoc prompt for untracked work',
        '  --context-depth <n>  Dependency context depth when using --bead (default: 1)',
        '  --no-beads           Do not create a new tracking bead (does not disable bead reading)',
        '  --model <model>      Override the configured model for this run',
        '  --keep-alive         Keep session alive for follow-up prompts',
        '',
        'Examples:',
        '  specialists run bug-hunt --bead unitAI-55d',
        '  specialists run bug-hunt --bead unitAI-55d --context-depth 2',
        '  specialists run code-review --prompt "Audit src/api.ts"',
        '  cat brief.md | specialists run report-generator',
        '',
        'Rules:',
        '  Use --bead for tracked work.',
        '  Use --prompt for quick ad-hoc work.',
        '',
        'Background execution:',
        '  Use Claude Code\'s native backgrounding (run_in_background: true)',
        '  or run in a separate terminal and poll with:',
        '    specialists poll <job-id> --json',
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
        'Print the final output of a completed background job.',
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
        'Read background job events.',
        '',
        'Modes:',
        '  specialists feed <job-id>        Replay events for one job',
        '  specialists feed <job-id> -f     Follow one job until completion',
        '  specialists feed -f              Follow all jobs globally',
        '',
        'Options:',
        '  -f, --follow   Follow live updates',
        '  --forever      Keep following in global mode even when all jobs complete',
        '',
        'Examples:',
        '  specialists feed 49adda',
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
        '  - Only works for jobs started with --background.',
        '  - Delivery is best-effort: the agent processes it on its next turn.',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/steer.js');
    return handler();
  }

  if (sub === 'follow-up') {
    if (wantsHelp()) {
      console.log([
        '',
        'Usage: specialists follow-up <job-id> "<message>"',
        '',
        'Send a follow-up prompt to a waiting keep-alive specialist session.',
        'The Pi session retains full conversation history between turns.',
        '',
        'Requires: job started with --keep-alive --background.',
        '',
        'Examples:',
        '  specialists follow-up a1b2c3 "Now write the fix for the bug you found"',
        '  specialists follow-up a1b2c3 "Focus only on the auth module"',
        '',
        'Workflow:',
        '  specialists run bug-hunt --bead <id> --keep-alive --background',
        '  # → Job started: a1b2c3  (status: waiting after first turn)',
        '  specialists result a1b2c3            # read first turn output',
        '  specialists follow-up a1b2c3 "..."   # send next prompt',
        '  specialists feed a1b2c3 --follow      # watch response',
        '',
        'See also: specialists steer (mid-run redirect)',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/follow-up.js');
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
