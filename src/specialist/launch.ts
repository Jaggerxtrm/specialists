import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Supervisor } from './supervisor.js';
import type { SpecialistLoader } from './loader.js';
import type { HookEmitter } from './hooks.js';
import type { CircuitBreaker } from '../utils/circuitBreaker.js';
import type { BeadsClient as BeadsClientType } from './beads.js';
import type { RunArgs } from '../cli/run.js';
import type { Specialist } from './schema.js';
import { SpecialistRunner } from './runner.js';
import { createObservabilitySqliteClient } from './observability-sqlite.js';
import type { RuntimeOriginV1 } from './runtime-origin.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

export interface LaunchSpecialistOptions {
  args: RunArgs;
  specialist: Specialist;
  loader: SpecialistLoader;
  hooks: HookEmitter;
  circuitBreaker: CircuitBreaker;
  beadsClient?: BeadsClientType;
  workingDirectory?: string;
  basePin?: {
    baseShaPinned: string;
    baseShaObserved: string;
    currentSha: string;
    branch: string;
    commitsBehind: number;
    override: boolean;
  };
  reusedFromJobId?: string;
  worktreeOwnerJobId?: string;
  effectiveBeadId?: string;
  prompt: string;
  variables?: Record<string, string>;
  epicId?: string;
  beadsWriteNotes: boolean;
  perm: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
  jobsDir: string;
  startEventTailer: (jobId: string, jobsDir: string) => (() => void) | undefined;
  formatFooterModel: (backend?: string, model?: string) => string;
  onProgress?: (delta: string) => void;
  onMeta?: (meta: { backend: string; model: string; sessionId?: string }) => void;
  onJobStarted?: (job: { id: string }) => void;
  /**
   * xtmux runtime origin captured at the sp run boundary (spec §13.1-13.4).
   * Threaded verbatim into RunOptions so the Supervisor's precedence rule
   * can build the initial SupervisorStatus.spawn_origin.
   */
  ambientRuntimeOrigin?: RuntimeOriginV1;
  /**
   * Explicit parent job id, populated by internal launch paths (F1).
   * When set, supersedes the ambient origin per spec §13.4.
   */
  explicitParentJobId?: string;
}

export async function launchSpecialist(opts: LaunchSpecialistOptions): Promise<void> {
  let stopTailer: (() => void) | undefined;
  const runner = new SpecialistRunner({
    loader: opts.loader,
    hooks: opts.hooks,
    circuitBreaker: opts.circuitBreaker,
    beadsClient: opts.beadsClient,
  });

  const supervisor = new Supervisor({
    runner,
    runOptions: {
      name: opts.args.name,
      prompt: opts.prompt,
      variables: opts.variables,
      backendOverride: opts.args.model,
      inputBeadId: opts.effectiveBeadId,
      epicId: opts.epicId,
      keepAlive: opts.args.keepAlive,
      noKeepAlive: opts.args.noKeepAlive,
      beadsWriteNotes: opts.beadsWriteNotes,
      notesMode: opts.specialist.specialist.notes_mode,
      forceJob: opts.args.forceJob,
      permissionRequired: opts.perm,
      workingDirectory: opts.workingDirectory,
      baseShaPinned: opts.basePin?.baseShaPinned,
      baseShaPinnedAtMs: opts.basePin ? Date.now() : undefined,
      reusedFromJobId: opts.reusedFromJobId,
      worktreeOwnerJobId: opts.worktreeOwnerJobId,
      output_file: opts.specialist.specialist.output_file,
      ambientRuntimeOrigin: opts.ambientRuntimeOrigin,
      explicitParentJobId: opts.explicitParentJobId,
    },
    beadsClient: opts.beadsClient,
    stallDetection: opts.specialist.specialist.stall_detection,
    onProgress: opts.onProgress ?? (opts.args.outputMode === 'raw' ? (delta) => process.stdout.write(delta) : undefined),
    onMeta: opts.onMeta ?? (opts.args.outputMode !== 'human'
      ? (meta) => process.stderr.write(dim(`\n[${meta.backend} / ${meta.model}]\n\n`))
      : undefined),
    onJobStarted: ({ id }) => {
      opts.onJobStarted?.({ id });
      if (opts.basePin) {
        const sqliteClient = createObservabilitySqliteClient(opts.workingDirectory);
        try {
          sqliteClient?.updatePrDriftState(id, {
            pr_base_ref: opts.basePin.branch,
            pr_base_sha: opts.basePin.baseShaObserved,
            base_sha_pinned: opts.basePin.baseShaPinned,
            base_sha_pinned_at_ms: Date.now(),
          });
        } finally {
          sqliteClient?.close();
        }
      }
      process.stderr.write(dim(`[job started: ${id}]\n`));
      const handoffPath = process.env.SPECIALISTS_BG_JOB_ID_PATH;
      if (handoffPath) {
        try { writeFileSync(handoffPath, `${id}\n`, 'utf-8'); } catch { /* best effort */ }
      }
      if (opts.args.outputMode !== 'raw') {
        stopTailer = opts.startEventTailer(id, opts.jobsDir);
      }
    },
  });

  if (opts.effectiveBeadId && opts.workingDirectory) {
    try {
      execSync(`bd kv set "bead-claim:${opts.effectiveBeadId}" "active"`, {
        cwd: opts.workingDirectory,
        stdio: 'pipe',
        timeout: 5000,
      });
    } catch {
      // Non-fatal — edit gate falls back to in_progress check.
    }
  }

  process.stderr.write(`\n${bold(`Running ${cyan(opts.args.name)}`)}\n\n`);

  let jobId = '';
  let runError: unknown;
  try {
    jobId = await supervisor.run();
  } catch (error: any) {
    runError = error;
    stopTailer?.();
  }

  // Drain remaining events before printing footer
  stopTailer?.();

  if (opts.effectiveBeadId && opts.workingDirectory) {
    try {
      execSync(`bd kv clear "bead-claim:${opts.effectiveBeadId}"`, {
        cwd: opts.workingDirectory,
        stdio: 'pipe',
        timeout: 5000,
      });
    } catch {
      // Non-fatal — stale claim will be overwritten on next run.
    }
  }

  if (runError) {
    const message = runError instanceof Error ? runError.message : String(runError);
    process.stderr.write(`Error: ${message}\n`);
    throw new Error(message);
  }

  const status = supervisor.readStatus(jobId);
  const secs = ((status?.last_event_at_ms ?? Date.now()) - (status?.started_at_ms ?? Date.now())) / 1000;
  const modelLabel = opts.formatFooterModel(status?.backend, status?.model);
  const footer = [
    `job ${jobId}`,
    status?.bead_id ? `bead ${status.bead_id}` : '',
    `${secs.toFixed(1)}s`,
    modelLabel ? dim(modelLabel) : '',
  ].filter(Boolean).join('  ');

  process.stderr.write(`\n${green('✓')} ${footer}\n\n`);
  process.stderr.write(dim(`Status: specialists ps ${jobId} --json`) + '\n');
  process.stderr.write(dim(`Events: specialists feed ${jobId}`) + '\n\n');
}
