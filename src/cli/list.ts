// src/cli/list.ts

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import readline from 'node:readline';
import { SpecialistLoader } from '../specialist/loader.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { isJobDead } from '../specialist/supervisor.js';
import type { SupervisorStatus } from '../specialist/supervisor.js';
import { formatListVersionAlert, getVersionCheckResult, localVersion, markVersionCheckNotified } from './version-check.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;


const CHAIN_POSITION_BY_NAME: Readonly<Record<string, string>> = {
  explorer: 'pre-impl',
  planner: 'pre-impl',
  overthinker: 'pre-impl',
  researcher: 'pre-impl',
  executor: 'impl',
  debugger: 'impl',
  reviewer: 'post-impl',
  'code-sanity': 'post-impl',
  'security-auditor': 'post-impl',
  'test-runner': 'post-impl',
  'sync-docs': 'post-impl',
  'changelog-keeper': 'merge',
  'xt-merge': 'merge',
  'memory-processor': 'standalone',
  'specialists-creator': 'standalone',
  'node-coordinator': 'standalone',
};

const INLINE_RULE_GLOBAL_SET_IDS = new Set([
  'workflow-quick-rules',
  'core-session-boundary',
  'git-workflow-safe',
  'bun-native-tooling',
  'gitnexus-required',
]);

interface SpecialistRuntimeStats {
  medianMs?: number;
  n?: number;
}

function loadRuntimeStatsBySpecialist(full: boolean): Record<string, SpecialistRuntimeStats> {
  if (!full) return {};
  const client = createObservabilitySqliteClient();
  if (!client) return {};

  const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const elapsedBySpecialist = client.listElapsedMsBySpecialist(sinceMs, 200);
  const stats: Record<string, SpecialistRuntimeStats> = {};

  for (const [specialist, elapsedMs] of Object.entries(elapsedBySpecialist)) {
    if (elapsedMs.length < 3) continue;
    const medianMs = computeMedianElapsedMs(elapsedMs);
    if (medianMs === null) continue;
    stats[specialist] = { medianMs, n: elapsedMs.length };
  }

  return stats;
}

export function getChainPositionBadge(name: string): string | null {
  const position = CHAIN_POSITION_BY_NAME[name];
  return position ? `[${position}]` : null;
}

