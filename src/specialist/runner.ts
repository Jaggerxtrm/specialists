// src/specialist/runner.ts
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { renderTemplate } from './templateEngine.js';
import { PiAgentSession, SessionKilledError, type PiSessionOptions } from '../pi/session.js';
import type { SpecialistLoader } from './loader.js';
import type { HookEmitter } from './hooks.js';
import { isTransientError, type CircuitBreaker } from '../utils/circuitBreaker.js';

export interface RunOptions {
  name: string;
  prompt: string;
  variables?: Record<string, string>;
  backendOverride?: string;
  autonomyLevel?: string;
  /** Existing bead whose content should be used as the task prompt. */
  inputBeadId?: string;
  /** Path to an existing pi session file for continuation (Phase 2+) */
  sessionPath?: string;
  /**
   * Keep the Pi session alive after agent_end.
   * Enables multi-turn: callers receive resumeFn/closeFn via onResumeReady callback.
   */
  keepAlive?: boolean;
  /** Additional retries after the initial attempt (default: 0). */
  maxRetries?: number;
}

export interface RunResult {
  output: string;
  backend: string;
  model: string;
  durationMs: number;
  specialistVersion: string;
  promptHash: string;
  beadId?: string;
  permissionRequired?: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export type SessionFactory = (opts: PiSessionOptions) => Promise<Pick<PiAgentSession, 'start' | 'prompt' | 'waitForDone' | 'getLastOutput' | 'getState' | 'close' | 'kill' | 'meta' | 'steer' | 'resume'>>;

import { type BeadsClient, shouldCreateBead } from './beads.js';

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { homedir } from 'node:os';

interface RunnerDeps {
  loader: SpecialistLoader;
  hooks: HookEmitter;
  circuitBreaker: CircuitBreaker;
  /** Overridable for testing; defaults to PiAgentSession.create */
  sessionFactory?: SessionFactory;
  /** Optional beads client for specialist run tracking */
  beadsClient?: BeadsClient;
}

// ── Pre/post script helpers ───────────────────────────────────────────────────

interface ScriptResult {
  name: string;
  output: string;
  exitCode: number;
}

function runScript(command: string | undefined): ScriptResult {
  const run = (command ?? '').trim();
  if (!run) {
    return { name: 'unknown', output: 'Missing script command (expected `run` or legacy `path`).', exitCode: 1 };
  }

  const scriptName = basename(run.split(' ')[0]);
  try {
    const output = execSync(run, { encoding: 'utf8', timeout: 30_000 });
    return { name: scriptName, output, exitCode: 0 };
  } catch (e: any) {
    return { name: scriptName, output: e.stdout ?? e.message ?? '', exitCode: e.status ?? 1 };
  }
}

function formatScriptOutput(results: ScriptResult[]): string {
  const withOutput = results.filter(r => r.output.trim());
  if (withOutput.length === 0) return '';
  const blocks = withOutput
    .map(r => {
      const status = r.exitCode === 0 ? '' : ` exit_code="${r.exitCode}"`;
      return `<script name="${r.name}"${status}>\n${r.output.trim()}\n</script>`;
    })
    .join('\n');
  return `<pre_flight_context>\n${blocks}\n</pre_flight_context>`;
}

// ── Pre-run validator ─────────────────────────────────────────────────────────

function resolvePath(p: string): string {
  return p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p);
}

