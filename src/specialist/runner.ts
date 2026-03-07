// src/specialist/runner.ts
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { renderTemplate } from './templateEngine.js';
import { PiAgentSession, type PiSessionOptions } from '../pi/session.js';
import type { SpecialistLoader } from './loader.js';
import type { HookEmitter } from './hooks.js';
import type { CircuitBreaker } from '../utils/circuitBreaker.js';

export interface RunOptions {
  name: string;
  prompt: string;
  variables?: Record<string, string>;
  backendOverride?: string;
  autonomyLevel?: string;
}

export interface RunResult {
  output: string;
  backend: string;
  model: string;
  durationMs: number;
  specialistVersion: string;
}

export type SessionFactory = (opts: PiSessionOptions) => Promise<Pick<PiAgentSession, 'start' | 'prompt' | 'waitForIdle' | 'getLastOutput' | 'executeBash' | 'kill' | 'meta'>>;

interface RunnerDeps {
  loader: SpecialistLoader;
  hooks: HookEmitter;
  circuitBreaker: CircuitBreaker;
  /** Overridable for testing; defaults to PiAgentSession.create */
  sessionFactory?: SessionFactory;
}

export class SpecialistRunner {
  private sessionFactory: SessionFactory;

  constructor(private deps: RunnerDeps) {
    this.sessionFactory = deps.sessionFactory ?? PiAgentSession.create.bind(PiAgentSession);
  }

  async run(options: RunOptions, onProgress?: (msg: string) => void): Promise<RunResult> {
    const { loader, hooks, circuitBreaker } = this.deps;
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

    // Render task template
    const variables = { prompt: options.prompt, ...options.variables };
    const renderedTask = renderTemplate(prompt.task_template, variables);
    const promptHash = createHash('sha256').update(renderedTask).digest('hex').slice(0, 16);

    await hooks.emit('post_render', invocationId, metadata.name, metadata.version, {
      prompt_hash: promptHash,
      prompt_length_chars: renderedTask.length,
      estimated_tokens: Math.ceil(renderedTask.length / 4),
      system_prompt_present: !!prompt.system,
    });

    // Build agents.md content: system + skill_inherit + diagnostic_scripts
    let agentsMd = prompt.system ?? '';
    if (prompt.skill_inherit) {
      const { readFile } = await import('node:fs/promises');
      const skillContent = await readFile(prompt.skill_inherit, 'utf-8').catch(() => '');
      if (skillContent) agentsMd += `\n\n---\n# Service Knowledge\n\n${skillContent}`;
    }
    if (spec.specialist.capabilities?.diagnostic_scripts?.length) {
      agentsMd += '\n\n---\n# Diagnostic Scripts\nYou have access via Bash:\n';
      for (const s of spec.specialist.capabilities.diagnostic_scripts) {
        agentsMd += `- \`${s}\`\n`;
      }
    }

    await hooks.emit('pre_execute', invocationId, metadata.name, metadata.version, {
      backend: model,
      model,
      timeout_ms: execution.timeout_ms,
      permission_level: options.autonomyLevel ?? execution.permission_required,
    });

    let output: string;
    let session: Awaited<ReturnType<SessionFactory>> | undefined;
    try {
      session = await this.sessionFactory({
        model,
        systemPrompt: agentsMd || undefined,
        onToken: (delta) => onProgress?.(delta),
        onToolStart: (tool) => onProgress?.(`\n⚙ ${tool}…`),
        onToolEnd: (tool) => onProgress?.(`✓\n`),
      });
      await session.start();

      // Pre-phase scripts: run and inject output as $pre_script_output
      const preScripts = spec.specialist.skills?.scripts?.filter(s => s.phase === 'pre') ?? [];
      let preScriptOutput = '';
      for (const script of preScripts) {
        const out = await session.executeBash(script.path);
        if (script.inject_output) preScriptOutput += out + '\n';
      }

      // Re-render with pre_script_output if needed
      const finalTask = preScriptOutput
        ? renderTemplate(renderedTask, { pre_script_output: preScriptOutput.trim() })
        : renderedTask;

      await session.prompt(finalTask);
      await session.waitForIdle(execution.timeout_ms);
      output = await session.getLastOutput();

      // Post-phase scripts
      const postScripts = spec.specialist.skills?.scripts?.filter(s => s.phase === 'post') ?? [];
      for (const script of postScripts) {
        await session.executeBash(script.path);
      }

      circuitBreaker.recordSuccess(model);
    } catch (err: any) {
      circuitBreaker.recordFailure(model);
      await hooks.emit('post_execute', invocationId, metadata.name, metadata.version, {
        status: 'ERROR',
        duration_ms: Date.now() - start,
        output_valid: false,
        error: { type: 'backend_error', message: err.message },
      });
      throw err;
    } finally {
      session?.kill();
    }

    const durationMs = Date.now() - start;

    // Write to communication.output_to if defined
    if (communication?.output_to) {
      await writeFile(communication.output_to, output, 'utf-8').catch(() => {});
    }

    await hooks.emit('post_execute', invocationId, metadata.name, metadata.version, {
      status: 'COMPLETE',
      duration_ms: durationMs,
      output_valid: true,
    });

    return {
      output,
      backend: session!.meta.backend,
      model,
      durationMs,
      specialistVersion: metadata.version,
    };
  }
}
