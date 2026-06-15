import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { SpecialistLoader } from './loader.js';
import { renderTemplate } from './templateEngine.js';
import { createObservabilitySqliteClient, createObservabilitySqliteClientAtPath } from './observability-sqlite.js';
import type { Specialist } from './schema.js';
import type { SupervisorStatus } from './supervisor.js';
import { resolveModelChain } from './model-chain.js';

export type ScriptSpecialistErrorType =
  | 'specialist_not_found'
  | 'specialist_load_error'
  | 'template_variable_missing'
  | 'template_field_misuse'
  | 'auth'
  | 'quota'
  | 'timeout'
  | 'network'
  | 'invalid_json'
  | 'prompt_too_large'
  | 'output_too_large'
  | 'internal';

export interface ScriptGenerateRequest {
  specialist: string;
  requested_specialist?: string;
  variables?: Record<string, string>;
  template?: string;
  model_override?: string;
  thinking_level?: string;
  timeout_ms?: number;
  trace?: boolean;
}

export interface ScriptGenerateSuccess {
  success: true;
  output: string;
  parsed_json?: unknown;
  meta: { specialist: string; requested_specialist?: string; resolved_specialist?: string; model: string; duration_ms: number; trace_id: string };
}

export interface ScriptGenerateFailure {
  success: false;
  error: string;
  error_type: ScriptSpecialistErrorType;
  meta?: { specialist?: string; requested_specialist?: string; resolved_specialist?: string; model?: string; duration_ms?: number; trace_id?: string };
}

export type ScriptGenerateResult = ScriptGenerateSuccess | ScriptGenerateFailure;

export interface TrustOptions {
  allowSkills?: boolean;
  allowSkillsRoots?: string[];
  allowLocalScripts?: boolean;
}

export class CompatGuardError extends Error {
  constructor(
    public readonly field: 'execution.interactive' | 'execution.requires_worktree' | 'execution.permission_required' | 'skills.scripts' | 'skills.paths' | 'prompt.skill_inherit',
    message: string,
  ) {
    super(message);
    this.name = 'CompatGuardError';
  }
}

export interface SkillSource {
  path: string;
  sha256: string;
  source: 'skills.paths' | 'prompt.skill_inherit';
}

export interface ScriptRunnerOptions {
  loader: SpecialistLoader;
  projectDir?: string;
  fallbackModel?: string;
  observabilityDbPath?: string;
  onChild?: (child: ChildProcess) => void;
  onAuditFailure?: (error: unknown) => void;
  trust?: TrustOptions;
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const candidate = resolve(candidatePath);
  const root = resolve(rootPath);
  const rel = relative(root, candidate);
  return rel === '' || (rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel));
}

function assertSkillPathWithinRoots(field: 'skills.paths' | 'prompt.skill_inherit', path: string, roots: string[]): void {
  const allowed = roots.some((root) => isPathWithinRoot(path, root));
  if (!allowed) {
    throw new CompatGuardError(field, `skill path '${path}' not under any --allow-skills-roots entry`);
  }
}

function hasUnsubstitutedVariables(template: string, variables: Record<string, string>): string | null {
  const matches = template.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g) ?? [];
  for (const match of matches) {
    const key = match.slice(1);
    if (variables[key] === undefined) return key;
  }
  return null;
}

