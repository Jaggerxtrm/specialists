// src/cli/setup.ts
// Inject specialists workflow context into AGENTS.md or CLAUDE.md.
// Mirrors: bd setup claude

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function ok(msg: string)   { console.log(`  ${green('✓')} ${msg}`); }
function skip(msg: string) { console.log(`  ${yellow('○')} ${msg}`); }

// ── Specialists workflow block ─────────────────────────────────────────────────
const MARKER = '## Specialists Workflow';

const WORKFLOW_BLOCK = `## Specialists Workflow

> Injected by \`specialists setup\`. Keep this section — agents use it for context.

### When to use specialists

Specialists are autonomous AI agents (running via the \`specialists\` MCP server)
optimised for heavy tasks: code review, deep bug analysis, test generation,
architecture design. Use them instead of doing the work yourself when the task
would benefit from a fresh perspective, a second opinion, or a different model.

### Quick reference

\`\`\`
# List available specialists
specialists list                                    # all scopes
specialists list --scope project                    # this project only

# Run a specialist (foreground — streams output)
specialists run <name> --prompt "..."

# Run async (background — immediate job ID)
specialists run <name> --prompt "..." --background
  → Job started: job_a1b2c3d4

# Watch / get results
specialists feed job_a1b2c3d4 --follow             # tail live events
specialists result job_a1b2c3d4                    # read final output
specialists stop job_a1b2c3d4                      # cancel if needed
\`\`\`

### MCP tools (available in this session)

| Tool | Purpose |
|------|---------|
| \`specialist_init\` | Bootstrap: bd init + list specialists |
| \`list_specialists\` | Discover specialists across scopes |
| \`use_specialist\` | Run foreground: load → inject context → execute → output |
| \`start_specialist\` | Start async: returns job ID immediately |
| \`poll_specialist\` | Poll job status + delta output by ID |
| \`stop_specialist\` | Cancel a running job |
| \`run_parallel\` | Run multiple specialists concurrently or as a pipeline |
| \`specialist_status\` | Circuit breaker health + staleness |

### Completion banner format

When a specialist finishes, you may see:

\`\`\`
✓ bead unitAI-xxx  4.1s  anthropic/claude-sonnet-4-6
\`\`\`

This means:
- The specialist completed successfully
- A beads issue (\`unitAI-xxx\`) was created to track the run
- The result can be fetched with \`specialists result <job-id>\`

### When NOT to use specialists

- Simple single-file edits — just do it directly
- Tasks that need interactive back-and-forth — use foreground mode or work yourself
- Short read-only queries — faster to answer directly
`;

// ── Targets ───────────────────────────────────────────────────────────────────
type Target = 'project' | 'global' | 'agents';

function resolveTarget(target: Target): string {
  switch (target) {
    case 'global':  return join(homedir(), '.claude', 'CLAUDE.md');
    case 'agents':  return join(process.cwd(), 'AGENTS.md');
    case 'project':
    default:        return join(process.cwd(), 'CLAUDE.md');
  }
}

function parseArgs(): { target: Target; dryRun: boolean } {
  const argv = process.argv.slice(3);
  let target: Target = 'project';
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--global'  || token === '-g') { target = 'global';  continue; }
    if (token === '--agents'  || token === '-a') { target = 'agents';  continue; }
    if (token === '--project' || token === '-p') { target = 'project'; continue; }
    if (token === '--dry-run')                   { dryRun = true;      continue; }
  }

  return { target, dryRun };
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const { target, dryRun } = parseArgs();
  const filePath = resolve(resolveTarget(target));
  const label    = target === 'global' ? '~/.claude/CLAUDE.md' : filePath.replace(process.cwd() + '/', '');

  console.log(`\n${bold('specialists setup')}\n`);
  console.log(`  Target: ${yellow(label)}${dryRun ? dim('  (dry-run)')  : ''}\n`);

  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');

    if (existing.includes(MARKER)) {
      skip(`${label} already contains Specialists Workflow section`);
      console.log(`\n  ${dim('To force-update, remove the ## Specialists Workflow section and re-run.')}\n`);
      return;
    }

    if (dryRun) {
      console.log(dim('─'.repeat(60)));
      console.log(dim('Would append to existing file:'));
      console.log('');
      console.log(WORKFLOW_BLOCK);
      console.log(dim('─'.repeat(60)));
      return;
    }

    const separator = existing.trimEnd().endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(filePath, existing.trimEnd() + separator + WORKFLOW_BLOCK, 'utf8');
    ok(`Appended Specialists Workflow section to ${label}`);
  } else {
    if (dryRun) {
      console.log(dim('─'.repeat(60)));
      console.log(dim(`Would create ${label}:`));
      console.log('');
      console.log(WORKFLOW_BLOCK);
      console.log(dim('─'.repeat(60)));
      return;
    }

    writeFileSync(filePath, WORKFLOW_BLOCK, 'utf8');
    ok(`Created ${label} with Specialists Workflow section`);
  }

  console.log('');
  console.log(`  ${dim('Next steps:')}`);
  console.log(`  • Restart Claude Code to pick up the new context`);
  console.log(`  • Run ${yellow('specialists list')} to see available specialists`);
  console.log(`  • Run ${yellow('specialist_init')} in a new session to bootstrap context`);
  console.log('');
}
