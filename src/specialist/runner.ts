// src/specialist/runner.ts
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { renderTemplate } from './templateEngine.js';
import { PiAgentSession, SessionKilledError, type PiSessionOptions } from '../pi/session.js';
import type { SpecialistLoader } from './loader.js';
import type { HookEmitter } from './hooks.js';
import type { CircuitBreaker } from '../utils/circuitBreaker.js';

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
}

export interface RunResult {
  output: string;
  backend: string;
  model: string;
  durationMs: number;
  specialistVersion: string;
  promptHash: string;
  beadId?: string;
}

export type SessionFactory = (opts: PiSessionOptions) => Promise<Pick<PiAgentSession, 'start' | 'prompt' | 'waitForDone' | 'getLastOutput' | 'getState' | 'close' | 'kill' | 'meta'>>;

import { type BeadsClient, shouldCreateBead } from './beads.js';

import { execSync } from 'node:child_process';
import { basename } from 'node:path';

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

function runScript(scriptPath: string): ScriptResult {
  try {
    const output = execSync(scriptPath, { encoding: 'utf8', timeout: 30_000 });
    return { name: basename(scriptPath), output, exitCode: 0 };
  } catch (e: any) {
    return { name: basename(scriptPath), output: e.stdout ?? e.message ?? '', exitCode: e.status ?? 1 };
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
  ): Promise<RunResult> {
    const { loader, hooks, circuitBreaker, beadsClient } = this.deps;
    const invocationId = crypto.randomUUID();
    const start = Date.now();

    const spec = await loader.get(options.name);
    const { metadata, execution, prompt, communication } = spec.specialist;

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

    // Pre-phase scripts run locally before the pi session starts.
    // Their stdout is captured and injected into the task via $pre_script_output.
    const preScripts = spec.specialist.skills?.scripts?.filter(s => s.phase === 'pre') ?? [];
    const preResults = preScripts
      .map(s => runScript(s.path))
      .filter((_, i) => preScripts[i].inject_output);
    const preScriptOutput = formatScriptOutput(preResults);

    // Render task template (pre_script_output is '' when no scripts ran)
    const beadVariables = options.inputBeadId
      ? { bead_context: options.prompt, bead_id: options.inputBeadId }
      : {};
    const variables = {
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

    // Build system prompt: system + skill_inherit + skills.paths + diagnostic_scripts
    const { readFile } = await import('node:fs/promises');
    let agentsMd = prompt.system ?? '';
    if (prompt.skill_inherit) {
      const skillContent = await readFile(prompt.skill_inherit, 'utf-8').catch(() => '');
      if (skillContent) agentsMd += `\n\n---\n# Service Knowledge\n\n${skillContent}`;
    }
    // Inject resolved skills.paths files (Phase 4)
    const skillPaths = spec.specialist.skills?.paths ?? [];
    for (const skillPath of skillPaths) {
      const skillContent = await readFile(skillPath, 'utf-8').catch(() => '');
      if (skillContent) agentsMd += `\n\n---\n# Skill: ${skillPath}\n\n${skillContent}`;
    }
    if (spec.specialist.capabilities?.diagnostic_scripts?.length) {
      agentsMd += '\n\n---\n# Diagnostic Scripts\nYou have access via Bash:\n';
      for (const s of spec.specialist.capabilities.diagnostic_scripts) {
        agentsMd += `- \`${s}\`\n`;
      }
    }

    const permissionLevel = options.autonomyLevel ?? execution.permission_required;

    await hooks.emit('pre_execute', invocationId, metadata.name, metadata.version, {
      backend: model,
      model,
      timeout_ms: execution.timeout_ms,
      permission_level: permissionLevel,
    });

    // Beads: use provided input bead OR create a new tracking bead.
    // When inputBeadId is present the orchestrator owns the lifecycle — do NOT create a second bead.
    const beadsIntegration = spec.specialist.beads_integration ?? 'auto';
    let beadId: string | undefined;
    let ownsBead = false; // true only when runner created the bead (not inherited from orchestrator)
    if (options.inputBeadId) {
      beadId = options.inputBeadId;
    } else if (beadsClient && shouldCreateBead(beadsIntegration, execution.permission_required)) {
      beadId = beadsClient.createBead(metadata.name) ?? undefined;
      if (beadId) { ownsBead = true; onBeadCreated?.(beadId); }
    }

    let output: string;
    let sessionBackend: string = model; // captured before kill() can destroy meta
    let session: Awaited<ReturnType<SessionFactory>> | undefined;
    let keepAliveActive = false; // set true when keepAlive hands session ownership to caller
    try {
      session = await this.sessionFactory({
        model,
        systemPrompt: agentsMd || undefined,
        permissionLevel,
        cwd: process.cwd(),
        onToken:     (delta) => onProgress?.(delta),
        onThinking:  (delta) => onProgress?.(`💭 ${delta}`),
        onToolStart: (tool)  => onProgress?.(`\n⚙ ${tool}…`),
        onToolEnd:   (_tool) => onProgress?.(`✓\n`),
        onEvent:     (type)  => onEvent?.(type),
        onMeta:      (meta)  => onMeta?.(meta),
      });
      await session.start();

      // Register kill function with the caller (e.g. JobRegistry for stop_specialist)
      onKillRegistered?.(session.kill.bind(session));
      // Register steer function so callers can send mid-run messages to the Pi agent
      onSteerRegistered?.((msg) => session.steer(msg));

      await session.prompt(renderedTask);
      await session.waitForDone(execution.timeout_ms);
      sessionBackend = session.meta.backend;
      output = await session.getLastOutput();
      sessionBackend = session.meta.backend; // capture before finally calls kill()

      if (options.keepAlive && onResumeReady) {
        // Hand the session to the caller for multi-turn use.
        // Don't close here — caller owns the lifecycle via closeFn.
        keepAliveActive = true;
        const resumeFn = async (msg: string): Promise<string> => {
          await session.resume(msg, execution.timeout_ms);
          return session.getLastOutput();
        };
        const closeFn = async (): Promise<void> => {
          keepAliveActive = false;
          await session.close();
        };
        onResumeReady(resumeFn, closeFn);
      } else {
        // Clean shutdown: send EOF to stdin, await process exit
        await session.close();
      }

      // Post-phase scripts run locally after the pi session completes (cleanup, notifications, etc.)
      const postScripts = spec.specialist.skills?.scripts?.filter(s => s.phase === 'post') ?? [];
      for (const script of postScripts) runScript(script.path);

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
      if (!keepAliveActive) {
        session?.kill(); // idempotent safety net; no-op if close() already succeeded
      }
    }

    const durationMs = Date.now() - start;

    if (communication?.output_to) {
      await writeFile(communication.output_to, output, 'utf-8').catch(() => {});
    }

    await hooks.emit('post_execute', invocationId, metadata.name, metadata.version, {
      status: 'COMPLETE',
      duration_ms: durationMs,
      output_valid: true,
    });

    // Beads: close with COMPLETE and emit audit record.
    // Only close if runner owns the bead — input beads are closed by the orchestrator.
    if (beadId) {
      if (ownsBead) beadsClient?.closeBead(beadId, 'COMPLETE', durationMs, model);
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
    };
  }

  /** Fire-and-forget: registers job in registry, returns job_id immediately. */
  /** Fire-and-forget: registers job in registry, returns job_id immediately. */
  /** Fire-and-forget: registers job in registry, returns job_id immediately. */
  /** Fire-and-forget: registers job in registry, returns job_id immediately. */
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