export function compatGuard(spec: Specialist, trust?: TrustOptions): void {
  const execution = spec.specialist.execution;
  if (execution.interactive) throw new CompatGuardError('execution.interactive', 'interactive specialists are not allowed');
  if (execution.requires_worktree) throw new CompatGuardError('execution.requires_worktree', 'worktree specialists are not allowed');
  if (execution.permission_required !== 'READ_ONLY') throw new CompatGuardError('execution.permission_required', 'permission_required must be READ_ONLY');

  const hasScripts = (spec.specialist.skills?.scripts?.length ?? 0) > 0;
  if (hasScripts) {
    throw new CompatGuardError('skills.scripts', 'local scripts are not supported in script-class specialists');
  }

  const hasPaths = (spec.specialist.skills?.paths?.length ?? 0) > 0;
  const hasSkillInherit = Boolean(spec.specialist.prompt.skill_inherit);
  if (hasPaths && !trust?.allowSkills) {
    throw new CompatGuardError('skills.paths', 'skills not allowed (enable with --allow-skills)');
  }
  if (hasSkillInherit && !trust?.allowSkills) {
    throw new CompatGuardError('prompt.skill_inherit', 'skills not allowed (enable with --allow-skills)');
  }

  if (trust?.allowSkills && trust.allowSkillsRoots && trust.allowSkillsRoots.length > 0) {
    const paths = spec.specialist.skills?.paths ?? [];
    for (const path of paths) assertSkillPathWithinRoots('skills.paths', path, trust.allowSkillsRoots);
    if (typeof spec.specialist.prompt.skill_inherit === 'string') {
      assertSkillPathWithinRoots('prompt.skill_inherit', spec.specialist.prompt.skill_inherit, trust.allowSkillsRoots);
    }
  }
}

function collectSkillPathEntries(spec: Specialist): Array<{ path: string; source: SkillSource['source'] }> {
  return [
    ...(spec.specialist.skills?.paths ?? []).map((path) => ({ path, source: 'skills.paths' as const })),
    ...(typeof spec.specialist.prompt.skill_inherit === 'string'
      ? [{ path: spec.specialist.prompt.skill_inherit, source: 'prompt.skill_inherit' as const }]
      : []),
  ];
}

function collectSkillPaths(spec: Specialist): string[] {
  return collectSkillPathEntries(spec).map((entry) => entry.path);
}

export function computeSkillSources(spec: Specialist): SkillSource[] {
  const entries = collectSkillPathEntries(spec);
  const sources: SkillSource[] = [];
  for (const { path, source } of entries) {
    try {
      const content = readFileSync(path);
      const sha256 = createHash('sha256').update(content).digest('hex');
      sources.push({ path, sha256, source });
    } catch {
      sources.push({ path, sha256: 'unreadable', source });
    }
  }
  return sources;
}

export function renderTaskTemplate(template: string, variables: Record<string, string>): string {
  const missing = hasUnsubstitutedVariables(template, variables);
  if (missing) throw new Error(`Missing template variable: ${missing}`);
  return renderTemplate(template, variables);
}

function truncateForPrompt(value: string, limitBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= limitBytes) return value;
  return `${value.slice(0, limitBytes)}\n... truncated ...`;
}

function buildJsonOutputContract(spec: Specialist): string | undefined {
  if (spec.specialist.execution.response_format !== 'json') return undefined;
  const schema = spec.specialist.prompt.output_schema;
  const required = Array.isArray(schema?.required)
    ? schema.required.filter((value): value is string => typeof value === 'string')
    : [];
  const lines = [
    'Output contract:',
    '- Return only valid JSON. Do not include Markdown fences, prose, or commentary.',
  ];
  if (required.length > 0) lines.push(`- Include these required top-level keys: ${required.join(', ')}.`);
  if (schema) lines.push(`- JSON schema: ${truncateForPrompt(JSON.stringify(schema), 4096)}`);
  return lines.join('\n');
}

export function applyOutputContract(prompt: string, spec: Specialist): string {
  const contract = buildJsonOutputContract(spec);
  return contract ? `${prompt}\n\n${contract}` : prompt;
}

function mapErrorType(message: string): ScriptSpecialistErrorType {
  if (message.includes('Specialist not found')) return 'specialist_not_found';
  if (message.includes('interactive') || message.includes('worktree') || message.includes('permission_required') || message.includes('scripts not allowed')) return 'specialist_load_error';
  if (message.includes('Missing template variable')) return 'template_variable_missing';
  if (message.includes('prompt too large')) return 'prompt_too_large';
  if (message.includes('output too large')) return 'output_too_large';
  if (message.includes('auth') || message.includes('403') || message.includes('401')) return 'auth';
  if (message.includes('quota') || message.includes('rate limit') || message.includes('out of extra usage') || message.includes('insufficient_quota') || message.includes('429')) return 'quota';
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('network') || message.includes('ECONN')) return 'network';
  if (message.includes('invalid JSON') || message.includes('Unexpected token')) return 'invalid_json';
  return 'internal';
}

