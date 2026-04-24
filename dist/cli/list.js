// src/cli/list.ts
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import readline from 'node:readline';
import { SpecialistLoader } from '../specialist/loader.js';
import { isJobDead } from '../specialist/supervisor.js';
// ── ANSI helpers ───────────────────────────────────────────────────────────────
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const blue = (s) => `\x1b[34m${s}\x1b[0m`;
const magenta = (s) => `\x1b[35m${s}\x1b[0m`;
function permissionBadge(permission) {
    if (permission === 'READ_ONLY')
        return green('[READ_ONLY]');
    if (permission === 'LOW')
        return cyan('[LOW]');
    if (permission === 'MEDIUM')
        return yellow('[MEDIUM]');
    return magenta('[HIGH]');
}
export class ArgParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ArgParseError';
    }
}
function toLiveJob(status) {
    if (!status)
        return null;
    if (status.node_id)
        return null;
    if ((status.status !== 'running' && status.status !== 'waiting') || !status.tmux_session) {
        return null;
    }
    const elapsedS = status.elapsed_s ?? Math.max(0, Math.floor((Date.now() - status.started_at_ms) / 1000));
    return {
        id: status.id,
        specialist: status.specialist,
        status: status.status,
        tmuxSession: status.tmux_session,
        elapsedS,
        startedAtMs: status.started_at_ms,
        isDead: isJobDead(status),
    };
}
function readJobStatus(statusPath) {
    try {
        return JSON.parse(readFileSync(statusPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function listLiveJobs(showDead) {
    const jobsDir = join(process.cwd(), '.specialists', 'jobs');
    if (!existsSync(jobsDir))
        return [];
    const jobs = readdirSync(jobsDir)
        .map(entry => toLiveJob(readJobStatus(join(jobsDir, entry, 'status.json'))))
        .filter((job) => job !== null)
        .filter((job) => showDead || !job.isDead)
        .sort((a, b) => b.startedAtMs - a.startedAtMs);
    return jobs;
}
function formatLiveChoice(job) {
    const state = job.isDead ? 'dead' : job.status;
    return `${job.tmuxSession}  ${job.specialist}  ${job.elapsedS}s  ${state}`;
}
function renderLiveSelector(jobs, selectedIndex) {
    return [
        '',
        bold('Select tmux session (↑/↓, Enter to attach, Ctrl+C to cancel)'),
        '',
        ...jobs.map((job, index) => `${index === selectedIndex ? cyan('❯') : ' '} ${formatLiveChoice(job)}`),
        '',
    ];
}
function selectLiveJob(jobs) {
    return new Promise(resolve => {
        const input = process.stdin;
        const output = process.stdout;
        const wasRawMode = input.isTTY ? input.isRaw : false;
        let selectedIndex = 0;
        let renderedLineCount = 0;
        const cleanup = (selected) => {
            input.off('keypress', onKeypress);
            if (input.isTTY && !wasRawMode) {
                input.setRawMode(false);
            }
            output.write('\x1B[?25h');
            if (renderedLineCount > 0) {
                readline.moveCursor(output, 0, -renderedLineCount);
                readline.clearScreenDown(output);
            }
            resolve(selected);
        };
        const render = () => {
            if (renderedLineCount > 0) {
                readline.moveCursor(output, 0, -renderedLineCount);
                readline.clearScreenDown(output);
            }
            const lines = renderLiveSelector(jobs, selectedIndex);
            output.write(lines.join('\n'));
            renderedLineCount = lines.length;
        };
        const onKeypress = (_, key) => {
            if (key.ctrl && key.name === 'c') {
                cleanup(null);
                return;
            }
            if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + jobs.length) % jobs.length;
                render();
                return;
            }
            if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % jobs.length;
                render();
                return;
            }
            if (key.name === 'return') {
                cleanup(jobs[selectedIndex]);
            }
        };
        readline.emitKeypressEvents(input);
        if (input.isTTY && !wasRawMode) {
            input.setRawMode(true);
        }
        output.write('\x1B[?25l');
        input.on('keypress', onKeypress);
        render();
    });
}
async function runLiveMode(showDead) {
    const jobs = listLiveJobs(showDead);
    if (jobs.length === 0) {
        console.log('No running tmux sessions found.');
        return;
    }
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
        for (const job of jobs) {
            console.log(`${job.id}  ${job.tmuxSession}  ${job.isDead ? 'dead' : job.status}`);
        }
        return;
    }
    const selected = await selectLiveJob(jobs);
    if (!selected)
        return;
    const attach = spawnSync('tmux', ['attach-session', '-t', selected.tmuxSession], {
        stdio: 'inherit',
    });
    if (attach.error) {
        console.error(`Failed to attach tmux session ${selected.tmuxSession}: ${attach.error.message}`);
        process.exit(1);
    }
}
// ── Argument parser ────────────────────────────────────────────────────────────
export function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--category') {
            const value = argv[++i];
            if (!value || value.startsWith('--')) {
                throw new ArgParseError('--category requires a value');
            }
            result.category = value;
            continue;
        }
        if (token === '--scope') {
            const value = argv[++i];
            if (value !== 'default' && value !== 'user') {
                throw new ArgParseError(`--scope must be "default" or "user", got: "${value ?? ''}"`);
            }
            result.scope = value;
            continue;
        }
        if (token === '--json') {
            result.json = true;
            continue;
        }
        if (token === '--live') {
            result.live = true;
            continue;
        }
        if (token === '--show-dead') {
            result.showDead = true;
            continue;
        }
        // Unknown flags: silently ignored
    }
    return result;
}
// ── Handler ────────────────────────────────────────────────────────────────────
export async function run() {
    let args;
    try {
        args = parseArgs(process.argv.slice(3));
    }
    catch (err) {
        if (err instanceof ArgParseError) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
        throw err;
    }
    if (args.live) {
        await runLiveMode(Boolean(args.showDead));
        return;
    }
    const loader = new SpecialistLoader();
    let specialists = await loader.list(args.category);
    if (args.scope) {
        specialists = specialists.filter(s => s.scope === args.scope);
    }
    if (args.json) {
        console.log(JSON.stringify(specialists, null, 2));
        return;
    }
    if (specialists.length === 0) {
        console.log('No specialists found.');
        return;
    }
    console.log(`\n${bold(`Specialists (${specialists.length})`)}\n`);
    for (const s of specialists) {
        const scopeTag = s.scope === 'default' ? green('[default]') : s.scope === 'package' ? blue('[package]') : yellow('[user]');
        const permission = permissionBadge(s.permission_required);
        const keepAliveTag = s.interactive ? `  ${yellow('[keep-alive]')}` : '';
        const thinkingTag = s.thinking_level && s.thinking_level !== 'off'
            ? `  ${dim(`thinking:${s.thinking_level}`)}` : '';
        const model = dim(s.model);
        const desc = s.description.length > 80 ? s.description.slice(0, 79) + '…' : s.description;
        console.log(`  ${cyan(s.name)}  ${scopeTag}  ${permission}${keepAliveTag}${thinkingTag}  ${model}`);
        console.log(`  ${dim(desc)}`);
        if (s.skills.length > 0) {
            console.log(`  ${dim('skills: ' + s.skills.join('  '))}`);
        }
        if (s.scripts.length > 0) {
            const scriptSummary = s.scripts.map(sc => {
                const inject = sc.inject_output ? ' →$out' : '';
                return `${sc.phase}: ${sc.run}${inject}`;
            }).join('  ∙  ');
            console.log(`  ${dim('scripts: ' + scriptSummary)}`);
        }
        console.log();
    }
}
//# sourceMappingURL=list.js.map