function commandExists(cmd: string): boolean {
  const result = spawnSync('which', [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

function validateShebang(filePath: string, errors: string[]): void {
  try {
    const head = readFileSync(filePath, 'utf-8').slice(0, 120);
    if (!head.startsWith('#!')) return;
    const shebang = head.split('\n')[0].toLowerCase();
    const typos: [RegExp, string][] = [
      [/pytho[^n]|pyton|pyhon/, 'python'],
      [/nod[^e]b/, 'node'],
      [/bsh$|bas$/, 'bash'],
      [/rub[^y]/, 'ruby'],
    ];
    for (const [pattern, correct] of typos) {
      if (pattern.test(shebang)) {
        errors.push(`  ✗ ${filePath}: shebang looks wrong — did you mean '${correct}'? (got: ${shebang})`);
      }
    }
  } catch { /* unreadable — caught by exists check */ }
}

/** Pi tools known to be gated by permission level. Tools not in this map are assumed available at all levels. */
const PERMISSION_GATED_TOOLS: Record<string, string[]> = {
  bash:  ['LOW', 'MEDIUM', 'HIGH'],
  edit:  ['MEDIUM', 'HIGH'],
  write: ['HIGH'],
};

function isToolAvailable(tool: string, permissionLevel: string): boolean {
  const normalized = permissionLevel.toUpperCase();
  const gatedLevels = PERMISSION_GATED_TOOLS[tool.toLowerCase()];
  if (!gatedLevels) return true; // not gated — available at all levels (read, grep, find, ls, glob, notebook, etc.)
  return gatedLevels.includes(normalized);
}

function validateBeforeRun(
  spec: { specialist: { skills?: { paths?: string[]; scripts?: Array<{ run?: string; path?: string; phase: string; inject_output: boolean }> }; capabilities?: { external_commands?: string[]; required_tools?: string[] } } },
  permissionLevel: string,
): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate skills.paths files exist
  for (const p of spec.specialist.skills?.paths ?? []) {
    const abs = resolvePath(p);
    if (!existsSync(abs)) warnings.push(`  ⚠ skills.paths: file not found: ${p}`);
  }

  // Validate scripts/commands
  for (const script of spec.specialist.skills?.scripts ?? []) {
    const run = script.run ?? script.path;
    if (!run) continue;
    const isFilePath = run.startsWith('./') || run.startsWith('../') || run.startsWith('/') || run.startsWith('~/');
    if (isFilePath) {
      const abs = resolvePath(run);
      if (!existsSync(abs)) {
        errors.push(`  ✗ skills.scripts: script not found: ${run}`);
      } else {
        validateShebang(abs, errors);
      }
    } else {
      const binary = run.split(' ')[0];
      if (!commandExists(binary)) {
        errors.push(`  ✗ skills.scripts: command not found on PATH: ${binary}`);
      }
    }
  }

  // Validate external_commands exist on PATH
  for (const cmd of spec.specialist.capabilities?.external_commands ?? []) {
    if (!commandExists(cmd)) {
      errors.push(`  ✗ capabilities.external_commands: not found on PATH: ${cmd}`);
    }
  }

  // Validate required_tools are enabled by the selected permission level
  for (const tool of spec.specialist.capabilities?.required_tools ?? []) {
    if (!isToolAvailable(tool, permissionLevel)) {
      errors.push(
        `  ✗ capabilities.required_tools: tool "${tool}" requires higher permission than "${permissionLevel}"`,
      );
    }
  }

  if (warnings.length > 0) {
    process.stderr.write(`[specialists] pre-run warnings:\n${warnings.join('\n')}\n`);
  }
  if (errors.length > 0) {
    throw new Error(`Specialist pre-run validation failed:\n${errors.join('\n')}`);
  }
}

const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_JITTER = 0.2;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelayMs(attemptNumber: number): number {
  const baseDelay = RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attemptNumber - 1));
  const jitterMultiplier = 1 + ((Math.random() * 2 - 1) * RETRY_MAX_JITTER);
  return Math.max(0, Math.round(baseDelay * jitterMultiplier));
}

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : JSON.stringify(error);

  return /\b(401|403|unauthorized|forbidden|authentication|auth|invalid api key|api key)\b/i.test(message);
}

export class SpecialistRunner {
  private sessionFactory: SessionFactory;

  constructor(private deps: RunnerDeps) {
    this.sessionFactory = deps.sessionFactory ?? PiAgentSession.create.bind(PiAgentSession);
  }