interface PiMessage {
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
  errorMessage?: string;
}

interface PiEvent {
  type?: string;
  message?: PiMessage;
  messages?: PiMessage[];
  data?: { text?: string; content?: Array<{ text?: string }> };
}

function textFromMessage(message: PiMessage | undefined): string {
  if (!message || message.role !== 'assistant') return '';
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter(part => part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text as string)
    .join('');
}

function extractAssistantText(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let event: PiEvent;
    try {
      event = JSON.parse(line) as PiEvent;
    } catch {
      continue;
    }
    if (event.type === 'message_end') {
      const text = textFromMessage(event.message);
      if (text) return text;
    }
    if (event.type === 'agent_end' && Array.isArray(event.messages)) {
      for (let j = event.messages.length - 1; j >= 0; j--) {
        const text = textFromMessage(event.messages[j]);
        if (text) return text;
      }
    }
    if (event.type === 'assistant' && typeof event.data?.text === 'string') return event.data.text;
    const legacyContent = event.data?.content?.[0]?.text;
    if (typeof legacyContent === 'string') return legacyContent;
  }
  return '';
}

function extractAssistantTextFromEvent(event: PiEvent): string | undefined {
  if (event.type === 'message_end') {
    const text = textFromMessage(event.message);
    if (text) return text;
  }
  if (event.type === 'agent_end' && Array.isArray(event.messages)) {
    for (let j = event.messages.length - 1; j >= 0; j--) {
      const text = textFromMessage(event.messages[j]);
      if (text) return text;
    }
  }
  if (event.type === 'assistant' && typeof event.data?.text === 'string') return event.data.text;
  const legacyContent = event.data?.content?.[0]?.text;
  if (typeof legacyContent === 'string') return legacyContent;
  return undefined;
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractPiErrorMessage(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line) as PiEvent;
      const errMsg = event.message?.errorMessage;
      if (typeof errMsg === 'string' && errMsg.length > 0) return errMsg;
    } catch {
      continue;
    }
  }
  return null;
}

function writeTraceRow(client: ReturnType<typeof createObservabilitySqliteClient>, specialist: string, model: string, traceId: string, output: string, durationMs: number, skillSources: SkillSource[] | undefined, onAuditFailure?: (error: unknown) => void): void {
  if (!client) return;
  const status = {
    id: traceId,
    specialist,
    status: 'done',
    model,
    started_at_ms: Date.now() - durationMs,
    elapsed_s: durationMs / 1000,
    last_event_at_ms: Date.now(),
    surface: 'script_specialist',
    ...(skillSources && skillSources.length > 0 ? { skill_sources: skillSources } : {}),
  } as unknown as SupervisorStatus;
  try {
    client.upsertStatus(status);
    client.upsertResult(traceId, output);
  } catch (error: unknown) {
    onAuditFailure?.(error);
  }
}

export const DEFAULT_PENDING_LINE_LIMIT_BYTES = 16 * 1024 * 1024;
export const DEFAULT_ASSISTANT_TEXT_LIMIT_BYTES = 4 * 1024 * 1024;
export const DEFAULT_STDERR_LIMIT_BYTES = 1 * 1024 * 1024;
export const DEFAULT_PROMPT_LIMIT_BYTES = 4 * 1024 * 1024;

export function resolvePromptLimitBytes(spec: Specialist): number {
  return spec.specialist.execution.prompt_limit_bytes ?? resolveEnvPromptLimitBytes() ?? DEFAULT_PROMPT_LIMIT_BYTES;
}

function resolveEnvPromptLimitBytes(): number | undefined {
  const raw = process.env.SPECIALISTS_SCRIPT_PROMPT_LIMIT_BYTES;
  if (raw === undefined) return undefined;
  const envLimit = Number(raw);
  if (!Number.isFinite(envLimit) || envLimit <= 0) return undefined;
  return Math.floor(envLimit);
}

