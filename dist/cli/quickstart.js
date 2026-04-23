// src/cli/quickstart.ts
// Rich getting-started guide — mirrors bd quickstart quality.
// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const blue = (s) => `\x1b[34m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
function section(title) {
    const bar = '─'.repeat(60);
    return `\n${bold(cyan(title))}\n${dim(bar)}`;
}
function cmd(s) { return yellow(s); }
function flag(s) { return green(s); }
export async function run() {
    const lines = [
        '',
        bold('specialists  ·  Quick Start Guide'),
        dim('One MCP server. Multiple AI backends. Intelligent orchestration.'),
        dim('Tip: sp is a shorter alias — sp run, sp list, sp feed etc. work identically.'),
        '',
    ];
    // ── 1. Installation ────────────────────────────────────────────────────────
    lines.push(section('1. Installation'));
    lines.push('');
    lines.push(`  ${cmd('npm install -g @jaggerxtrm/specialists')}    # install globally`);
    lines.push(`  ${cmd('specialists init')}                         # project setup:`);
    lines.push(`  ${dim('                                            #   creates dirs, wires MCP + hooks, injects context')}`);
    lines.push('');
    lines.push(`  Verify everything is healthy:`);
    lines.push(`  ${cmd('specialists status')}                        # shows pi, beads, MCP, active jobs`);
    lines.push('');
    // ── 2. Initialize a project ────────────────────────────────────────────────
    lines.push(section('2. Initialize a Project'));
    lines.push('');
    lines.push(`  Run once per project root:`);
    lines.push(`  ${cmd('specialists init')}                          # creates .specialists/, wires MCP + AGENTS.md`);
    lines.push('');
    lines.push(`  What this creates:`);
    lines.push(`  ${dim('.specialists/default/')} — canonical specialists (from init)`);
    lines.push(`  ${dim('.specialists/user/')}    — custom .specialist.json files`);
    lines.push(`  ${dim('.specialists/jobs|ready')} — runtime data — gitignored`);
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
    lines.push(`  Scopes (searched in order, user wins on name collision):`);
    lines.push(`  ${blue('user')}      .specialists/user/*.specialist.json`);
    lines.push(`  ${blue('default')}   .specialists/default/*.specialist.json`);
    lines.push('');
    // ── 4. Running a specialist ────────────────────────────────────────────────
    lines.push(section('4. Running a Specialist'));
    lines.push('');
    lines.push(`  ${bold('Foreground')} (streams output to stdout):`);
    lines.push(`  ${cmd('specialists run code-review')} ${flag('--prompt')} ${dim('"Review src/api.ts for security issues"')}`);
    lines.push('');
    lines.push(`  ${bold('Tracked run')} (linked to a beads issue for workflow integration):`);
    lines.push(`  ${cmd('specialists run code-review')} ${flag('--bead')} ${dim('unitAI-abc')}`);
    lines.push(`  ${dim('  # uses bead description as prompt, tracks result in issue')}`);
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
    lines.push(section('5. Async Job Lifecycle'));
    lines.push('');
    lines.push(`  ${bold('MCP pattern')}: ${cmd('use_specialist')} (foreground, returns result directly)`);
    lines.push(`  ${bold('CLI pattern')}: ${cmd('specialists run <name> --prompt "..."')} prints ${dim('[job started: <id>]')} to stderr`);
    lines.push(`  ${bold('Shell pattern')}: ${cmd('specialists run <name> --prompt "..." &')} for native backgrounding`);
    lines.push('');
    lines.push(`  ${bold('Watch progress')} — stream events as they arrive:`);
    lines.push(`  ${cmd('specialists feed job_a1b2c3d4')}            # print events so far`);
    lines.push(`  ${cmd('specialists feed job_a1b2c3d4')} ${flag('--follow')}      # tail and stream live updates`);
    lines.push('');
    lines.push(`  ${bold('Read results')} — print the final output:`);
    lines.push(`  ${cmd('specialists result job_a1b2c3d4')}          # exits 1 if still running`);
    lines.push('');
    lines.push(`  ${bold('Steer a running job')} — redirect the agent mid-run without cancelling:`);
    lines.push(`  ${cmd('specialists steer job_a1b2c3d4')} ${flag('"focus only on supervisor.ts"')}`);
    lines.push(`  ${dim('  # delivered after current tool calls finish, before the next LLM call')}`);
    lines.push('');
    lines.push(`  ${bold('Keep-alive multi-turn')} — start with ${flag('--keep-alive')}, then follow up:`);
    lines.push(`  ${cmd('specialists run debugger')} ${flag('--bead unitAI-abc --keep-alive')}`);
    lines.push(`  ${dim('  # → status: waiting after first turn')}`);
    lines.push(`  ${cmd('specialists result a1b2c3')}                   # read first turn`);
    lines.push(`  ${cmd('specialists follow-up a1b2c3')} ${flag('"now write the fix"')}    # next turn, same Pi context`);
    lines.push(`  ${cmd('specialists feed a1b2c3')} ${flag('--follow')}               # watch response`);
    lines.push('');
    lines.push(`  ${bold('Cancel a job')}:`);
    lines.push(`  ${cmd('specialists stop job_a1b2c3d4')}            # sends SIGTERM to the agent process`);
    lines.push('');
    lines.push(`  ${bold('Job files')} in ${dim('.specialists/jobs/<job-id>/')}:`);
    lines.push(`  ${dim('status.json')}   — id, specialist, status, pid, started_at, elapsed_s, current_tool`);
    lines.push(`  ${dim('events.jsonl')} — one JSON event per line (tool_use, text, agent_end, error …)`);
    lines.push(`  ${dim('result.txt')}    — final output (written when status=done)`);
    lines.push(`  ${dim('steer.pipe')}    — named FIFO for mid-run steering (removed on job completion)`);
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
    // ── 7. .specialist.json schema ────────────────────────────────────────────
    lines.push(section('7. .specialist.json Schema'));
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
    lines.push(`  After ${cmd('specialists init')}, these MCP tools are available to Claude:`);
    lines.push('');
    lines.push(`  ${bold('specialist_init')}    — bootstrap: bd init + list specialists`);
    lines.push(`  ${bold('list_specialists')}   — discover specialists (project/user/system)`);
    lines.push(`  ${bold('use_specialist')}     — full lifecycle: load → agents.md → run → output`);
    lines.push(`  ${bold('feed_specialist')}    — stream events/output by job ID`);
    lines.push(`  ${bold('steer_specialist')}      — send a mid-run message to a running job`);
    lines.push(`  ${bold('resume_specialist')}    — resume a waiting keep-alive session with a next-turn prompt`);
    lines.push(`  ${bold('stop_specialist')}      — cancel a running job by ID`);
    lines.push(`  ${bold('specialist_status')}  — circuit breaker health + staleness`);
    lines.push('');
    // ── 10. Common workflows ───────────────────────────────────────────────────
    lines.push(section('10. Common Workflows'));
    lines.push('');
    lines.push(`  ${bold('Foreground review, save to file:')}`);
    lines.push(`  ${cmd('specialists run code-review --prompt "Audit src/" > review.md')}`);
    lines.push('');
    lines.push(`  ${bold('Tracked run with beads integration:')}`);
    lines.push(`  ${cmd('specialists run deep-analysis --bead unitAI-abc')}`);
    lines.push(`  ${dim('  # prompt from bead, result tracked in bead')}`);
    lines.push('');
    lines.push(`  ${bold('Steer a job mid-run:')}`);
    lines.push(`  ${cmd('specialists steer <job-id> "focus only on the auth module"')}`);
    lines.push(`  ${cmd('specialists result <job-id>')}`);
    lines.push('');
    lines.push(`  ${bold('Multi-turn keep-alive (iterative work):')}`);
    lines.push(`  ${cmd('specialists run debugger --bead unitAI-abc --keep-alive')}`);
    lines.push(`  ${cmd('specialists result <job-id>')}`);
    lines.push(`  ${cmd('specialists follow-up <job-id> "now write the fix for the root cause"')}`);
    lines.push(`  ${cmd('specialists feed <job-id> --follow')}`);
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
//# sourceMappingURL=quickstart.js.map