  async run(
    options: RunOptions,
    onProgress?: (msg: string) => void,
    onEvent?: (type: string) => void,
    onMeta?: (meta: { backend: string; model: string }) => void,
    onKillRegistered?: (killFn: () => void) => void,
    onBeadCreated?: (beadId: string) => void,
    onSteerRegistered?: (steerFn: (msg: string) => Promise<void>) => void,
    onResumeReady?: (
      resumeFn: (msg: string) => Promise<string>,
      closeFn: () => Promise<void>,
    ) => void,
    onToolStartCallback?: (tool: string, args?: Record<string, unknown>, toolCallId?: string) => void,
    onToolEndCallback?: (tool: string, isError: boolean, toolCallId?: string) => void,
  ): Promise<RunResult> {
    const { loader, hooks, circuitBreaker, beadsClient } = this.deps;
    const invocationId = crypto.randomUUID();
    const start = Date.now();

    const spec = await loader.get(options.name);
    const { metadata, execution, prompt, output_file } = spec.specialist;

    // Backend resolution: override → primary → fallback
    const primaryModel = options.backendOverride ?? execution.model;
    const model = circuitBreaker.isAvailable(primaryModel)
      ? primaryModel
      : (execution.fallback_model ?? primaryModel);
    const fallbackUsed = model !== primaryModel;

    await hooks.emit('pre_render', invocationId, metadata.name, metadata.version, {
      variables_keys: Object.keys(options.variables ?? {}),
      backend_resolved: model,
      fallback_used: fallbackUsed,
      circuit_breaker_state: circuitBreaker.getState(model),
      scope: 'project',
    });

    const permissionLevel = options.autonomyLevel ?? execution.permission_required;

    // Pre-run validation: check scripts exist, commands/tools are available, shebang typos
    validateBeforeRun(spec, permissionLevel);

    // Pre-phase scripts/commands run locally before the pi session starts.
    // Their stdout is captured and injected into the task via $pre_script_output.
    const preScripts = spec.specialist.skills?.scripts?.filter(s => s.phase === 'pre') ?? [];
    const preResults = preScripts
      .map(s => runScript(s.run ?? (s as any).path))
      .filter((_, i) => preScripts[i].inject_output);
    const preScriptOutput = formatScriptOutput(preResults);

    // Render task template (pre_script_output is '' when no scripts ran)
    const beadVariables: Record<string, string> = options.inputBeadId
      ? { bead_context: options.prompt, bead_id: options.inputBeadId }
      : {};
    const variables: Record<string, string> = {
      prompt: options.prompt,
      cwd: process.cwd(),
      pre_script_output: preScriptOutput,
      ...(options.variables ?? {}),
      ...beadVariables,
    };
    const renderedTask = renderTemplate(prompt.task_template, variables);
    const promptHash = createHash('sha256').update(renderedTask).digest('hex').slice(0, 16);

    await hooks.emit('post_render', invocationId, metadata.name, metadata.version, {
      prompt_hash: promptHash,
      prompt_length_chars: renderedTask.length,
      estimated_tokens: Math.ceil(renderedTask.length / 4),
      system_prompt_present: !!prompt.system,
    });

    // Build system prompt from prompt.system only.
    // skill_inherit and skills.paths are injected via pi --skill (native).
    let agentsMd = prompt.system ?? '';

    // When running with --bead, inject instructions to prevent the specialist from
    // creating unnecessary sub-beads. The project's CLAUDE.md contains edit-gate rules
    // that tell agents to `bd create` before editing — override that for specialist runs.
    if (options.inputBeadId) {
      agentsMd += `\n\n---\n## Specialist Run Context\nYou are running as a specialist with bead ${options.inputBeadId} as your task.\n- Claim this bead directly: \`bd update ${options.inputBeadId} --claim\`\n- Do NOT create new beads or sub-issues — this bead IS your task.\n- Do NOT run \`bd create\` — the orchestrator manages issue tracking.\n- Close the bead when done: \`bd close ${options.inputBeadId} --reason="..."\`\n---\n`;
    }
    const skillPaths: string[] = [];
    if (prompt.skill_inherit) skillPaths.push(prompt.skill_inherit);
    skillPaths.push(...(spec.specialist.skills?.paths ?? []));

    // AUTO INJECTED banner — printed before session starts so the user can see what was loaded
    if (skillPaths.length > 0 || preScripts.length > 0) {
      const line = '━'.repeat(56);
      onProgress?.(`\n${line}\n◆ AUTO INJECTED\n`);
      if (skillPaths.length > 0) {
        onProgress?.(`  skills (--skill):\n${skillPaths.map(p => `    • ${p}`).join('\n')}\n`);
      }
      if (preScripts.length > 0) {
        onProgress?.(`  pre scripts/commands:\n${preScripts.map(s => `    • ${(s.run ?? (s as any).path ?? '<missing>')}${s.inject_output ? ' → $pre_script_output' : ''}`).join('\n')}\n`);
      }
      onProgress?.(`${line}\n\n`);
    }

    // Beads: use provided input bead OR create a new tracking bead.
    // When inputBeadId is present the orchestrator owns the lifecycle — do NOT create a second bead.
    // Owned-bead creation is placed BEFORE pre_execute so onBeadCreated fires early and callers
    // (e.g. Supervisor) can write bead_id into status.json before the session starts.
    const beadsIntegration = spec.specialist.beads_integration ?? 'auto';
    let beadId: string | undefined;
    let ownsBead = false; // true only when runner created the bead (not inherited from orchestrator)
    if (options.inputBeadId) {
      beadId = options.inputBeadId;
    } else if (beadsClient && shouldCreateBead(beadsIntegration, execution.permission_required)) {
      beadId = beadsClient.createBead(metadata.name) ?? undefined;
      if (beadId) { ownsBead = true; onBeadCreated?.(beadId); }
    }

    await hooks.emit('pre_execute', invocationId, metadata.name, metadata.version, {
      backend: model,
      model,
      timeout_ms: execution.timeout_ms,
      permission_level: permissionLevel,
    });

    let output: string | undefined;
    let sessionBackend: string = model; // captured before kill() can destroy meta
    let session: Awaited<ReturnType<SessionFactory>> | undefined;
    let keepAliveActive = false; // set true when keepAlive hands session ownership to caller
    let sessionClosed = false; // track if we closed cleanly (to avoid kill in finally)
    const maxRetries = Math.max(0, Math.trunc(options.maxRetries ?? execution.max_retries ?? 0));
    const maxAttempts = maxRetries + 1;

    try {
      session = await this.sessionFactory({
        model,
        systemPrompt: agentsMd || undefined,
        skillPaths: skillPaths.length > 0 ? skillPaths : undefined,
        thinkingLevel: execution.thinking_level,
        permissionLevel,
        stallTimeoutMs: execution.stall_timeout_ms,
        cwd: process.cwd(),
        onToken:     (delta) => onProgress?.(delta),
        onThinking:  (delta) => onProgress?.(`💭 ${delta}`),
        onToolStart: (tool, args, toolCallId) => { onProgress?.(`\n⚙ ${tool}…`); onToolStartCallback?.(tool, args, toolCallId); },
        onToolEnd:   (tool, isError, toolCallId) => { onProgress?.(`✓\n`); onToolEndCallback?.(tool, isError, toolCallId); },
        onEvent:     (type)  => onEvent?.(type),
        onMeta:      (meta)  => onMeta?.(meta),
      });
      await session.start();

      // Register kill function with the caller (e.g. JobRegistry for stop_specialist)
      onKillRegistered?.(session.kill.bind(session));
      // Register steer function so callers can send mid-run messages to the Pi agent
      onSteerRegistered?.((msg) => session!.steer(msg));

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await session.prompt(renderedTask);
          await session.waitForDone(execution.timeout_ms);
          output = await session.getLastOutput();
          sessionBackend = session.meta.backend; // capture before finally calls kill()
          break;
        } catch (err: any) {
          const shouldRetry = attempt < maxAttempts
            && !(err instanceof SessionKilledError)
            && !isAuthError(err)
            && isTransientError(err);

          if (!shouldRetry) {
            throw err;
          }

          const delayMs = getRetryDelayMs(attempt);
          onEvent?.('auto_retry');
          onProgress?.(`\n↻ transient backend error on attempt ${attempt}/${maxAttempts}; retrying in ${delayMs}ms\n`);
          await sleep(delayMs);
        }
      }