export function resolveAssistantTextLimitBytes(spec: Specialist): number {
  return spec.specialist.execution.stdout_limit_bytes ?? resolveEnvAssistantTextLimitBytes() ?? DEFAULT_ASSISTANT_TEXT_LIMIT_BYTES;
}

function resolveEnvAssistantTextLimitBytes(): number | undefined {
  const raw = process.env.SPECIALISTS_SCRIPT_STDOUT_LIMIT_BYTES;
  if (raw === undefined) return undefined;
  const envLimit = Number(raw);
  if (!Number.isFinite(envLimit) || envLimit <= 0) return undefined;
  process.stderr.write('warning: SPECIALISTS_SCRIPT_STDOUT_LIMIT_BYTES is deprecated; applies to assistant text cap\n');
  return Math.floor(envLimit);
}

function openObservabilityClient(options: ScriptRunnerOptions): ReturnType<typeof createObservabilitySqliteClient> {
  if (options.observabilityDbPath) return createObservabilitySqliteClientAtPath(options.observabilityDbPath);
  return createObservabilitySqliteClient(options.projectDir);
}

function resolveScriptSpecialistName(name: string): string {
  if (name === 'changelog-keeper') return 'changelog-drafter';
  return name;
}

const TEMPLATE_FIELD_MISUSE_MAX_LEN = 30;
const TEMPLATE_FIELD_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Returns the deduplicated list of required output keys for this spec.
 * Sources, in order:
 *   1. `execution.expected_output_keys` — author-declared, fires for any response_format.
 *   2. `prompt.output_schema.required` — JSON Schema required array, only relevant when
 *      `response_format === 'json'` (the runtime parses the JSON anyway in that case).
 * Authors using `response_format: 'text'` with an inline JSON contract should declare
 * `expected_output_keys` so saved-but-corrupt outputs are caught instead of stored.
 */
export function collectRequiredOutputKeys(spec: { specialist: { execution: { response_format?: string; expected_output_keys?: unknown }; prompt: { output_schema?: { required?: unknown } } } }): string[] {
  const keys = new Set<string>();
  const declared = spec.specialist.execution.expected_output_keys;
  if (Array.isArray(declared)) {
    for (const value of declared) {
      if (typeof value === 'string' && value.length > 0) keys.add(value);
    }
  }
  if (spec.specialist.execution.response_format === 'json') {
    const required = spec.specialist.prompt.output_schema?.required;
    if (Array.isArray(required)) {
      for (const value of required) {
        if (typeof value === 'string' && value.length > 0) keys.add(value);
      }
    }
  }
  return Array.from(keys);
}

/**
 * Detects when `input.template` looks like a spec field name (e.g. "task_template",
 * "normalize_template") instead of an actual template body. This catches the
 * production bug where a consumer passes the key name expecting the service to
 * dereference it on `spec.prompt`. Returns the offending field name when misused,
 * or null otherwise.
 */
export function detectTemplateFieldMisuse(template: string, specPrompt: Record<string, unknown> | null | undefined): string | null {
  if (!specPrompt) return null;
  if (template.length > TEMPLATE_FIELD_MISUSE_MAX_LEN) return null;
  if (!TEMPLATE_FIELD_IDENTIFIER_RE.test(template)) return null;
  if (!Object.prototype.hasOwnProperty.call(specPrompt, template)) return null;
  return template;
}

