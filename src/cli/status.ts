// src/cli/status.ts

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SpecialistLoader, checkStaleness } from '../specialist/loader.js';
import { Supervisor } from '../specialist/supervisor.js';
import type { SupervisorStatus, SupervisorStatusView } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import {
  bold,
  dim,
  green,
  yellow,
  red,
  cyan,
  magenta,
  formatCostUsd,
} from './format-helpers.js';

function ok(msg: string)   { console.log(`  ${green('✓')} ${msg}`); }
function warn(msg: string) { console.log(`  ${yellow('○')} ${msg}`); }
function fail(msg: string) { console.log(`  ${red('✗')} ${msg}`); }
function info(msg: string) { console.log(`  ${dim(msg)}`); }

function section(label: string) {
  const line = '─'.repeat(Math.max(0, 38 - label.length));
  console.log(`\n${bold(`── ${label} ${line}`)}`);
}

function cmd(bin: string, args: string[]): { ok: boolean; stdout: string } {
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 5000,
  });
  return { ok: r.status === 0 && !r.error, stdout: (r.stdout ?? '').trim() };
}

function isInstalled(bin: string): boolean {
  return spawnSync('which', [bin], { encoding: 'utf8', timeout: 2000 }).status === 0;
}

function formatElapsed(s: SupervisorStatus): string {
  if (s.elapsed_s === undefined) return '...';
  const m = Math.floor(s.elapsed_s / 60);
  const sec = s.elapsed_s % 60;
  return m > 0 ? `${m}m${sec.toString().padStart(2, '0')}s` : `${sec}s`;
}

function statusColor(job: Pick<SupervisorStatusView, 'status' | 'is_dead'>): string {
  if (job.is_dead) return red('dead ☠');

  switch (job.status) {
    case 'running':  return cyan(job.status);
    case 'done':     return green(job.status);
    case 'error':    return red(job.status);
    case 'starting': return yellow(job.status);
    case 'waiting':  return magenta(job.status);
    default:         return job.status;
  }
}

interface ParsedStatusArgs {
  jsonMode: boolean;
  jobId?: string;
}

export type JobOutputMode = 'on' | 'off';

export function detectJobOutputMode(): JobOutputMode {
  return process.env.SPECIALISTS_JOB_FILE_OUTPUT === 'on' ? 'on' : 'off';
}

function parseStatusArgs(argv: string[]): ParsedStatusArgs {
  let jsonMode = false;
  let jobId: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      jsonMode = true;
      continue;
    }
    if (arg === '--job') {
      const candidate = argv[i + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error('--job requires a value');
      }
      jobId = candidate;
      i += 1;
      continue;
    }
    if (arg.startsWith('--job=')) {
      const candidate = arg.slice('--job='.length).trim();
      if (!candidate) {
        throw new Error('--job requires a value');
      }
      jobId = candidate;
    }
  }

  return { jsonMode, jobId };
}

function countJobEvents(
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
  jobsDir: string,
  jobId: string,
): number {
  try {
    const sqliteEvents = sqliteClient?.readEvents(jobId) ?? [];
    if (sqliteEvents.length > 0) {
      return sqliteEvents.length;
    }
  } catch (error) {
    console.warn(`SQLite events read failed for job ${jobId}`, error);
  }

  if (detectJobOutputMode() !== 'on') {
    return 0;
  }

  const eventsFile = join(jobsDir, jobId, 'events.jsonl');
  if (!existsSync(eventsFile)) return 0;
  const raw = readFileSync(eventsFile, 'utf-8').trim();
  if (!raw) return 0;
  return raw.split('\n').filter(line => line.trim().length > 0).length;
}

interface ContextSnapshot {
  context_pct: number;
  context_health?: 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL';
}

