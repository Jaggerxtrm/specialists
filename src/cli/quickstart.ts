// src/cli/quickstart.ts
// Rich getting-started guide — mirrors bd quickstart quality.

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const blue   = (s: string) => `\x1b[34m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;

function section(title: string): string {
  const bar = '─'.repeat(60);
  return `\n${bold(cyan(title))}\n${dim(bar)}`;
}

function cmd(s: string):  string { return yellow(s); }
function flag(s: string): string { return green(s); }

export async function run(): Promise<void> {
  const lines: string[] = [
    '',
    bold('specialists  ·  Quick Start Guide'),
    dim('One MCP server. Multiple AI backends. Intelligent orchestration.'),
    '',
  ];

  // ── 1. Installation ────────────────────────────────────────────────────────
  lines.push(section('1. Installation'));
  lines.push('');
  lines.push(`  ${cmd('npm install -g @jaggerxtrm/specialists')}    # install globally`);
  lines.push(`  ${cmd('specialists install')}                       # full-stack setup:`);
  lines.push(`  ${dim('                                            #   pi · beads · dolt · MCP · hooks')}`);
  lines.push('');
  lines.push(`  Verify everything is healthy:`);
  lines.push(`  ${cmd('specialists status')}                        # shows pi, beads, MCP, active jobs`);
  lines.push('');

  // ── 2. Initialize a project ────────────────────────────────────────────────
  lines.push(section('2. Initialize a Project'));
  lines.push('');
  lines.push(`  Run once per project root:`);
  lines.push(`  ${cmd('specialists init')}                          # creates specialists/, .specialists/, AGENTS.md`);
  lines.push('');
  lines.push(`  What this creates:`);
  lines.push(`  ${dim('specialists/')}       — put your .specialist.yaml files here`);
  lines.push(`  ${dim('.specialists/')}      — runtime data (jobs/, ready/) — gitignored`);
  lines.push(`  ${dim('AGENTS.md')}          — context block injected into Claude sessions`);
  lines.push('');

  // ── 3. Discover specialists ────────────────────────────────────────────────
  lines.push(section('3. Discover Specialists'));
  lines.push('');
  lines.push(`  ${cmd('specialists list')}                          # all specialists (project + user)`);
  lines.push(`  ${cmd('specialists list')} ${flag('--scope project')}            # project-scoped only`);
  lines.push(`  ${cmd('specialists list')} ${flag('--scope user')}               # user-scoped (~/.specialists/)`);
  lines.push(`  ${cmd('specialists list')} ${flag('--category analysis')}        # filter by category`);
  lines.push(`  ${cmd('specialists list')} ${flag('--json')}                     # machine-readable JSON`);
  lines.push('');
  lines.push(`  Scopes (searched in order):`);
  lines.push(`  ${blue('project')}   ./specialists/*.specialist.yaml`);
  lines.push(`  ${blue('user')}      ~/.specialists/*.specialist.yaml`);
  lines.push(`  ${blue('system')}    bundled specialists (shipped with the package)`);
  lines.push('');

  // ── 4. Running a specialist ────────────────────────────────────────────────
  lines.push(section('4. Running a Specialist'));
  lines.push('');
  lines.push(`  ${bold('Foreground')} (streams output to stdout):`);
  lines.push(`  ${cmd('specialists run code-review')} ${flag('--prompt')} ${dim('"Review src/api.ts for security issues"')}`);
  lines.push('');
  lines.push(`  ${bold('Background')} (returns a job ID immediately):`);
  lines.push(`  ${cmd('specialists run code-review')} ${flag('--prompt')} ${dim('"..."')} ${flag('--background')}`);
  lines.push(`  ${dim('  # → Job started: job_a1b2c3d4')}`);
  lines.push('');
  lines.push(`  Override model for one run:`);
  lines.push(`  ${cmd('specialists run code-review')} ${flag('--model')} ${dim('anthropic/claude-opus-4-6')} ${flag('--prompt')} ${dim('"..."')}`);
  lines.push('');
  lines.push(`  Run without beads issue tracking:`);
  lines.push(`  ${cmd('specialists run code-review')} ${flag('--no-beads')} ${flag('--prompt')} ${dim('"..."')}`);
  lines.push('');
  lines.push(`  Pipe a prompt from stdin:`);
  lines.push(`  ${cmd('cat my-brief.md | specialists run code-review')}`);
  lines.push('');

  // ── 5. Background job lifecycle ────────────────────────────────────────────
  lines.push(section('5. Background Job Lifecycle'));
  lines.push('');
  lines.push(`  ${bold('Watch progress')} — stream events as they arrive:`);
  lines.push(`  ${cmd('specialists feed job_a1b2c3d4')}            # print events so far`);
  lines.push(`  ${cmd('specialists feed job_a1b2c3d4')} ${flag('--follow')}      # tail and stream live updates`);
  lines.push('');
  lines.push(`  ${bold('Read results')} — print the final output:`);
  lines.push(`  ${cmd('specialists result job_a1b2c3d4')}          # exits 1 if still running`);
  lines.push('');
  lines.push(`  ${bold('Cancel a job')}:`);
  lines.push(`  ${cmd('specialists stop job_a1b2c3d4')}            # sends SIGTERM to the agent process`);
  lines.push('');
  lines.push(`  ${bold('Job files')} in ${dim('.specialists/jobs/<job-id>/')}:`);
  lines.push(`  ${dim('status.json')}   — id, specialist, status, pid, started_at, elapsed_s, current_tool`);
  lines.push(`  ${dim('events.jsonl')} — one JSON event per line (tool_use, text, agent_end, error …)`);
  lines.push(`  ${dim('result.txt')}    — final output (written when status=done)`);
  lines.push('');

  // ── 6. Editing specialists ─────────────────────────────────────────────────
  lines.push(section('6. Editing Specialists'));
  lines.push('');
  lines.push(`  Change a field without opening the YAML manually:`);
  lines.push(`  ${cmd('specialists edit code-review')} ${flag('--model')} ${dim('anthropic/claude-sonnet-4-6')}`);
  lines.push(`  ${cmd('specialists edit code-review')} ${flag('--description')} ${dim('"Updated description"')}`);
  lines.push(`  ${cmd('specialists edit code-review')} ${flag('--timeout')} ${dim('120000')}`);
  lines.push(`  ${cmd('specialists edit code-review')} ${flag('--permission')} ${dim('HIGH')}`);
  lines.push(`  ${cmd('specialists edit code-review')} ${flag('--tags')} ${dim('analysis,security,review')}`);
  lines.push('');
  lines.push(`  Preview without writing:`);
  lines.push(`  ${cmd('specialists edit code-review')} ${flag('--model')} ${dim('...')} ${flag('--dry-run')}`);
  lines.push('');

  // ── 7. .specialist.yaml schema ────────────────────────────────────────────
  lines.push(section('7. .specialist.yaml Schema'));
  lines.push('');
  lines.push(`  Full annotated example:`);
  lines.push('');
  const schemaLines = [
    'specialist:',
    '  metadata:',
    '    name: my-specialist          # required · used in "specialists run <name>"',
    '    version: 1.0.0               # semver, for staleness detection',
    '    description: "What it does"  # shown in specialists list',
    '    category: analysis           # free-form tag for --category filter',
    '    tags: [review, security]     # array of labels',
    '    updated: "2026-03-11"        # ISO date — used for staleness check',
    '',
    '  execution:',
    '    mode: tool                   # tool (default) | chat',
    '    model: anthropic/claude-sonnet-4-6   # primary model',
    '    fallback_model: qwen-cli/qwen3-coder  # if primary circuit-breaks',
    '    timeout_ms: 120000           # ms before job is killed (default: 120000)',
    '    stall_timeout_ms: 30000      # ms of silence before stall-detection fires',
    '    response_format: markdown    # markdown | json | text',
    '    permission_required: MEDIUM  # READ_ONLY | LOW | MEDIUM | HIGH',
    '',
    '  prompt:',
    '    system: |                    # system prompt (multiline YAML literal block)',
    '      You are …',
    '    user_template: |             # optional; $prompt and $context are substituted',
    '      Task: $prompt',
    '      Context: $context',
    '',
    '  skills:',
    '    paths:                       # extra skill dirs searched at runtime',
    '      - ./specialists/skills',
    '      - ~/.specialists/skills',
    '',
    '  capabilities:',
    '    web_search: false            # allow web search tool',
    '    file_write: true             # allow file writes',
    '',
    '  beads_integration:',
    '    auto_create: true            # create a beads issue per run',
    '    issue_type: task             # task | bug | feature',
    '    priority: 2                  # 0=critical … 4=backlog',
  ];
  for (const l of schemaLines) {
    lines.push(`  ${dim(l)}`);
  }
  lines.push('');

  // ── 8. Hook system ─────────────────────────────────────────────────────────
  lines.push(section('8. Hook System'));
  lines.push('');
  lines.push(`  Specialists emits lifecycle events to ${dim('.specialists/trace.jsonl')}:`);
  lines.push('');
  lines.push(`  ${bold('Hook point')}              ${bold('When fired')}`);
  lines.push(`  ${yellow('specialist:start')}       before the agent session begins`);
  lines.push(`  ${yellow('specialist:token')}       on each streamed token (delta)`);
  lines.push(`  ${yellow('specialist:done')}        after successful completion`);
  lines.push(`  ${yellow('specialist:error')}       on failure or timeout`);
  lines.push('');
  lines.push(`  Each event line in trace.jsonl:`);
  lines.push(`  ${dim('{"t":"<ISO>","hook":"specialist:done","specialist":"code-review","durationMs":4120}')}`);
  lines.push('');
  lines.push(`  Tail the trace file to observe all activity:`);
  lines.push(`  ${cmd('tail -f .specialists/trace.jsonl | jq .')}`);
  lines.push('');

  // ── 9. MCP integration ────────────────────────────────────────────────────
  lines.push(section('9. MCP Integration (Claude Code)'));
  lines.push('');
  lines.push(`  After ${cmd('specialists install')}, these MCP tools are available to Claude:`);
  lines.push('');
  lines.push(`  ${bold('specialist_init')}    — bootstrap: bd init + list specialists`);
  lines.push(`  ${bold('list_specialists')}   — discover specialists (project/user/system)`);
  lines.push(`  ${bold('use_specialist')}     — full lifecycle: load → agents.md → run → output`);
  lines.push(`  ${bold('run_parallel')}       — concurrent or pipeline execution`);
  lines.push(`  ${bold('start_specialist')}   — async job start, returns job ID`);
  lines.push(`  ${bold('poll_specialist')}    — poll job status/output by ID`);
  lines.push(`  ${bold('stop_specialist')}    — cancel a running job by ID`);
  lines.push(`  ${bold('specialist_status')}  — circuit breaker health + staleness`);
  lines.push('');

  // ── 10. Common workflows ───────────────────────────────────────────────────
  lines.push(section('10. Common Workflows'));
  lines.push('');
  lines.push(`  ${bold('Foreground review, save to file:')}`);
  lines.push(`  ${cmd('specialists run code-review --prompt "Audit src/" > review.md')}`);
  lines.push('');
  lines.push(`  ${bold('Fire-and-forget, check later:')}`);
  lines.push(`  ${cmd('specialists run deep-analysis --prompt "..." --background')}`);
  lines.push(`  ${cmd('specialists feed <job-id> --follow')}`);
  lines.push(`  ${cmd('specialists result <job-id> > analysis.md')}`);
  lines.push('');
  lines.push(`  ${bold('Override model for a single run:')}`);
  lines.push(`  ${cmd('specialists run code-review --model anthropic/claude-opus-4-6 --prompt "..."')}`);
  lines.push('');

  lines.push(dim('─'.repeat(62)));
  lines.push(`  ${dim('specialists help')}     command list         ${dim('specialists <cmd> --help')}   per-command flags`);
  lines.push(`  ${dim('specialists status')}   health check         ${dim('specialists models')}         available models`);
  lines.push('');

  console.log(lines.join('\n'));
}