export async function runScriptSpecialist(input: ScriptGenerateRequest, options: ScriptRunnerOptions): Promise<ScriptGenerateResult> {
  const traceId = randomUUID();
  const startedAt = Date.now();
  try {
    const resolvedSpecialist = resolveScriptSpecialistName(input.specialist);
    const spec = await options.loader.get(resolvedSpecialist);
    compatGuard(spec, options.trust);
    const skillPaths = options.trust?.allowSkills ? collectSkillPaths(spec) : [];
    const skillSources = options.trust?.allowSkills ? computeSkillSources(spec) : undefined;

    const template = input.template ?? spec.specialist.prompt.task_template;
    if (input.template !== undefined) {
      const misusedField = detectTemplateFieldMisuse(input.template, spec.specialist.prompt as Record<string, unknown>);
      if (misusedField !== null) {
        const modelCandidates = collectModelCandidates(input, spec, options);
        return {
          success: false,
          error: `template field misuse: input.template equals spec.prompt.${misusedField} key name (${input.template.length} chars). The 'template' input field expects the literal template body, not a spec key. To use the spec's default, omit 'template'; to use a non-default template body, pass its full text inline.`,
          error_type: 'template_field_misuse',
          meta: {
            specialist: resolvedSpecialist,
            requested_specialist: input.requested_specialist ?? input.specialist,
            resolved_specialist: resolvedSpecialist,
            model: modelCandidates[0],
            duration_ms: Date.now() - startedAt,
            trace_id: traceId,
          },
        };
      }
    }
    const prompt = applyOutputContract(renderTaskTemplate(template, input.variables ?? {}), spec);
    const modelCandidates = collectModelCandidates(input, spec, options);
    const promptLimitBytes = resolvePromptLimitBytes(spec);
    const promptBytes = Buffer.byteLength(prompt, 'utf8');
    if (promptBytes > promptLimitBytes) {
      return {
        success: false,
        error: `prompt too large: ${promptBytes} bytes exceeds limit ${promptLimitBytes} bytes`,
        error_type: 'prompt_too_large',
        meta: {
          specialist: resolvedSpecialist,
          requested_specialist: input.requested_specialist ?? input.specialist,
          resolved_specialist: resolvedSpecialist,
          model: modelCandidates[0],
          duration_ms: Date.now() - startedAt,
          trace_id: traceId,
        },
      };
    }
    if (process.env.SPECIALISTS_SCRIPT_STUB_OUTPUT) {
      return {
        success: true,
        output: prompt,
        meta: {
          specialist: resolvedSpecialist,
          requested_specialist: input.requested_specialist ?? input.specialist,
          resolved_specialist: resolvedSpecialist,
          model: 'stub',
          duration_ms: Date.now() - startedAt,
          trace_id: traceId,
        },
      };
    }
    const timeoutMs = input.timeout_ms ?? spec.specialist.execution.timeout_ms ?? 120_000;
    const assistantTextLimitBytes = resolveAssistantTextLimitBytes(spec);
    const attempts: Array<{ model: string; text: string; stderr: string }> = [];

    for (const model of modelCandidates) {
      const systemPrompt = spec.specialist.prompt.system || undefined;
      const systemPromptMode = spec.specialist.prompt.system_prompt_mode;
      const attempt = await runSingleAttempt(prompt, model, input.thinking_level ?? spec.specialist.execution.thinking_level, timeoutMs, assistantTextLimitBytes, options, systemPrompt, systemPromptMode, skillPaths);
      attempts.push(attempt);
      const parsed = classifyAttempt(attempt);
      if (parsed.retryable) continue;

      const durationMs = Date.now() - startedAt;
      const observability = openObservabilityClient(options);
      if (input.trace !== false && observability) writeTraceRow(observability, resolvedSpecialist, model, traceId, parsed.text, durationMs, skillSources, options.onAuditFailure);

      if (parsed.kind === 'success') {
        let parsed_json: unknown;
        const expectedKeys = collectRequiredOutputKeys(spec);
        const shouldParseJson = spec.specialist.execution.response_format === 'json' || expectedKeys.length > 0;
        if (shouldParseJson) {
          try {
            parsed_json = JSON.parse(stripMarkdownFences(parsed.text));
            for (const key of expectedKeys) {
              if (parsed_json === null || typeof parsed_json !== 'object' || !(key in parsed_json)) throw new Error(`Missing required output field: ${key}`);
            }
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error), error_type: 'invalid_json', meta: { specialist: resolvedSpecialist, requested_specialist: input.requested_specialist ?? input.specialist, resolved_specialist: resolvedSpecialist, model, duration_ms: durationMs, trace_id: traceId } };
          }
        }
        return { success: true, output: parsed.text, parsed_json, meta: { specialist: resolvedSpecialist, requested_specialist: input.requested_specialist ?? input.specialist, resolved_specialist: resolvedSpecialist, model, duration_ms: durationMs, trace_id: traceId } };
      }
      return { success: false, error: parsed.error, error_type: parsed.errorType, meta: { specialist: resolvedSpecialist, requested_specialist: input.requested_specialist ?? input.specialist, resolved_specialist: resolvedSpecialist, model, duration_ms: durationMs, trace_id: traceId } };
    }

    const lastAttempt = attempts.at(-1);
    const durationMs = Date.now() - startedAt;
    const observability = openObservabilityClient(options);
    if (input.trace !== false && observability) writeTraceRow(observability, resolvedSpecialist, modelCandidates.at(-1) ?? 'unknown', traceId, lastAttempt?.text ?? '', durationMs, skillSources, options.onAuditFailure);
    return { success: false, error: lastAttempt?.stderr || 'pi produced no assistant text', error_type: 'internal', meta: { specialist: resolvedSpecialist, requested_specialist: input.requested_specialist ?? input.specialist, resolved_specialist: resolvedSpecialist, model: modelCandidates.at(-1) ?? 'unknown', duration_ms: durationMs, trace_id: traceId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const resolvedSpecialist = resolveScriptSpecialistName(input.specialist);
    return { success: false, error: message, error_type: mapErrorType(message), meta: { specialist: resolvedSpecialist, requested_specialist: input.requested_specialist ?? input.specialist, resolved_specialist: resolvedSpecialist, duration_ms: Date.now() - startedAt, trace_id: traceId } };
  }
}

