// src/specialist/runner.ts
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { renderTemplate } from './templateEngine.js';
import {
  PiAgentSession,
  SessionKilledError,
  type PiSessionOptions,
  type SessionMetricEvent,
  type SessionRunMetrics,
} from '../pi/session.js';
import type { SpecialistLoader } from './loader.js';
import type { HookEmitter } from './hooks.js';
import { isAuthError, isTransientError, type CircuitBreaker } from '../utils/circuitBreaker.js';
import { stripJsonFences } from './json-output.js';

export interface RunOptions {
  name: string;
  prompt: string;
  variables?: Record<string, string>;
  backendOverride?: string;
  autonomyLevel?: string;
  /** Working directory for local scripts and the pi session. */
  workingDirectory?: string;
  /** Existing bead whose content should be used as the task prompt. */
  inputBeadId?: string;
  /** Lineage: set when --job <id> is used to reuse another job's worktree. */
  reusedFromJobId?: string;
  /** Bead dependency context depth (0 disables completed blocker injection). */
  contextDepth?: number;
  /** Lineage: root job id that originally created the reused worktree. */
  worktreeOwnerJobId?: string;
  /** Path to an existing pi session file for continuation (Phase 2+) */
  sessionPath?: string;
  /**
   * Keep the Pi session alive after agent_end.
   * Enables multi-turn: callers receive resumeFn/closeFn via onResumeReady callback.
   */
  keepAlive?: boolean;
  /** Explicitly disable keepAlive even when specialist.execution.interactive=true. */
  noKeepAlive?: boolean;
  /** Additional retries after the initial attempt (default: 0). */
  maxRetries?: number;
  /** Whether external (input) bead notes should be written by Supervisor. */
  beadsWriteNotes?: boolean;
}

export interface RunResult {
  output: string;
  backend: string;
  model: string;
  durationMs: number;
  specialistVersion: string;
  promptHash: string;
  beadId?: string;
  metrics?: SessionRunMetrics;
  permissionRequired?: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
}

type SessionLike = Pick<PiAgentSession, 'start' | 'prompt' | 'waitForDone' | 'getLastOutput' | 'getState' | 'close' | 'kill' | 'meta' | 'steer' | 'resume'>
  & { getMetrics?: () => SessionRunMetrics };

export type SessionFactory = (opts: PiSessionOptions) => Promise<SessionLike>;

import { BeadsClient, type BeadsClient as BeadsClientType, buildBeadContext, shouldCreateBead } from './beads.js';

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
  beadsClient?: BeadsClientType;
}

// ── Pre/post script helpers ───────────────────────────────────────────────────

interface ScriptResult {
  name: string;
  output: string;
  exitCode: number;
}

