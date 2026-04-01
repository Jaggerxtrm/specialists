// src/cli/list.ts

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import readline from 'node:readline';
import { SpecialistLoader } from '../specialist/loader.js';
import type { SupervisorStatus } from '../specialist/supervisor.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ParsedArgs {
  category?: string;
  scope?: 'default' | 'user';
  json?: boolean;
  live?: boolean;
}

interface LiveJob {
  id: string;
  specialist: string;
  status: 'running' | 'waiting';
  tmuxSession: string;
  elapsedS: number;
  startedAtMs: number;
}

function permissionBadge(permission: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH'): string {
  if (permission === 'READ_ONLY') return green('[READ_ONLY]');
  if (permission === 'LOW') return cyan('[LOW]');
  if (permission === 'MEDIUM') return yellow('[MEDIUM]');
  return magenta('[HIGH]');
}

function formatScript(script: { run: string; phase: 'pre' | 'post'; inject_output: boolean }): string {
  const injectField = script.inject_output ? '   inject_output: true' : '';
  return `- run: ${script.run}   phase: ${script.phase}${injectField}`;
}

export class ArgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgParseError';
  }
}

function toLiveJob(status: SupervisorStatus | null): LiveJob | null {
  if (!status) return null;
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
  };
}

function readJobStatus(statusPath: string): SupervisorStatus | null {
  try {
    return JSON.parse(readFileSync(statusPath, 'utf-8')) as SupervisorStatus;
  } catch {
    return null;
  }
}

function listLiveJobs(): LiveJob[] {
  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  if (!existsSync(jobsDir)) return [];

  const jobs = readdirSync(jobsDir)
    .map(entry => toLiveJob(readJobStatus(join(jobsDir, entry, 'status.json'))))
    .filter((job): job is LiveJob => job !== null)
    .sort((a, b) => b.startedAtMs - a.startedAtMs);

  return jobs;
}

function formatLiveChoice(job: LiveJob): string {
  return `${job.tmuxSession}  ${job.specialist}  ${job.elapsedS}s  ${job.status}`;
}

function renderLiveSelector(jobs: readonly LiveJob[], selectedIndex: number): string[] {
  return [
    '',
    bold('Select tmux session (↑/↓, Enter to attach, Ctrl+C to cancel)'),
    '',
    ...jobs.map((job, index) => `${index === selectedIndex ? cyan('❯') : ' '} ${formatLiveChoice(job)}`),
    '',
  ];
}

function selectLiveJob(jobs: readonly LiveJob[]): Promise<LiveJob | null> {
  return new Promise(resolve => {
    const input = process.stdin;
    const output = process.stdout;
    const wasRawMode = input.isTTY ? input.isRaw : false;
    let selectedIndex = 0;
    let renderedLineCount = 0;

    const cleanup = (selected: LiveJob | null): void => {
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

    const render = (): void => {
      if (renderedLineCount > 0) {
        readline.moveCursor(output, 0, -renderedLineCount);
        readline.clearScreenDown(output);
      }
      const lines = renderLiveSelector(jobs, selectedIndex);
      output.write(lines.join('\n'));
      renderedLineCount = lines.length;
    };

    const onKeypress = (_: string, key: readline.Key): void => {
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

async function runLiveMode(): Promise<void> {
  const jobs = listLiveJobs();

  if (jobs.length === 0) {
    console.log('No running tmux sessions found.');
    return;
  }

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    for (const job of jobs) {
      console.log(`${job.id}  ${job.tmuxSession}  ${job.status}`);
    }
    return;
  }

  const selected = await selectLiveJob(jobs);
  if (!selected) return;

  const attach = spawnSync('tmux', ['attach-session', '-t', selected.tmuxSession], {
    stdio: 'inherit',
  });

  if (attach.error) {
    console.error(`Failed to attach tmux session ${selected.tmuxSession}: ${attach.error.message}`);
    process.exit(1);
  }
}

// ── Argument parser ────────────────────────────────────────────────────────────
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};

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
        throw new ArgParseError(
          `--scope must be "default" or "user", got: "${value ?? ''}"`
        );
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

    // Unknown flags: silently ignored
  }

  return result;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  let args: ParsedArgs;

  try {
    args = parseArgs(process.argv.slice(3));
  } catch (err) {
    if (err instanceof ArgParseError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  if (args.live) {
    await runLiveMode();
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

  const nameWidth = Math.max(...specialists.map(s => s.name.length), 4);

  console.log(`\n${bold(`Specialists (${specialists.length})`)}\n`);
  for (const s of specialists) {
    const name = cyan(s.name.padEnd(nameWidth));
    const scopeTag = s.scope === 'default' ? green('[default]') : yellow('[user]');
    const model = dim(s.model);
    const permission = permissionBadge(s.permission_required);
    const interactive = s.interactive ? yellow('[interactive]') : dim('[non-interactive]');
    const thinkingLevel = s.thinking_level ? `  ${dim(`thinking: ${s.thinking_level}`)}` : '';
    const desc = s.description.length > 80
      ? s.description.slice(0, 79) + '…'
      : s.description;

    console.log(`  ${name}  ${scopeTag}  ${permission}  ${interactive}  ${model}`);
    console.log(`  ${' '.repeat(nameWidth)}  ${dim(desc)}`);
    console.log(`  ${' '.repeat(nameWidth)}  ${dim(`version: ${s.version}`)}${thinkingLevel}`);

    if (s.skills.length > 0) {
      console.log(`  ${' '.repeat(nameWidth)}  ${bold('skills:')}`);
      for (const skillPath of s.skills) {
        console.log(`  ${' '.repeat(nameWidth)}    - ${skillPath}`);
      }
    }

    if (s.scripts.length > 0) {
      console.log(`  ${' '.repeat(nameWidth)}  ${bold('scripts:')}`);
      for (const script of s.scripts) {
        console.log(`  ${' '.repeat(nameWidth)}    ${formatScript(script)}`);
      }
    }

    console.log();
  }
}
