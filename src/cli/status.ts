// src/cli/status.ts

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SpecialistLoader, checkStaleness } from '../specialist/loader.js';
import { Supervisor } from '../specialist/supervisor.js';
import type { SupervisorStatus } from '../specialist/supervisor.js';
import {
  bold,
  dim,
  green,
  yellow,
  red,
  cyan,
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

function statusColor(status: string): string {
  switch (status) {
    case 'running':  return cyan(status);
    case 'done':     return green(status);
    case 'error':    return red(status);
    case 'starting': return yellow(status);
    default:         return status;
  }
}

interface ParsedStatusArgs {
  jsonMode: boolean;
  jobId?: string;
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

function countJobEvents(jobsDir: string, jobId: string): number {
  const eventsFile = join(jobsDir, jobId, 'events.jsonl');
  if (!existsSync(eventsFile)) return 0;
  const raw = readFileSync(eventsFile, 'utf-8').trim();
  if (!raw) return 0;
  return raw.split('\n').filter(line => line.trim().length > 0).length;
}

function renderJobDetail(job: SupervisorStatus, eventCount: number): void {
  console.log(`\n${bold('specialists status')}\n`);
  section(`Job ${job.id}`);
  console.log(`  specialist   ${job.specialist}`);
  console.log(`  status       ${statusColor(job.status)}`);
  console.log(`  model        ${job.model ?? 'n/a'}`);
  console.log(`  backend      ${job.backend ?? 'n/a'}`);
  console.log(`  elapsed      ${formatElapsed(job)}`);
  console.log(`  bead_id      ${job.bead_id ?? 'n/a'}`);
  console.log(`  events       ${eventCount}`);
  if (job.metrics?.finish_reason) console.log(`  finish       ${job.metrics.finish_reason}`);
  if (job.metrics?.token_usage?.total_tokens !== undefined) {
    console.log(`  tokens       ${job.metrics.token_usage.total_tokens}`);
  }
  if (job.metrics?.token_usage?.cost_usd !== undefined) {
    console.log(`  cost_usd     ${job.metrics.token_usage.cost_usd}`);
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

  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  let jobs: SupervisorStatus[] = [];
  let supervisor: Supervisor | null = null;
  if (existsSync(jobsDir)) {
    supervisor = new Supervisor({
      runner: null as any,
      runOptions: null as any,
      jobsDir,
    });
    jobs = supervisor.listJobs();
  }

  if (jobId) {
    const selectedJob = supervisor?.readStatus(jobId) ?? null;
    if (!selectedJob) {
      if (jsonMode) {
        console.log(JSON.stringify({ error: `Job not found: ${jobId}` }, null, 2));
      } else {
        fail(`job not found: ${jobId}`);
      }
      process.exit(1);
    }

    const eventCount = countJobEvents(jobsDir, jobId);

    if (jsonMode) {
      console.log(JSON.stringify({
        job: {
          ...selectedJob,
          event_count: eventCount,
        },
      }, null, 2));
      return;
    }

    renderJobDetail(selectedJob, eventCount);
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
      const detail = job.status === 'error'
        ? red(job.error?.slice(0, 40) ?? 'error')
        : job.current_tool
          ? dim(`tool: ${job.current_tool}`)
          : dim(job.current_event ?? '');
      console.log(
        `  ${dim(job.id)}  ${job.specialist.padEnd(20)}  ${statusColor(job.status).padEnd(7)}  ${elapsed.padStart(6)}  ${detail}`
      );
    }
  }

  console.log();
}