function runScript(command: string | undefined, cwd: string): ScriptResult {
  const run = (command ?? '').trim();
  if (!run) {
    return { name: 'unknown', output: 'Missing script command (expected `run` or legacy `path`).', exitCode: 1 };
  }

  const scriptName = basename(run.split(' ')[0]);
  try {
    const output = execSync(run, { encoding: 'utf8', timeout: 30_000, cwd });
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

function sanitizeBeadIdForPrompt(beadId: string): string {
  const withoutControlChars = beadId.replace(/[\x00-\x1F\x7F]/g, '');
  const withoutBackticks = withoutControlChars.replace(/`/g, '');
  return withoutBackticks.replace(/[^A-Za-z0-9-]/g, '');
}

type ResponseFormat = 'text' | 'json' | 'markdown';
type OutputType = 'codegen' | 'analysis' | 'review' | 'synthesis' | 'orchestration' | 'workflow' | 'research' | 'custom';
type JsonSchema = Record<string, unknown>;

const BASE_OUTPUT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    status: { enum: ['success', 'partial', 'failed', 'waiting'] },
    issues_closed: { type: 'array', items: { type: 'string' } },
    issues_created: { type: 'array', items: { type: 'string' } },
    follow_ups: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    verification: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'status', 'issues_closed', 'issues_created', 'follow_ups', 'risks', 'verification'],
};

const IMPACT_REPORT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    files_touched: { type: 'array', items: { type: 'string' } },
    symbols_analyzed: { type: 'array', items: { type: 'string' } },
    highest_risk: { enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    tool_invocations: { type: 'number' },
  },
};

const OUTPUT_TYPE_SCHEMA_EXTENSIONS: Record<Exclude<OutputType, 'custom'>, JsonSchema> = {
  codegen: {
    type: 'object',
    properties: {
      files_changed: { type: 'array', items: { type: 'string' } },
      symbols_modified: { type: 'array', items: { type: 'string' } },
      lint_pass: { type: 'boolean' },
      tests_pass: { type: 'boolean' },
      impact_report: IMPACT_REPORT_SCHEMA,
    },
  },
  analysis: {
    type: 'object',
    properties: {
      key_files: { type: 'array', items: { type: 'string' } },
      architecture_notes: { type: 'string' },
      recommendations: { type: 'array', items: { type: 'string' } },
      impact_report: IMPACT_REPORT_SCHEMA,
    },
  },
  review: {
    type: 'object',
    properties: {
      verdict: { enum: ['pass', 'partial', 'fail'] },
      findings: { type: 'array', items: { type: 'string' } },
      recommendation: { type: 'string' },
    },
  },
  synthesis: {
    type: 'object',
    properties: {
      decisions: { type: 'array', items: { type: 'string' } },
      rationale: { type: 'string' },
      next_steps: { type: 'array', items: { type: 'string' } },
    },
  },
  orchestration: {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        items: {
          oneOf: [
            {
              type: 'object',
              properties: {
                type: { enum: ['resume'] },
                memberId: { type: 'string' },
                task: { type: 'string' },
              },
              required: ['type', 'memberId', 'task'],
            },
            {
              type: 'object',
              properties: {
                type: { enum: ['steer'] },
                memberId: { type: 'string' },
                message: { type: 'string' },
              },
              required: ['type', 'memberId', 'message'],
            },
            {
              type: 'object',
              properties: {
                type: { enum: ['stop'] },
                memberId: { type: 'string' },
              },
              required: ['type', 'memberId'],
            },
          ],
        },
      },
      blocking_on: {
        type: 'object',
        properties: {
          kind: { enum: ['human_input', 'member_output', 'external_dependency'] },
          target: { type: 'string' },
          details: { type: 'string' },
        },
        required: ['kind'],
      },
      memory_patch: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            entry_type: { enum: ['fact', 'question', 'decision'] },
            entry_id: { type: 'string' },
            summary: { type: 'string' },
            source_member_id: { type: 'string' },
            confidence: { type: 'number' },
            provenance: { type: 'object' },
          },
          required: ['entry_type', 'summary'],
        },
      },
      coordination_state: {
        type: 'object',
        properties: {
          current_goal: { type: 'string' },
          active_members: { type: 'array', items: { type: 'string' } },
          waiting_on_members: { type: 'array', items: { type: 'string' } },
          pending_decisions: { type: 'array', items: { type: 'string' } },
          blockers: { type: 'array', items: { type: 'string' } },
        },
      },
      routing_rationale: { type: 'string' },
      next_trigger: {
        type: 'object',
        properties: {
          event: { enum: ['on_member_update', 'on_human_input', 'on_external_update', 'on_timeout', 'manual_resume'] },
          target: { type: 'string' },
          details: { type: 'string' },
        },
        required: ['event'],
      },
    },
  },
  workflow: {
    type: 'object',
    properties: {
      steps_completed: { type: 'array', items: { type: 'string' } },
      first_task: { type: 'string' },
      children: { type: 'array', items: { type: 'string' } },
      test_issues: { type: 'array', items: { type: 'string' } },
    },
  },
  research: {
    type: 'object',
    properties: {
      sources_checked: { type: 'array', items: { type: 'string' } },
      confidence: { enum: ['low', 'medium', 'high'] },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
  },
};

const OUTPUT_TYPE_GUIDANCE: Record<Exclude<OutputType, 'custom'>, string> = {
  codegen: '- Codegen focus: include exact file paths, symbols touched, and implementation outcomes.',
  analysis: '- Analysis focus: include architecture understanding and evidence-backed findings.',
  review: '- Review focus: include severity-ranked findings with clear merge/readiness recommendation.',
  synthesis: '- Synthesis focus: consolidate findings into decisions and clear next steps.',
  orchestration: '- Orchestration focus: include actions, blockers, routing rationale, and rehydration state.',
  workflow: '- Workflow focus: include procedural state transitions and operational checkpoints.',
  research: '- Research focus: include sources checked, confidence, and final recommendations.',
};

function deepMergeSchemas(base: JsonSchema, override: JsonSchema): JsonSchema {
  const merged: JsonSchema = { ...base };
  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = merged[key];
    if (isRecord(baseValue) && isRecord(overrideValue)) {
      merged[key] = deepMergeSchemas(baseValue, overrideValue);
      continue;
    }
    merged[key] = overrideValue;
  }
  return merged;
}

function resolveOutputContractSchema(
  responseFormat: ResponseFormat,
  outputType: OutputType,
  outputSchema: JsonSchema | undefined,
): JsonSchema | undefined {
  if (responseFormat === 'text') return undefined;
  if (responseFormat === 'markdown' && !outputSchema) return undefined;

  let mergedSchema: JsonSchema = { ...BASE_OUTPUT_SCHEMA };

  if (outputType !== 'custom') {
    mergedSchema = deepMergeSchemas(mergedSchema, OUTPUT_TYPE_SCHEMA_EXTENSIONS[outputType]);
  }

  if (outputSchema) {
    mergedSchema = deepMergeSchemas(mergedSchema, outputSchema);
  }

  return mergedSchema;
}

function buildOutputContractInstruction(
  responseFormat: ResponseFormat,
  outputType: OutputType,
  outputSchema: JsonSchema | undefined,
): string {
  if (responseFormat === 'text') return '';

  const lines: string[] = ['## Output Contract'];

  if (responseFormat === 'markdown') {
    lines.push(
      'Respond using markdown with canonical sections (include when applicable):',
      '- `## Summary`',
      '- `## Status`',
      '- `## Changes`',
      '- `## Verification`',
      '- `## Risks`',
      '- `## Follow-ups`',
      '- `## Beads`',
      'Optional sections when relevant:',
      '- `## Architecture`',
      '- `## Acceptance Criteria`',
      '- `## Machine-readable block`',
      'Do not impose artificial bullet limits — prioritize completeness and clarity.',
    );
  } else {
    lines.push(
      'Respond with a single valid JSON object only.',
      'Do not wrap JSON in markdown fences, headers, or prose.',
    );
  }

  if (outputType !== 'custom') {
    lines.push(`Output archetype: \`${outputType}\``);
    lines.push(OUTPUT_TYPE_GUIDANCE[outputType]);
  }

  if (outputSchema) {
    lines.push(
      'Structure your output to match this schema:',
      '```json',
      JSON.stringify(outputSchema, null, 2),
      '```',
    );

    if (responseFormat === 'markdown') {
      lines.push(
        'MANDATORY: include `## Machine-readable block` with exactly one JSON object in a single ```json fenced block.',
        'The machine-readable JSON block is canonical and must match the schema.',
      );
    }
  }

  return `\n\n${lines.join('\n')}`;
}

function tryParseJson(input: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(input) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

function extractJsonFromMachineReadableBlock(output: string): { value?: unknown; error?: string } {
  const blockRegex = /##\s*Machine-readable block[\s\S]*?```json\s*([\s\S]*?)```/i;
  const match = output.match(blockRegex);
  if (!match || !match[1]) {
    return { error: 'missing `## Machine-readable block` JSON fenced block' };
  }
  return tryParseJson(match[1].trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateValueAgainstSchema(value: unknown, schema: JsonSchema, path: string): string[] {
  const errors: string[] = [];
  const schemaType = schema.type;
  const schemaEnum = schema.enum;

  if (Array.isArray(schemaEnum) && schemaEnum.length > 0 && !schemaEnum.some(candidate => Object.is(candidate, value))) {
    errors.push(`${path}: expected one of [${schemaEnum.map(item => JSON.stringify(item)).join(', ')}], got ${JSON.stringify(value)}`);
  }

  const effectiveType = typeof schemaType === 'string'
    ? schemaType
    : isRecord(schema.properties) || Array.isArray(schema.required)
      ? 'object'
      : Array.isArray(schema.items)
        ? 'array'
        : undefined;

  if (!effectiveType) return errors;

  switch (effectiveType) {
    case 'object': {
      if (!isRecord(value)) {
        errors.push(`${path}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`);
        return errors;
      }
      const properties = isRecord(schema.properties) ? schema.properties : {};
      const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];

      for (const key of required) {
        if (!(key in value)) {
          errors.push(`${path}.${key}: missing required property`);
        }
      }

      for (const [key, propertySchemaRaw] of Object.entries(properties)) {
        if (!(key in value)) continue;
        if (!isRecord(propertySchemaRaw)) continue;
        errors.push(...validateValueAgainstSchema(value[key], propertySchemaRaw, `${path}.${key}`));
      }
      return errors;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeof value}`);
        return errors;
      }
      const itemSchema = isRecord(schema.items) ? schema.items : undefined;
      if (!itemSchema) return errors;
      for (let i = 0; i < value.length; i += 1) {
        errors.push(...validateValueAgainstSchema(value[i], itemSchema, `${path}[${i}]`));
      }
      return errors;
    }
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}: expected string, got ${typeof value}`);
      return errors;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) errors.push(`${path}: expected number, got ${typeof value}`);
      return errors;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) errors.push(`${path}: expected integer, got ${JSON.stringify(value)}`);
      return errors;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean, got ${typeof value}`);
      return errors;
    default:
      return errors;
  }
}

function validateOutputContract(
  output: string,
  responseFormat: ResponseFormat,
  outputSchema: JsonSchema | undefined,
): string[] {
  const warnings: string[] = [];
  if (responseFormat === 'text') return warnings;

  if (!outputSchema) return warnings;

  let structuredPayload: unknown;

  if (responseFormat === 'json') {
    const parsed = tryParseJson(output.trim());
    if (parsed.error) {
      warnings.push(`Strong warning: response_format=json but output is not valid JSON (${parsed.error}).`);
      return warnings;
    }
    structuredPayload = parsed.value;
  }

  if (responseFormat === 'markdown') {
    const parsed = extractJsonFromMachineReadableBlock(output);
    if (parsed.error) {
      warnings.push(`Output contract warning: ${parsed.error}.`);
      return warnings;
    }
    structuredPayload = parsed.value;
  }

  const schemaErrors = validateValueAgainstSchema(structuredPayload, outputSchema, '$');
  if (schemaErrors.length > 0) {
    warnings.push(
      `Output contract warning: schema mismatch (${schemaErrors.length} issue${schemaErrors.length === 1 ? '' : 's'}).`,
      ...schemaErrors.map(issue => `  - ${issue}`),
    );
  }

  return warnings;
}

export class SpecialistRunner {
  private sessionFactory: SessionFactory;

  constructor(private deps: RunnerDeps) {
    this.sessionFactory = deps.sessionFactory ?? PiAgentSession.create.bind(PiAgentSession);
  }

  private resolvePromptWithBeadContext(options: RunOptions, beadsClient?: BeadsClientType): string {
    if (!options.inputBeadId) {
      return options.prompt;
    }

    const beadReader = beadsClient ?? new BeadsClient();
    const bead = beadReader.readBead(options.inputBeadId);
    if (!bead) {
      return options.prompt;
    }

    const contextDepth = Math.max(0, Math.trunc(options.contextDepth ?? 1));
    const blockers = contextDepth > 0
      ? beadReader.getCompletedBlockers(options.inputBeadId, contextDepth)
      : [];

    return buildBeadContext(bead, blockers);
  }

  async run(
    options: RunOptions,
    onProgress?: (msg: string) => void,
    onEvent?: (
      type: string,
      details?: {
        charCount?: number;
        toolCallId?: string;
        model?: string;
        previousModel?: string;
        action?: 'set_model' | 'cycle_model';
        extension?: string;
        errorMessage?: string;
        tokensBefore?: number;
        summary?: string;
        firstKeptEntryId?: string;
        attempt?: number;
        maxAttempts?: number;
        delayMs?: number;
      },
    ) => void,
    onMetric?: (event: SessionMetricEvent) => void,
    onMeta?: (meta: { backend: string; model: string }) => void,
    onKillRegistered?: (killFn: () => void) => void,
    onBeadCreated?: (beadId: string) => void,
    onSteerRegistered?: (steerFn: (msg: string) => Promise<void>) => void,
    onResumeReady?: (
      resumeFn: (msg: string) => Promise<string>,
      closeFn: () => Promise<void>,
    ) => void,
    onToolStartCallback?: (tool: string, args?: Record<string, unknown>, toolCallId?: string) => void,
    onToolEndCallback?: (tool: string, isError: boolean, toolCallId?: string, resultContent?: string, resultRaw?: Record<string, unknown>) => void,
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
    const effectiveKeepAlive = options.noKeepAlive
      ? false
      : (options.keepAlive ?? execution.interactive ?? false);

    // Pre-run validation: check scripts exist, commands/tools are available, shebang typos
    validateBeforeRun(spec, permissionLevel);

    // Pre-phase scripts/commands run locally before the pi session starts.
    // Their stdout is captured and injected into the task via $pre_script_output.
    const runCwd = resolve(options.workingDirectory ?? process.cwd());

    const preScripts = spec.specialist.skills?.scripts?.filter(s => s.phase === 'pre') ?? [];
    const preResults = preScripts
      .map(s => runScript(s.run ?? (s as any).path, runCwd))
      .filter((_, i) => preScripts[i].inject_output);
    const preScriptOutput = formatScriptOutput(preResults);

    // Render task template (pre_script_output is '' when no scripts ran)
    const resolvedPrompt = this.resolvePromptWithBeadContext(options, beadsClient);
    const beadVariables: Record<string, string> = options.inputBeadId
      ? { bead_context: resolvedPrompt, bead_id: options.inputBeadId }
      : {};
    const beadTemplateVariables: Record<string, string> = options.inputBeadId
      ? { bead_id: options.inputBeadId, prompt: resolvedPrompt }
      : {};
    const variables: Record<string, string> = {
      prompt: resolvedPrompt,
      cwd: runCwd,
      pre_script_output: preScriptOutput,
      ...(options.variables ?? {}),
      ...beadVariables,
    };
    const taskTemplate = options.inputBeadId
      ? renderTemplate(prompt.task_template, beadTemplateVariables)
      : prompt.task_template;
    const renderedTask = renderTemplate(taskTemplate, variables);
    const promptHash = createHash('sha256').update(renderedTask).digest('hex').slice(0, 16);

    await hooks.emit('post_render', invocationId, metadata.name, metadata.version, {
      prompt_hash: promptHash,
      prompt_length_chars: renderedTask.length,
      estimated_tokens: Math.ceil(renderedTask.length / 4),
      system_prompt_present: !!prompt.system,
    });

    // Build system prompt from prompt.system only.
    // skill_inherit and skills.paths are injected via pi --skill (native).
    let agentsMd = options.inputBeadId
      ? renderTemplate(prompt.system ?? '', beadTemplateVariables)
      : (prompt.system ?? '');

    // Always inject a Specialist Run Context block to override project-level CLAUDE.md/AGENTS.md
    // instructions that are meant for human developers, not specialist agents. Key overrides:
    // - CLAUDE.md often says "run specialists init" — specialists must NEVER do this
    // - CLAUDE.md edit-gate rules say "bd create before editing" — not applicable inside a specialist
    {
      const sanitizedBeadId = options.inputBeadId
        ? sanitizeBeadIdForPrompt(options.inputBeadId)
        : '';
      const beadInstructions = sanitizedBeadId
        ? `\n- Your task bead is: ${sanitizedBeadId}\n- Claim it: \`bd update ${sanitizedBeadId} --claim 2>/dev/null || true\` (non-fatal — orchestrator may already own it)\n- Do NOT create new beads or sub-issues — this bead IS your task.\n- Do NOT run \`bd create\` — the orchestrator manages issue tracking.\n- Close when done: \`bd close ${sanitizedBeadId} --reason="..."\``
        : '';
      agentsMd += `\n\n---\n## Specialist Run Context (OVERRIDES CLAUDE.md / AGENTS.md)\nYou are a specialist agent. The following rules OVERRIDE any conflicting instructions in CLAUDE.md or AGENTS.md:\n- Do NOT run \`specialists init\` or \`sp init\` — these are user-only bootstrap commands that will corrupt the project.\n- Do NOT run \`specialists setup\` or \`specialists install\`.\n- The edit-gate (bd create before editing) does NOT apply inside a specialist run.
- GitNexus impact warnings (HIGH/CRITICAL risk) are INFORMATIONAL ONLY — do NOT stop or wait for confirmation. Proceed with the fix regardless of risk level. The orchestrator has already approved the work by dispatching you.\n- NEVER change your working directory. Do not \`cd\` anywhere. All file paths are relative to your initial cwd. If you need files outside your working directory, use absolute paths — but never leave.${beadInstructions}\n---\n`;
    }

    const responseFormat = (execution.response_format ?? 'text') as ResponseFormat;
    const outputType = (execution.output_type ?? 'custom') as OutputType;
    const specialistOutputSchema = prompt.output_schema as JsonSchema | undefined;
    const outputContractSchema = resolveOutputContractSchema(responseFormat, outputType, specialistOutputSchema);
    agentsMd += buildOutputContractInstruction(responseFormat, outputType, outputContractSchema);

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
    let runMetrics: SessionRunMetrics | undefined;
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
        cwd: runCwd,
        onToken:     (delta) => onProgress?.(delta),
        onThinking:  (delta) => onProgress?.(`💭 ${delta}`),
        onToolStart: (tool, args, toolCallId) => { onProgress?.(`\n⚙ ${tool}…`); onToolStartCallback?.(tool, args, toolCallId); },
        onToolEnd:   (tool, isError, toolCallId, resultContent, resultRaw) => { onProgress?.(`✓\n`); onToolEndCallback?.(tool, isError, toolCallId, resultContent, resultRaw); },
        onEvent:     (type, details)  => onEvent?.(type, details),
        onMetric:    (event) => onMetric?.(event),
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
          runMetrics = session.getMetrics?.();
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

      if (responseFormat === 'json') {
        output = stripJsonFences(output);
      }

      if (effectiveKeepAlive && onResumeReady) {
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
      for (const script of postScripts) runScript(script.run ?? (script as any).path, runCwd);

      circuitBreaker.recordSuccess(model);
    } catch (err: any) {
      const isCancelled = err instanceof SessionKilledError;
      const authError = isAuthError(err);
      if (!isCancelled && !authError) {
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

    const outputContractWarnings = validateOutputContract(output, responseFormat, outputContractSchema);
    if (outputContractWarnings.length > 0) {
      process.stderr.write(`[specialists] output contract warnings:\n${outputContractWarnings.map(msg => `  ⚠ ${msg}`).join('\n')}\n`);
    }

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
      metrics: runMetrics,
      permissionRequired: execution.permission_required,
    };
  }

  /**
   * @deprecated Legacy in-memory async path.
   * Now uses Supervisor-backed jobs under .specialists/jobs.
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
      undefined,
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