function toContextSnapshot(event: unknown): ContextSnapshot | null {
  if (!event || typeof event !== 'object') return null;
  const summary = event as Record<string, unknown>;
  if (summary.type !== 'turn_summary') return null;
  if (typeof summary.context_pct !== 'number' || !Number.isFinite(summary.context_pct)) return null;

  const contextHealth = summary.context_health;
  return {
    context_pct: summary.context_pct,
    ...(typeof contextHealth === 'string' ? { context_health: contextHealth as ContextSnapshot['context_health'] } : {}),
  };
}

function getLatestContextSnapshot(
  sqliteClient: ReturnType<typeof createObservabilitySqliteClient>,
  jobsDir: string,
  jobId: string,
): ContextSnapshot | null {
  try {
    const sqliteEvents = sqliteClient?.readEvents(jobId) ?? [];
    for (let index = sqliteEvents.length - 1; index >= 0; index -= 1) {
      const snapshot = toContextSnapshot(sqliteEvents[index]);
      if (snapshot) return snapshot;
    }
  } catch (error) {
    console.warn(`SQLite events read failed for job ${jobId}`, error);
  }

  if (detectJobOutputMode() !== 'on') {
    return null;
  }

  const eventsFile = join(jobsDir, jobId, 'events.jsonl');
  if (!existsSync(eventsFile)) return null;

  const lines = readFileSync(eventsFile, 'utf-8').split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      const snapshot = toContextSnapshot(JSON.parse(line));
      if (snapshot) return snapshot;
    } catch {
      // skip malformed line
    }
  }

  return null;
}

function isStandaloneJob(job: SupervisorStatusView): boolean {
  return !job.node_id;
}

function formatMetricsInline(metrics: SupervisorStatus['metrics']): string {
  if (!metrics) return '';
  const parts: string[] = [];

  if (metrics.turns !== undefined) parts.push(`turns=${metrics.turns}`);

  const toolCount = metrics.tool_call_names?.length ?? metrics.tool_calls;
  if (toolCount !== undefined) parts.push(`tools=${toolCount}`);

  if (metrics.token_usage?.total_tokens !== undefined) {
    parts.push(`tokens=${metrics.token_usage.total_tokens}`);
  }

  const cost = formatCostUsd(metrics.token_usage?.cost_usd);
  if (cost) parts.push(`cost=${cost}`);

  if (metrics.finish_reason) parts.push(`finish=${metrics.finish_reason}`);
  if (metrics.exit_reason) parts.push(`exit=${metrics.exit_reason}`);

  return parts.join(' ');
}