      if (output === undefined) {
        throw new Error('Specialist run finished without output');
      }

      if (options.keepAlive && onResumeReady) {
        // Hand the session to the caller for multi-turn use.
        // Don't close here — caller owns the lifecycle via closeFn.
        keepAliveActive = true;
        const resumeFn = async (msg: string): Promise<string> => {
          await session!.resume(msg, execution.timeout_ms);
          return session!.getLastOutput();
        };
        const closeFn = async (): Promise<void> => {
          keepAliveActive = false;
          await session!.close();
        };
        onResumeReady(resumeFn, closeFn);
      } else {
        // Clean shutdown: send EOF to stdin, await process exit
        await session.close();
        sessionClosed = true;
      }

      // Post-phase scripts/commands run locally after the pi session completes
      const postScripts = spec.specialist.skills?.scripts?.filter(s => s.phase === 'post') ?? [];
      for (const script of postScripts) runScript(script.run ?? (script as any).path);

      circuitBreaker.recordSuccess(model);
    } catch (err: any) {
      const isCancelled = err instanceof SessionKilledError;
      if (!isCancelled) {
        // Only record a circuit-breaker failure for real backend errors
        circuitBreaker.recordFailure(model);
      }
      // Beads: close with CANCELLED for kill, ERROR for real failures; always audit.
      // Only close if runner owns the bead — input beads are closed by the orchestrator.
      const beadStatus = isCancelled ? 'CANCELLED' : 'ERROR';
      if (beadId) {
        if (ownsBead) beadsClient?.closeBead(beadId, beadStatus, Date.now() - start, model);
        beadsClient?.auditBead(beadId, metadata.name, model, 1);
      }
      await hooks.emit('post_execute', invocationId, metadata.name, metadata.version, {
        status: isCancelled ? 'CANCELLED' : 'ERROR',
        duration_ms: Date.now() - start,
        output_valid: false,
        error: { type: isCancelled ? 'cancelled' : 'backend_error', message: err.message },
      });
      throw err;
    } finally {
      // Only kill if we didn't close cleanly AND not in keepAlive mode
      if (!keepAliveActive && !sessionClosed) {
        session?.kill(); // idempotent safety net
      }
    }

    const durationMs = Date.now() - start;

    if (output_file) {
      await writeFile(output_file, output, 'utf-8').catch(() => {});
    }

    await hooks.emit('post_execute', invocationId, metadata.name, metadata.version, {
      status: 'COMPLETE',
      duration_ms: durationMs,
      output_valid: true,
    });

    // Beads: emit audit record. Owned beads are closed by the Supervisor AFTER
    // updateBeadNotes — do NOT call closeBead here on the success path.
    // (Error/cancel paths close owned beads in the catch block above because
    // Supervisor never reaches post-processing on failure.)
    if (beadId) {
      beadsClient?.auditBead(beadId, metadata.name, model, 0);
    }

    return {
      output,
      backend: sessionBackend,
      model,
      durationMs,
      specialistVersion: metadata.version,
      promptHash,
      beadId,
      permissionRequired: execution.permission_required,
    };
  }

  /**
   * @deprecated Legacy in-memory async path.
   * start_specialist now uses Supervisor-backed jobs under .specialists/jobs.
   */
  async startAsync(options: RunOptions, registry: import('./jobRegistry.js').JobRegistry): Promise<string> {
    const jobId = crypto.randomUUID();
    // Pre-load spec to capture version before the async run begins
    let specialistVersion = '?';
    try {
      const spec = await this.deps.loader.get(options.name);
      specialistVersion = spec.specialist.metadata.version;
    } catch { /* will fail properly inside run() */ }
    registry.register(jobId, {
      backend: options.backendOverride ?? 'starting',
      model: '?',
      specialistVersion,
    });
    this.run(
      options,
      (text)      => registry.appendOutput(jobId, text),
      (eventType) => registry.setCurrentEvent(jobId, eventType),
      (meta)      => registry.setMeta(jobId, meta),
      (killFn)    => registry.setKillFn(jobId, killFn),
      (beadId)    => registry.setBeadId(jobId, beadId),
      (steerFn)   => registry.setSteerFn(jobId, steerFn),
      (resumeFn, closeFn) => registry.setResumeFn(jobId, resumeFn, closeFn),
    )
      .then(result => registry.complete(jobId, result))
      .catch(err   => registry.fail(jobId, err));
    return jobId;
  }
}