export function collectModelCandidates(input: ScriptGenerateRequest, spec: Specialist, options: ScriptRunnerOptions): string[] {
  const executionChain = resolveModelChain(spec.specialist.execution);
  const candidates = [input.model_override, ...executionChain, options.fallbackModel]
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  return [...new Set(candidates)];
}

type AttemptFailureReason = 'assistant_text_too_large' | 'stderr_too_large' | 'malformed_line_too_large';

function runSingleAttempt(prompt: string, model: string, thinkingLevel: string | undefined, timeoutMs: number, assistantTextLimitBytes: number, options: ScriptRunnerOptions, systemPrompt?: string, systemPromptMode?: 'append' | 'replace', skillPaths: string[] = []): Promise<{ model: string; text: string; stderr: string; exitCode: number; timedOut: boolean; outputTooLarge: boolean; outputTooLargeReason?: AttemptFailureReason }> {
  return new Promise((resolve, reject) => {
    const args = ['--mode', 'json', '--no-session', '--no-extensions', '--no-tools', '--offline', '--no-context-files', '--no-prompt-templates', '--no-themes'];
    if (skillPaths.length === 0) args.push('--no-skills');
    for (const skillPath of skillPaths) args.push('--skill', skillPath);
    args.push('--model', model);
    if (thinkingLevel) args.push('--thinking', thinkingLevel);
    if (systemPrompt) args.push(systemPromptMode === 'append' ? '--append-system-prompt' : '--system-prompt', systemPrompt);

    const pi = spawn('pi', args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: options.projectDir ?? process.cwd() });
    options.onChild?.(pi);
    pi.stdin?.on('error', () => {
      // The child close/error handlers report Pi failures. Swallow stdin EPIPE-style
      // races so failed children do not crash the orchestrator process.
    });
    pi.stdin?.write(prompt);
    pi.stdin?.end();

    let stderr = '';
    let timedOut = false;
    let outputTooLarge = false;
    let outputTooLargeReason: AttemptFailureReason | undefined;
    let pending = '';
    let assistantText = '';
    let pendingBytes = 0;
    let stderrBytes = 0;

    const timer = setTimeout(() => {
      timedOut = true;
      pi.kill('SIGTERM');
      setTimeout(() => pi.kill('SIGKILL'), 2000);
    }, timeoutMs);

    pi.stdout.on('data', chunk => {
      if (outputTooLarge) return;
      const buffer = Buffer.from(chunk);
      pending += buffer.toString('utf-8');
      pendingBytes += buffer.length;
      if (pendingBytes > DEFAULT_PENDING_LINE_LIMIT_BYTES) {
        outputTooLarge = true;
        outputTooLargeReason = 'malformed_line_too_large';
        pi.kill('SIGTERM');
        setTimeout(() => pi.kill('SIGKILL'), 2000);
        return;
      }

      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      pendingBytes = Buffer.byteLength(pending);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
          const event = JSON.parse(line) as PiEvent;
          const nextAssistantText = extractAssistantTextFromEvent(event);
          if (nextAssistantText !== undefined) {
            if (Buffer.byteLength(nextAssistantText, 'utf8') > assistantTextLimitBytes) {
              outputTooLarge = true;
              outputTooLargeReason = 'assistant_text_too_large';
              pi.kill('SIGTERM');
              setTimeout(() => pi.kill('SIGKILL'), 2000);
              return;
            }
            assistantText = nextAssistantText;
          }
        } catch {
          continue;
        }
      }
    });
    pi.stderr.on('data', chunk => {
      if (outputTooLarge) return;
      const text = String(chunk);
      stderr += text;
      stderrBytes += Buffer.byteLength(text, 'utf8');
      if (stderrBytes > DEFAULT_STDERR_LIMIT_BYTES) {
        outputTooLarge = true;
        outputTooLargeReason = 'stderr_too_large';
        stderr = stderr.slice(0, DEFAULT_STDERR_LIMIT_BYTES);
        pi.kill('SIGTERM');
        setTimeout(() => pi.kill('SIGKILL'), 2000);
      }
    });

    pi.on('error', reject);
    pi.on('close', code => {
      clearTimeout(timer);
      resolve({
        model,
        text: assistantText,
        stderr,
        exitCode: code ?? 0,
        timedOut,
        outputTooLarge,
        outputTooLargeReason,
      });
    });
  });
}

