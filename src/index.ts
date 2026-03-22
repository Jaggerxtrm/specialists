#!/usr/bin/env node

/**
 * Specialists MCP Server — entry point
 * Subcommands: install, version, list, models, init, edit, run, status,
 *              result, feed, stop, quickstart, help
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
        'Usage: specialists install',
        '',
        'Project setup: checks pi/bd/xt prerequisites, registers the MCP server,',
        'and installs specialists-specific project hooks.',
        '',
        'No flags — just run it.',
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
        'List available specialists across all scopes.',
        '',
        'Options:',
        '  --scope <project|user>   Filter by scope',
        '  --category <name>        Filter by category tag',
        '  --json                   Output as JSON array',
        '',
        'Examples:',
        '  specialists list',
        '  specialists list --scope project',
        '  specialists list --category analysis',
        '  specialists list --json',
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
        'Usage: specialists init',
        '',
        'Initialize specialists in the current project:',
        '  • Creates specialists/           — put .specialist.yaml files here',
        '  • Creates .specialists/          — runtime data (gitignored)',
        '  • Adds .specialists/ to .gitignore',
        '  • Scaffolds AGENTS.md            — context injected into Claude sessions',
        '  • Registers specialists in .mcp.json at project scope',
        '',
        'Safe to run on an existing project (skips already-present items).',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/init.js');
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
        '  --scope <project|user>   Disambiguate if same name exists in multiple scopes',
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
        'Run a specialist. Streams output to stdout by default.',
        'Reads prompt from stdin if --prompt is not provided.',
        '',
        'Options:',
        '  --prompt <text>    Prompt to send to the specialist (required unless piped or --bead is used)',
        '  --bead <id>        Read the task from an existing bead and use it as the prompt',
        '  --model <model>    Override the model for this run only',
        '  --background       Run async; prints job ID and exits immediately',
        '  --no-beads         Skip creating a tracking bead for this run',
        '  --context-depth <n> Inject outputs from completed blockers (1=immediate, 2=recursive)',
        '',
        'Examples:',
        '  specialists run code-review --prompt "Audit src/api.ts"',
        '  specialists run code-review --bead unitAI-55d',
        '  specialists run code-review --prompt "..." --background',
        '  cat brief.md | specialists run deep-analysis',
        '  specialists run code-review --model anthropic/claude-opus-4-6 --prompt "..."',
        '',
        'See also:',
        '  specialists feed --help   (tail events for a background job)',
        '  specialists result --help (read background job output)',
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
        'Show system health: pi runtime, beads installation, MCP registration,',
        'and all active background jobs.',
        '',
        'Options:',
        '  --json    Output as JSON',
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
        '       specialists feed --job <job-id> [options]',
        '',
        'Print events emitted by a background job.',
        '',
        'Options:',
        '  --follow, -f    Stay open and stream new events as they arrive',
        '                  (exits automatically when job completes)',
        '',
        'Examples:',
        '  specialists feed job_a1b2c3d4',
        '  specialists feed job_a1b2c3d4 --follow',
        '  specialists feed --job job_a1b2c3d4 -f',
        '',
        'Event types: tool_use · tool_result · text · agent_end · error',
        '',
      ].join('\n'));
      return;
    }
    const { run: handler } = await import('./cli/feed.js');
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
        'Health check for your specialists installation:',
        '  1. pi installed and has at least one active provider',
        '  2. All 7 Claude Code hooks present and wired in settings.json',
        '  3. MCP server registered (claude mcp get specialists)',
        '  4. .specialists/jobs/ and .specialists/ready/ dirs exist',
        '  5. No zombie jobs (running status but dead PID)',
        '',
        'Prints fix hints for each failure.',
        'Auto-creates missing runtime directories.',
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
        'Usage: specialists setup [options]',
        '',
        'Inject the Specialists Workflow context block into AGENTS.md or CLAUDE.md.',
        'This teaches agents in that project how to use specialists.',
        '',
        'Options:',
        '  --project, -p   Write to ./CLAUDE.md (default)',
        '  --agents,  -a   Write to ./AGENTS.md',
        '  --global,  -g   Write to ~/.claude/CLAUDE.md',
        '  --dry-run       Preview the block without writing',
        '',
        'Examples:',
        '  specialists setup                  # → ./CLAUDE.md',
        '  specialists setup --agents         # → ./AGENTS.md',
        '  specialists setup --global         # → ~/.claude/CLAUDE.md',
        '  specialists setup --dry-run        # preview only',
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