function renderJobDetail(
  job: SupervisorStatusView,
  eventCount: number,
  contextSnapshot: ContextSnapshot | null,
): void {
  console.log(`\n${bold('specialists status')}\n`);
  section(`Job ${job.id}`);
  console.log(`  specialist   ${job.specialist}`);
  console.log(`  status       ${statusColor(job)}`);
  console.log(`  model        ${job.model ?? 'n/a'}`);
  console.log(`  backend      ${job.backend ?? 'n/a'}`);
  console.log(`  elapsed      ${formatElapsed(job)}`);
  console.log(`  bead_id      ${job.bead_id ?? 'n/a'}`);
  console.log(`  chain_id     ${job.chain_id ?? 'n/a'}`);
  console.log(`  epic_id      ${job.epic_id ?? 'n/a'}`);
  console.log(`  events       ${eventCount}`);
  if (job.status === 'waiting') {
    console.log(`  action       ${magenta(`specialists resume ${job.id} "..."`)}`);
  }
  if (job.metrics?.finish_reason) console.log(`  finish       ${job.metrics.finish_reason}`);
  if (job.metrics?.exit_reason) console.log(`  exit_reason  ${job.metrics.exit_reason}`);
  if (job.metrics?.turns !== undefined) console.log(`  turns        ${job.metrics.turns}`);
  const toolCount = job.metrics?.tool_call_names?.length ?? job.metrics?.tool_calls;
  if (toolCount !== undefined) console.log(`  tool_calls   ${toolCount}`);
  if (job.metrics?.token_usage?.total_tokens !== undefined) {
    console.log(`  tokens       ${job.metrics.token_usage.total_tokens}`);
  }
  if (job.metrics?.token_usage?.cost_usd !== undefined) {
    const cost = formatCostUsd(job.metrics.token_usage.cost_usd);
    console.log(`  cost_usd     ${cost ?? job.metrics.token_usage.cost_usd}`);
  }
  if (contextSnapshot) {
    console.log(`  context_pct  ${contextSnapshot.context_pct.toFixed(2)}%`);
    if (contextSnapshot.context_health) {
      console.log(`  context_health ${contextSnapshot.context_health}`);
    }
  }
  if (job.session_file) console.log(`  session_file ${job.session_file}`);
  if (job.error) console.log(`  error        ${red(job.error)}`);
  console.log();
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const argv = process.argv.slice(3);

  let parsedArgs: ParsedStatusArgs;
  try {
    parsedArgs = parseStatusArgs(argv);
  } catch (error) {
    console.error(red((error as Error).message));
    process.exit(1);
  }

  const { jsonMode, jobId } = parsedArgs;
  const sqliteClient = createObservabilitySqliteClient();
  let supervisor: Supervisor | null = null;

  try {
    // ── Collect all data ────────────────────────────────────────────────────────
    const loader = new SpecialistLoader();
  const allSpecialists = await loader.list();

  const piInstalled = isInstalled('pi');
  const piVersion   = piInstalled ? cmd('pi', ['--version']) : null;
  const piModels    = piInstalled ? cmd('pi', ['--list-models']) : null;
  const piProviders = piModels
    ? new Set(
        piModels.stdout.split('\n')
          .slice(1)
          .map(line => line.split(/\s+/)[0])
          .filter(Boolean)
      )
    : new Set<string>();

  const bdInstalled = isInstalled('bd');
  const bdVersion   = bdInstalled ? cmd('bd', ['--version']) : null;
  const beadsPresent = existsSync(join(process.cwd(), '.beads'));

  const specialistsBin = cmd('which', ['specialists']);

  const jobsDir = resolveJobsDir();
  let jobs: SupervisorStatusView[] = [];
  if (existsSync(jobsDir)) {
    supervisor = new Supervisor({
      runner: null as any,
      runOptions: null as any,
      jobsDir,
    });
    jobs = supervisor.listJobs().filter(isStandaloneJob);
  }

  if (jobId) {
    const selectedJob = supervisor?.readStatus(jobId) ?? null;
    if (!selectedJob || !isStandaloneJob(selectedJob)) {
      if (jsonMode) {
        console.log(JSON.stringify({ error: `Job not found: ${jobId}` }, null, 2));
      } else {
        fail(`job not found: ${jobId}`);
      }
      process.exit(1);
    }

    const eventCount = countJobEvents(sqliteClient, jobsDir, jobId);
    const contextSnapshot = getLatestContextSnapshot(sqliteClient, jobsDir, jobId);

    if (jsonMode) {
      console.log(JSON.stringify({
        job: {
          ...selectedJob,
          event_count: eventCount,
          context: contextSnapshot,
        },
      }, null, 2));
      return;
    }

    renderJobDetail(selectedJob, eventCount, contextSnapshot);
    return;
  }

  // Collect staleness for specialists
  const stalenessMap: Record<string, string> = {};
  for (const s of allSpecialists) {
    stalenessMap[s.name] = await checkStaleness(s);
  }

  // ── JSON output ─────────────────────────────────────────────────────────────
  if (jsonMode) {
    const output = {
      runtime: {
        job_file_output: detectJobOutputMode(),
      },
      specialists: {
        count: allSpecialists.length,
        items: allSpecialists.map(s => ({
          name: s.name,
          scope: s.scope,
          model: s.model,
          description: s.description,
          staleness: stalenessMap[s.name],
        })),
      },
      pi: {
        installed: piInstalled,
        version: piVersion?.stdout ?? null,
        providers: [...piProviders],
      },
      beads: {
        installed: bdInstalled,
        version: bdVersion?.stdout ?? null,
        initialized: beadsPresent,
      },
      mcp: {
        specialists_installed: specialistsBin.ok,
        binary_path: specialistsBin.ok ? specialistsBin.stdout : null,
      },
      jobs: jobs.map(j => ({
        id: j.id,
        specialist: j.specialist,
        status: j.status,
        elapsed_s: j.elapsed_s,
        current_tool: j.current_tool ?? null,
        metrics: j.metrics ?? null,
        error: j.error ?? null,
        is_dead: j.is_dead,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // ── Human-readable output ───────────────────────────────────────────────────
  console.log(`\n${bold('specialists status')}\n`);

  // 1. Specialists
  section('Specialists');
  if (allSpecialists.length === 0) {
    warn(`no specialists found — run ${yellow('specialists init')} to scaffold`);
  } else {
    const byScope = allSpecialists.reduce<Record<string, number>>((acc, s) => {
      acc[s.scope] = (acc[s.scope] ?? 0) + 1;
      return acc;
    }, {});
    const scopeSummary = Object.entries(byScope)
      .map(([scope, n]) => `${n} ${scope}`)
      .join(', ');
    ok(`${allSpecialists.length} found  ${dim(`(${scopeSummary})`)}`);

    for (const s of allSpecialists) {
      const staleness = stalenessMap[s.name];
      if (staleness === 'AGED') {
        warn(`${s.name}  ${red('AGED')}  ${dim(s.scope)}`);
      } else if (staleness === 'STALE') {
        warn(`${s.name}  ${yellow('STALE')}  ${dim(s.scope)}`);
      }
    }
  }

  // 2. pi
  section('pi  (coding agent runtime)');
  if (!piInstalled) {
    fail(`pi not installed — install ${yellow('pi')} first`);
  } else {
    const vStr = piVersion?.ok ? `v${piVersion.stdout}` : 'unknown version';
    const pStr = piProviders.size > 0
      ? `${piProviders.size} provider${piProviders.size > 1 ? 's' : ''} active  ${dim(`(${[...piProviders].join(', ')})`)} `
      : yellow('no providers configured — run pi config');
    ok(`${vStr}  —  ${pStr}`);
  }

  // 3. beads
  section('beads  (issue tracker)');
  if (!bdInstalled) {
    fail(`bd not installed — install ${yellow('bd')} first`);
  } else {
    ok(`bd installed${bdVersion?.ok ? `  ${dim(bdVersion.stdout)}` : ''}`);
    if (beadsPresent) {
      ok('.beads/ present in project');
    } else {
      warn(`.beads/ not found — run ${yellow('bd init')} to enable issue tracking`);
    }
  }

  // 4. MCP
  section('MCP');
  if (!specialistsBin.ok) {
    fail(`specialists not installed globally — run ${yellow('npm install -g @jaggerxtrm/specialists')}`);
  } else {
    ok(`specialists binary installed  ${dim(specialistsBin.stdout)}`);
    info(`verify registration: claude mcp get specialists`);
    info(`re-register:         specialists install`);
  }

  // 5. Active Jobs
  section('Active Jobs');
  if (jobs.length === 0) {
    info('  (none)');
  } else {
    for (const job of jobs) {
      const elapsed = formatElapsed(job);
      const metricsInline = formatMetricsInline(job.metrics);
      const detail = job.is_dead
        ? red('[dead]')
        : job.status === 'error'
        ? red(job.error?.slice(0, 40) ?? 'error')
        : job.status === 'waiting'
          ? magenta(`resume: specialists resume ${job.id} "..."`)
          : job.current_tool
            ? dim(`tool: ${job.current_tool}`)
            : metricsInline
              ? dim(metricsInline)
              : dim(job.current_event ?? '');
      console.log(
        `  ${dim(job.id)}  ${job.specialist.padEnd(20)}  ${statusColor(job).padEnd(7)}  ${elapsed.padStart(6)}  ${detail}`
      );
    }
  }

  console.log();
  } finally {
    sqliteClient?.close();
    await supervisor?.dispose();
  }
}