export function classifyAttempt(attempt: { text: string; stderr: string; exitCode: number; timedOut: boolean; outputTooLarge: boolean; outputTooLargeReason?: AttemptFailureReason }): { retryable: boolean; kind: 'success' | 'failure'; error: string; errorType: ScriptSpecialistErrorType; text: string } {
  if (attempt.outputTooLarge) {
    if (attempt.outputTooLargeReason === 'assistant_text_too_large') return { retryable: false, kind: 'failure', error: 'assistant message too large', errorType: 'output_too_large', text: attempt.text };
    if (attempt.outputTooLargeReason === 'stderr_too_large') return { retryable: false, kind: 'failure', error: 'stderr too large', errorType: 'output_too_large', text: attempt.text };
    if (attempt.outputTooLargeReason === 'malformed_line_too_large') return { retryable: false, kind: 'failure', error: 'malformed line too large', errorType: 'output_too_large', text: attempt.text };
    return { retryable: false, kind: 'failure', error: 'output exceeded cap', errorType: 'output_too_large', text: attempt.text };
  }
  if (attempt.timedOut) return { retryable: false, kind: 'failure', error: attempt.stderr || 'timed out', errorType: 'timeout', text: attempt.text };
  const retryable = isRetryableModelFailure(attempt.stderr, attempt.text);
  if (attempt.exitCode !== 0) {
    const errorType = mapErrorType(attempt.stderr);
    return { retryable, kind: 'failure', error: attempt.stderr || `pi exit ${attempt.exitCode}`, errorType, text: attempt.text };
  }
  if (!attempt.text) {
    return { retryable, kind: 'failure', error: attempt.stderr || 'pi produced no assistant text', errorType: mapErrorType(attempt.stderr), text: attempt.text };
  }
  return { retryable: false, kind: 'success', error: '', errorType: 'internal', text: attempt.text };
}

export function isRetryableModelFailure(stderr: string, text: string): boolean {
  return stderr.includes('0 tokens') || stderr.includes('quota') || stderr.includes('rate limit') || stderr.includes('403') || stderr.includes('401') || stderr.includes('insufficient_quota') || (!text && !stderr.trim());
}