export function computeMedianElapsedMs(elapsedMs: readonly number[]): number | null {
  if (elapsedMs.length === 0) return null;
  const sorted = [...elapsedMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  return ((lower ?? 0) + (upper ?? 0)) / 2;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatRuntimeStats(stats: SpecialistRuntimeStats): string | null {
  if (stats.medianMs === undefined || stats.n === undefined) return null;
  return `[median ${formatDuration(stats.medianMs)}, n=${stats.n}]`;
}

function getRuleSetLine(templateSets: readonly string[]): string | null {
  const ownSets = templateSets.filter((setId) => !INLINE_RULE_GLOBAL_SET_IDS.has(setId));
  return ownSets.length > 0 ? `rules: ${ownSets.join(', ')}` : null;
}

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ParsedArgs {
  category?: string;
  scope?: 'default' | 'user';
  json?: boolean;
  live?: boolean;
  showDead?: boolean;
  compact?: boolean;
  full?: boolean;
}

interface LiveJob {
  isDead: boolean;
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


export class ArgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgParseError';
  }
}

function toLiveJob(status: SupervisorStatus | null): LiveJob | null {
  if (!status) return null;
  if (status.node_id) return null;
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

function readJobStatus(statusPath: string): SupervisorStatus | null {
  try {
    return JSON.parse(readFileSync(statusPath, 'utf-8')) as SupervisorStatus;
  } catch {
    return null;
  }
}

function listLiveJobs(showDead: boolean): LiveJob[] {
  const sqliteClient = createObservabilitySqliteClient();
  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  const fileOutputEnabled = process.env.SPECIALISTS_JOB_FILE_OUTPUT === 'on';

  const sqliteJobs = sqliteClient?.listStatuses()
    .map((status) => toLiveJob(status))
    .filter((job): job is LiveJob => job !== null)
    .filter((job) => showDead || !job.isDead) ?? [];
  if (!fileOutputEnabled) return sqliteJobs.sort((a, b) => b.startedAtMs - a.startedAtMs);
  if (sqliteJobs.length > 0) return sqliteJobs.sort((a, b) => b.startedAtMs - a.startedAtMs);

  if (!existsSync(jobsDir)) return [];
  return readdirSync(jobsDir)
    .map(entry => toLiveJob(readJobStatus(join(jobsDir, entry, 'status.json'))))
    .filter((job): job is LiveJob => job !== null)
    .filter((job) => showDead || !job.isDead)
    .sort((a, b) => b.startedAtMs - a.startedAtMs);
}

function formatLiveChoice(job: LiveJob): string {
  const state = job.isDead ? 'dead' : job.status;
  return `${job.tmuxSession}  ${job.specialist}  ${job.elapsedS}s  ${state}`;
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

async function runLiveMode(showDead: boolean): Promise<void> {
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

    if (token === '--show-dead') {
      result.showDead = true;
      continue;
    }

    if (token === '--compact') {
      result.compact = true;
      continue;
    }

    if (token === '--full' || token === '--no-truncate') {
      result.full = true;
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
    process.stderr.write('Mode: live tmux session picker; active jobs are DB-backed and file scans are legacy/operator-only.\n');
    await runLiveMode(Boolean(args.showDead));
    return;
  }

  const loader = new SpecialistLoader();
  let specialists = await loader.list(args.category);
  const runtimeStatsBySpecialist = loadRuntimeStatsBySpecialist(Boolean(args.full));

  if (args.scope) {
    specialists = specialists.filter(s => s.scope === args.scope);
  }

  specialists = [...specialists].sort((left, right) => left.name.localeCompare(right.name));

  if (args.json) {
    console.log(JSON.stringify(specialists, null, 2));
    return;
  }

  const versionCheckResult = getVersionCheckResult();
  const versionAlert = versionCheckResult ? formatListVersionAlert(versionCheckResult) : null;
  if (versionCheckResult && versionAlert) {
    console.log(versionAlert);
    markVersionCheckNotified(versionCheckResult);
  }

  if (specialists.length === 0) {
    console.log('No specialists found.');
    return;
  }

  console.log(`\n${bold(`Specialists (${specialists.length})`)}  ${dim(`specialists v${localVersion}`)}\n`);
  for (const s of specialists) {
    const scopeTag = s.scope === 'default' ? green('[default]') : s.scope === 'package' ? blue('[package]') : yellow('[user]');
    const permission = permissionBadge(s.permission_required);
    const keepAliveTag = s.interactive ? `  ${yellow('[keep-alive]')}` : '';
    const thinkingTag = s.thinking_level && s.thinking_level !== 'off'
      ? `  ${dim(`thinking:${s.thinking_level}`)}` : '';
    const model = dim(s.model);
    const desc = args.compact && s.description.length > 80 ? s.description.slice(0, 79) + '…' : s.description;
    const chainPosition = args.full ? getChainPositionBadge(s.name) : null;
    const worktreeTag = args.full ? (s.permission_required === 'MEDIUM' || s.permission_required === 'HIGH' ? '[worktree:auto]' : '[worktree:none]') : '';
    const runtimeStats = args.full ? formatRuntimeStats(runtimeStatsBySpecialist[s.name] ?? {}) : null;

    console.log(`  ${cyan(s.name)} ${dim(`[v${s.version}]`)}  ${scopeTag}  ${permission}${keepAliveTag}${thinkingTag}  ${model}${worktreeTag ? `  ${worktreeTag}` : ''}${chainPosition ? `  ${chainPosition}` : ''}${runtimeStats ? `  ${runtimeStats}` : ''}`);
    console.log(`  ${dim(desc)}`);

    if (s.skills.length > 0) {
      console.log(`  ${dim('skills: ' + s.skills.join('  '))}`);
    }

    const rulesLine = args.full ? getRuleSetLine(s.mandatoryRuleTemplateSets) : null;
    if (rulesLine) {
      console.log(`  ${dim(rulesLine)}`);
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
