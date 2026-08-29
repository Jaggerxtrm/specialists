import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { PiAgentSession, applyExtensionToolPolicyGate, resolveExecutionExtensionSelection, resolveRuntimeToolContract } from '../pi/session.js';
import { getReadLineNumbersExtensionPath } from '../pi/read-line-numbers-extension.js';
import { SpecialistLoader } from './loader.js';
import { buildMandatoryRulesInjection } from './mandatory-rules.js';
import { resolveModelChain } from './model-chain.js';
import { ensureObservabilityDbFile, resolveObservabilityDbLocation } from './observability-db.js';
import { createObservabilitySqliteClient, createObservabilitySqliteClientAtPath } from './observability-sqlite.js';
import { formatScriptOutput, runScript, validateBeforeRun } from './runner.js';
import type { ScriptEntry, Specialist } from './schema.js';
import type { SupervisorStatus } from './supervisor.js';
import { formatResolvedToolContract, type ResolvedToolContract } from './resolved-tool-contract.js';
import { renderTemplate } from './templateEngine.js';
import {
  createFinishReasonEvent,
  createMetaEvent,
  createRunCompleteEvent,
  createRunStartEvent,
  createTokenUsageEvent,
  createTurnSummaryEvent,
  mapCallbackEventToTimelineEvent,
  type TimelineEvent,
} from './timeline-events.js';

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
  template_field?: string;
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
  allowWriteCapable?: boolean;
  baseDir?: string;
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
  surface?: 'script' | 'serve';
}

function normalizePath(path: string, baseDir?: string): string {
  if (isAbsolute(path)) return path;
  return resolve(baseDir ?? process.cwd(), path);
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const candidate = resolve(candidatePath);
  const root = resolve(rootPath);
  const rel = relative(root, candidate);
  return rel === '' || (rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel));
}

function assertSkillPathWithinRoots(field: 'skills.paths' | 'prompt.skill_inherit', path: string, roots: string[], baseDir?: string): void {
  const candidate = normalizePath(path, baseDir);
  const allowed = roots.some((root) => isPathWithinRoot(candidate, root));
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
  if (execution.permission_required !== 'READ_ONLY' && !trust?.allowWriteCapable) {
    throw new CompatGuardError('execution.permission_required', 'permission_required must be READ_ONLY unless trusted local script mode is enabled');
  }

  const hasScripts = (spec.specialist.skills?.scripts?.length ?? 0) > 0;
  if (hasScripts && !trust?.allowLocalScripts) {
    throw new CompatGuardError('skills.scripts', 'local scripts are not supported in this script surface');
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
    for (const path of paths) assertSkillPathWithinRoots('skills.paths', path, trust.allowSkillsRoots, trust.baseDir);
    if (typeof spec.specialist.prompt.skill_inherit === 'string') {
      assertSkillPathWithinRoots('prompt.skill_inherit', spec.specialist.prompt.skill_inherit, trust.allowSkillsRoots, trust.baseDir);
    }
  }
}

function collectSkillPathEntries(spec: Specialist, baseDir?: string): Array<{ path: string; source: SkillSource['source'] }> {
  return [
    ...(spec.specialist.skills?.paths ?? []).map((path) => ({ path: normalizePath(path, baseDir), source: 'skills.paths' as const })),
    ...(typeof spec.specialist.prompt.skill_inherit === 'string'
      ? [{ path: normalizePath(spec.specialist.prompt.skill_inherit, baseDir), source: 'prompt.skill_inherit' as const }]
      : []),
  ];
}

function collectSkillPaths(spec: Specialist, baseDir?: string): string[] {
  return collectSkillPathEntries(spec, baseDir).map((entry) => entry.path);
}

export function computeSkillSources(spec: Specialist, baseDir?: string): SkillSource[] {
  const entries = collectSkillPathEntries(spec, baseDir);
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
  const normalizedMessage = message.toLowerCase();
  if (message.includes('Specialist not found')) return 'specialist_not_found';
  if (normalizedMessage.includes('interactive') || normalizedMessage.includes('worktree') || normalizedMessage.includes('permission_required') || normalizedMessage.includes('scripts not allowed')) return 'specialist_load_error';
  if (message.includes('Missing template variable')) return 'template_variable_missing';
  if (normalizedMessage.includes('prompt too large')) return 'prompt_too_large';
  if (normalizedMessage.includes('output too large')) return 'output_too_large';
  if (isAuthFailureMessage(normalizedMessage)) return 'auth';
  if (normalizedMessage.includes('quota') || normalizedMessage.includes('rate limit') || normalizedMessage.includes('out of extra usage') || normalizedMessage.includes('insufficient_quota') || normalizedMessage.includes('429')) return 'quota';
  if (normalizedMessage.includes('timeout')) return 'timeout';
  if (normalizedMessage.includes('network') || message.includes('ECONN')) return 'network';
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

function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  const wholeFenced = trimmed.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (wholeFenced) return wholeFenced[1].trim();

  const fencedBlocks = [...trimmed.matchAll(/```(?:json|JSON)\s*\n([\s\S]*?)\n```/g)];
  if (fencedBlocks.length === 1) return fencedBlocks[0][1].trim();

  return trimmed;
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

type ScriptObservabilityClient = ReturnType<typeof createObservabilitySqliteClient>;
type ScriptTimelineAppender = (event: TimelineEvent | null) => void;

function appendScriptEvent(client: ScriptObservabilityClient, options: {
  traceId: string;
  specialist: string;
  event: TimelineEvent | null;
  onAuditFailure?: (error: unknown) => void;
}): void {
  if (!client || !options.event) return;
  try {
    client.appendEvent(options.traceId, options.specialist, undefined, options.event);
  } catch (error: unknown) {
    options.onAuditFailure?.(error);
  }
}

function createScriptTimelineAppender(client: ScriptObservabilityClient, options: {
  traceId: string;
  specialist: string;
  onAuditFailure?: (error: unknown) => void;
}): ScriptTimelineAppender | undefined {
  if (!client) return undefined;
  return (event) => appendScriptEvent(client, { ...options, event });
}

function deriveBackendFromModel(model: string): string | undefined {
  return model.includes('/') ? model.split('/')[0] : undefined;
}

function buildScriptStatus(options: {
  traceId: string;
  specialist: string;
  model: string;
  startedAtMs: number;
  status: 'running' | 'done' | 'error';
  outputType?: string;
  error?: string;
  errorType?: ScriptSpecialistErrorType;
  parsedJson?: unknown;
  outputSizeBytes?: number;
  skillSources?: SkillSource[];
  variablesKeys?: string[];
  skillPaths?: string[];
}): SupervisorStatus {
  const backend = deriveBackendFromModel(options.model);
  return {
    id: options.traceId,
    specialist: options.specialist,
    status: options.status,
    model: options.model,
    ...(backend ? { backend } : {}),
    ...(options.outputType ? { output_type: options.outputType } : {}),
    started_at_ms: options.startedAtMs,
    elapsed_s: Math.max(0, (Date.now() - options.startedAtMs) / 1000),
    last_event_at_ms: Date.now(),
    trace_id: options.traceId,
    ...(options.error ? { error: options.error } : {}),
    startup_context: {
      job_id: options.traceId,
      specialist_name: options.specialist,
      variables_keys: options.variablesKeys ?? [],
      ...(options.skillPaths ? { skills: { count: options.skillPaths.length, activated: options.skillPaths } } : {}),
    },
    surface: 'script_specialist',
    ...(options.skillSources && options.skillSources.length > 0 ? { skill_sources: options.skillSources } : {}),
    ...(options.errorType ? { error_type: options.errorType } : {}),
    ...(options.parsedJson !== undefined ? { parsed_json: options.parsedJson } : {}),
    ...(options.outputSizeBytes !== undefined ? { output_size_bytes: options.outputSizeBytes } : {}),
  } as unknown as SupervisorStatus;
}

function persistScriptStart(client: ScriptObservabilityClient, options: {
  traceId: string;
  specialist: string;
  model: string;
  startedAtMs: number;
  outputType?: string;
  skillSources?: SkillSource[];
  variablesKeys?: string[];
  skillPaths?: string[];
  onAuditFailure?: (error: unknown) => void;
}): void {
  if (!client) return;
  try {
    const status = buildScriptStatus({
      traceId: options.traceId,
      specialist: options.specialist,
      model: options.model,
      startedAtMs: options.startedAtMs,
      status: 'running',
      outputType: options.outputType,
      skillSources: options.skillSources,
      variablesKeys: options.variablesKeys,
      skillPaths: options.skillPaths,
    });
    client.upsertStatusWithEvent(status, createRunStartEvent(options.specialist, undefined, status.startup_context));
    const backend = deriveBackendFromModel(options.model);
    if (backend) client.appendEvent(options.traceId, options.specialist, undefined, createMetaEvent(options.model, backend));
  } catch (error: unknown) {
    options.onAuditFailure?.(error);
  }
}

function persistScriptTerminal(client: ScriptObservabilityClient, options: {
  traceId: string;
  specialist: string;
  model: string;
  startedAtMs: number;
  finalStatus: 'done' | 'error';
  outputType?: string;
  output: string;
  error?: string;
  errorType?: ScriptSpecialistErrorType;
  parsedJson?: unknown;
  skillSources?: SkillSource[];
  variablesKeys?: string[];
  skillPaths?: string[];
  onAuditFailure?: (error: unknown) => void;
}): void {
  if (!client) return;
  try {
    const status = buildScriptStatus({
      traceId: options.traceId,
      specialist: options.specialist,
      model: options.model,
      startedAtMs: options.startedAtMs,
      status: options.finalStatus,
      outputType: options.outputType,
      error: options.error,
      errorType: options.errorType,
      parsedJson: options.parsedJson,
      outputSizeBytes: Buffer.byteLength(options.output, 'utf8'),
      skillSources: options.skillSources,
      variablesKeys: options.variablesKeys,
      skillPaths: options.skillPaths,
    });
    const backend = deriveBackendFromModel(options.model);
    const runComplete = createRunCompleteEvent(
      options.finalStatus === 'done' ? 'COMPLETE' : 'ERROR',
      Math.max(0, Math.round((Date.now() - options.startedAtMs) / 1000)),
      {
        model: options.model,
        ...(backend ? { backend } : {}),
        ...(options.error ? { error: options.error } : {}),
        output: options.output,
      },
    );
    client.upsertStatusWithEventAndResult(status, runComplete, options.output);
  } catch (error: unknown) {
    options.onAuditFailure?.(error);
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

function openObservabilityClient(options: ScriptRunnerOptions): ScriptObservabilityClient {
  if (options.observabilityDbPath) return createObservabilitySqliteClientAtPath(options.observabilityDbPath);
  const projectDir = options.projectDir ?? process.cwd();
  try {
    const location = resolveObservabilityDbLocation(projectDir);
    ensureObservabilityDbFile(location);
    return createObservabilitySqliteClientAtPath(location.dbPath);
  } catch {
    return null;
  }
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

function outputSatisfiesJsonContract(text: string, requiredKeys: string[]): boolean {
  try {
    const parsed = JSON.parse(extractJsonPayload(text));
    return requiredKeys.every((key) => parsed !== null && typeof parsed === 'object' && key in parsed);
  } catch {
    return false;
  }
}

function containsToolCallMarkup(text: string): boolean {
  return /<\|tool_calls_section_(?:begin|end)\|>|<\|tool_call_(?:begin|argument_begin|end)\|>/.test(text);
}

function preferAssistantText(options: {
  rpcText: string;
  streamedText: string;
  requiredJsonKeys: string[];
}): string {
  const rpcText = options.rpcText.trim();
  const streamedText = options.streamedText.trim();
  if (!streamedText) return rpcText;
  if (!rpcText) return streamedText;

  const rpcHasMarkup = containsToolCallMarkup(rpcText);
  const streamedHasMarkup = containsToolCallMarkup(streamedText);
  if (rpcHasMarkup && !streamedHasMarkup) return streamedText;

  if (options.requiredJsonKeys.length > 0) {
    const rpcValid = outputSatisfiesJsonContract(rpcText, options.requiredJsonKeys);
    const streamedValid = outputSatisfiesJsonContract(streamedText, options.requiredJsonKeys);
    if (!rpcValid && streamedValid) return streamedText;
  }

  return rpcText;
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

type LocalScriptEntry = ScriptEntry & { path?: string };

function getLocalScripts(spec: Specialist): LocalScriptEntry[] {
  return spec.specialist.skills?.scripts ?? [];
}

function getLocalScriptCommand(script: LocalScriptEntry): string | undefined {
  return script.run || script.path;
}

function buildValidationSpec(spec: Specialist, scripts: LocalScriptEntry[]) {
  return {
    specialist: {
      skills: {
        paths: spec.specialist.skills?.paths,
        scripts,
      },
      capabilities: spec.specialist.capabilities,
    },
  };
}

function resolveRequestedTemplate(input: ScriptGenerateRequest, spec: Specialist): string {
  if (input.template !== undefined && input.template_field !== undefined) {
    throw new Error('template and template_field are mutually exclusive');
  }

  if (input.template_field !== undefined) {
    const candidate = (spec.specialist.prompt as Record<string, unknown>)[input.template_field];
    if (typeof candidate !== 'string' || candidate.length === 0) {
      throw new Error(`template field not found or not a string: spec.prompt.${input.template_field}`);
    }
    return candidate;
  }

  const template = input.template ?? spec.specialist.prompt.task_template;
  if (input.template !== undefined) {
    const misusedField = detectTemplateFieldMisuse(input.template, spec.specialist.prompt as Record<string, unknown>);
    if (misusedField !== null) {
      throw new Error(
        `template field misuse: input.template equals spec.prompt.${misusedField} key name (${input.template.length} chars). ` +
        `The 'template' input field expects the literal template body, not a spec key. ` +
        `To use a named template field, pass template_field=${misusedField}; ` +
        `to use the spec's default, omit both fields; to use a non-default template body, pass its full text inline.`,
      );
    }
  }
  return template;
}

export async function runScriptSpecialist(input: ScriptGenerateRequest, options: ScriptRunnerOptions): Promise<ScriptGenerateResult> {
  const traceId = randomUUID();
  const startedAt = Date.now();
  try {
    const resolvedSpecialist = resolveScriptSpecialistName(input.specialist);
    const spec = await options.loader.get(resolvedSpecialist);
    const baseDir = options.projectDir ?? options.trust?.baseDir ?? process.cwd();
    const trust = { ...options.trust, baseDir };
    compatGuard(spec, trust);
    const skillPaths = trust.allowSkills ? collectSkillPaths(spec, baseDir) : [];
    const skillSources = trust.allowSkills ? computeSkillSources(spec, baseDir) : undefined;
    const permissionLevel = spec.specialist.execution.permission_required;
    const specialistName = spec.specialist.metadata?.name ?? resolvedSpecialist;
    const specialistPermissions = spec.specialist.permissions;
    const extensionSelection = resolveExecutionExtensionSelection(spec.specialist.execution.extensions);
    const resolvedToolContract = resolveRuntimeToolContract({
      level: permissionLevel,
      specialistName,
      specialistPermissions,
      excludeExtensions: extensionSelection.excludeExtensions,
      extensionSources: extensionSelection.extensionSources,
    });
    const resolvedToolContractBlock = resolvedToolContract ? formatResolvedToolContract(resolvedToolContract) : '';

    const localScripts = getLocalScripts(spec);
    validateBeforeRun(buildValidationSpec(spec, localScripts), permissionLevel, resolvedToolContract);
    const executableScripts = trust.allowLocalScripts ? localScripts : [];
    const preScripts = executableScripts.filter((script) => script.phase === 'pre');
    const postScripts = executableScripts.filter((script) => script.phase === 'post');
    const runPostScripts = (): void => {
      for (const script of postScripts) runScript(getLocalScriptCommand(script), baseDir);
    };
    const preScriptOutput = formatScriptOutput(
      preScripts
        .map((script) => runScript(getLocalScriptCommand(script), baseDir))
        .filter((_, index) => preScripts[index].inject_output),
    );

    let template: string;
    try {
      template = resolveRequestedTemplate(input, spec);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const modelCandidates = collectModelCandidates(input, spec, options);
      return {
        success: false,
        error: message,
        error_type: message.startsWith('template field misuse:') ? 'template_field_misuse' : 'specialist_load_error',
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

    const variables = {
      cwd: baseDir,
      bead_id: '',
      pre_script_output: preScriptOutput,
      ...(input.variables ?? {}),
      ...(resolvedToolContractBlock ? { resolved_tool_contract: resolvedToolContractBlock } : {}),
    };
    let prompt = applyOutputContract(renderTaskTemplate(template, variables), spec);
    if (!spec.specialist.execution.bare) {
      try {
        const mandatoryRulesBlock = buildMandatoryRulesInjection({ cwd: baseDir, specialist: spec.specialist }).block;
        if (mandatoryRulesBlock.trim()) prompt = `${prompt}\n\n${mandatoryRulesBlock}`;
      } catch (error) {
        console.warn(`[script-runner] Skipping MANDATORY_RULES injection: ${String(error)}`);
      }
    }

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
    const expectedKeys = collectRequiredOutputKeys(spec);
    const shouldParseJson = spec.specialist.execution.response_format === 'json' || expectedKeys.length > 0;
    const observability = input.trace !== false ? openObservabilityClient(options) : null;
    const scriptRunStartedAt = Date.now();
    if (observability) {
      persistScriptStart(observability, {
        traceId,
        specialist: resolvedSpecialist,
        model: modelCandidates[0] ?? 'unknown',
        startedAtMs: scriptRunStartedAt,
        outputType: spec.specialist.execution.output_type,
        skillSources,
        variablesKeys: Object.keys(input.variables ?? {}),
        skillPaths,
        onAuditFailure: options.onAuditFailure,
      });
    }
    const appendTimelineEvent = createScriptTimelineAppender(observability, {
      traceId,
      specialist: resolvedSpecialist,
      onAuditFailure: options.onAuditFailure,
    });
    let terminalPersisted = false;
    let cleanupExitHandler: (() => void) | undefined;
    const persistTerminalOnce = (terminal: Parameters<typeof persistScriptTerminal>[1]): void => {
      if (terminalPersisted) return;
      terminalPersisted = true;
      cleanupExitHandler?.();
      persistScriptTerminal(observability, terminal);
    };
    if (observability) {
      const handleExit = (): void => {
        if (terminalPersisted) return;
        terminalPersisted = true;
        persistScriptTerminal(observability, {
          traceId,
          specialist: resolvedSpecialist,
          model: modelCandidates[0] ?? 'unknown',
          startedAtMs: scriptRunStartedAt,
          finalStatus: 'error',
          outputType: spec.specialist.execution.output_type,
          output: 'script-specialist interrupted before terminal result',
          error: 'script-specialist interrupted before terminal result',
          errorType: 'internal',
          skillSources,
          variablesKeys: Object.keys(input.variables ?? {}),
          skillPaths,
          onAuditFailure: options.onAuditFailure,
        });
      };
      process.once('exit', handleExit);
      cleanupExitHandler = () => process.off('exit', handleExit);
    }
    const attempts: Array<{ model: string; text: string; stderr: string }> = [];

    for (const model of modelCandidates) {
      const systemPrompt = spec.specialist.prompt.system || undefined;
      const systemPromptMode = spec.specialist.prompt.system_prompt_mode;
      let attempt: { model: string; text: string; stderr: string; exitCode: number; timedOut: boolean; outputTooLarge: boolean; outputTooLargeReason?: AttemptFailureReason };
      try {
        attempt = await runSingleAttempt(prompt, model, input.thinking_level ?? spec.specialist.execution.thinking_level, timeoutMs, assistantTextLimitBytes, options, spec, systemPrompt, systemPromptMode, skillPaths, shouldParseJson ? expectedKeys : [], resolvedToolContract, appendTimelineEvent);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        persistTerminalOnce({
          traceId,
          specialist: resolvedSpecialist,
          model,
          startedAtMs: scriptRunStartedAt,
          finalStatus: 'error',
          outputType: spec.specialist.execution.output_type,
          output: message,
          error: message,
          errorType: mapErrorType(message),
          skillSources,
          variablesKeys: Object.keys(input.variables ?? {}),
          skillPaths,
          onAuditFailure: options.onAuditFailure,
        });
        throw error;
      }
      attempts.push(attempt);
      const parsed = classifyAttempt(attempt);
      if (parsed.retryable && parsed.errorType !== 'auth') continue;

      const durationMs = Date.now() - startedAt;

      if (parsed.kind === 'success') {
        let parsed_json: unknown;
        if (shouldParseJson) {
          try {
            parsed_json = JSON.parse(extractJsonPayload(parsed.text));
            for (const key of expectedKeys) {
              if (parsed_json === null || typeof parsed_json !== 'object' || !(key in parsed_json)) throw new Error(`Missing required output field: ${key}`);
            }
          } catch (error) {
            if (observability) {
              persistTerminalOnce({
                traceId,
                specialist: resolvedSpecialist,
                model,
                startedAtMs: scriptRunStartedAt,
                finalStatus: 'error',
                outputType: spec.specialist.execution.output_type,
                output: parsed.text || (error instanceof Error ? error.message : String(error)),
                error: error instanceof Error ? error.message : String(error),
                errorType: 'invalid_json',
                skillSources,
                variablesKeys: Object.keys(input.variables ?? {}),
                skillPaths,
                onAuditFailure: options.onAuditFailure,
              });
            }
            runPostScripts();
            return { success: false, error: error instanceof Error ? error.message : String(error), error_type: 'invalid_json', meta: { specialist: resolvedSpecialist, requested_specialist: input.requested_specialist ?? input.specialist, resolved_specialist: resolvedSpecialist, model, duration_ms: durationMs, trace_id: traceId } };
          }
        }
        if (observability) {
          persistTerminalOnce({
            traceId,
            specialist: resolvedSpecialist,
            model,
            startedAtMs: scriptRunStartedAt,
            finalStatus: 'done',
            outputType: spec.specialist.execution.output_type,
            output: parsed.text,
            parsedJson: parsed_json,
            skillSources,
            variablesKeys: Object.keys(input.variables ?? {}),
            skillPaths,
            onAuditFailure: options.onAuditFailure,
          });
        }
        runPostScripts();
        return { success: true, output: parsed.text, parsed_json, meta: { specialist: resolvedSpecialist, requested_specialist: input.requested_specialist ?? input.specialist, resolved_specialist: resolvedSpecialist, model, duration_ms: durationMs, trace_id: traceId } };
      }
      if (observability) {
        persistTerminalOnce({
          traceId,
          specialist: resolvedSpecialist,
          model,
          startedAtMs: scriptRunStartedAt,
          finalStatus: 'error',
          outputType: spec.specialist.execution.output_type,
          output: parsed.text || parsed.error,
          error: parsed.error,
          errorType: parsed.errorType,
          skillSources,
          variablesKeys: Object.keys(input.variables ?? {}),
          skillPaths,
          onAuditFailure: options.onAuditFailure,
        });
      }
      runPostScripts();
      return { success: false, error: parsed.error, error_type: parsed.errorType, meta: { specialist: resolvedSpecialist, requested_specialist: input.requested_specialist ?? input.specialist, resolved_specialist: resolvedSpecialist, model, duration_ms: durationMs, trace_id: traceId } };
    }

    const lastAttempt = attempts.at(-1);
    const durationMs = Date.now() - startedAt;
    if (observability) {
      persistTerminalOnce({
        traceId,
        specialist: resolvedSpecialist,
        model: modelCandidates.at(-1) ?? 'unknown',
        startedAtMs: scriptRunStartedAt,
        finalStatus: 'error',
        outputType: spec.specialist.execution.output_type,
        output: lastAttempt?.text || lastAttempt?.stderr || 'pi produced no assistant text',
        error: lastAttempt?.stderr || 'pi produced no assistant text',
        errorType: 'internal',
        skillSources,
        variablesKeys: Object.keys(input.variables ?? {}),
        skillPaths,
        onAuditFailure: options.onAuditFailure,
      });
    }
    runPostScripts();
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

function appendExtensionArgs(
  args: string[],
  spec: Specialist,
  resolvedToolContract?: ResolvedToolContract,
  extensionSources: readonly string[] = [],
): void {
  const permissionLevel = spec.specialist.execution.permission_required.toUpperCase();
  // Always-on: numbered read output. Safe for every permission level.
  const readLineNumbersPath = getReadLineNumbersExtensionPath();
  if (readLineNumbersPath) args.push('-e', readLineNumbersPath);
  const piExtDir = join(homedir(), '.pi', 'agent', 'extensions');
  if (permissionLevel !== 'READ_ONLY') {
    const qualityGatesPath = join(piExtDir, 'quality-gates');
    if (existsSync(qualityGatesPath)) args.push('-e', qualityGatesPath);
  }

  const cavemanPath = join(piExtDir, 'caveman');
  if (existsSync(cavemanPath)) args.push('-e', cavemanPath);

  const gitnexusContract = resolvedToolContract?.extensions.gitnexus;
  if (gitnexusContract?.status === 'available' && gitnexusContract.packagePath && existsSync(gitnexusContract.packagePath)) {
    args.push('-e', gitnexusContract.packagePath);
  }
  for (const source of extensionSources) {
    args.push('-e', source);
  }
}

async function runSingleAttempt(
  prompt: string,
  model: string,
  thinkingLevel: string | undefined,
  timeoutMs: number,
  assistantTextLimitBytes: number,
  options: ScriptRunnerOptions,
  spec: Specialist,
  systemPrompt?: string,
  systemPromptMode?: 'append' | 'replace',
  skillPaths: string[] = [],
  requiredJsonKeys: string[] = [],
  resolvedToolContract?: ResolvedToolContract,
  appendTimelineEvent?: ScriptTimelineAppender,
): Promise<{ model: string; text: string; stderr: string; exitCode: number; timedOut: boolean; outputTooLarge: boolean; outputTooLargeReason?: AttemptFailureReason }> {
  const extensionSelection = resolveExecutionExtensionSelection(spec.specialist.execution.extensions);

  if (options.surface === 'script' && spec.specialist.execution.permission_required !== 'READ_ONLY') {
    const session = await PiAgentSession.create({
      model,
      systemPrompt,
      systemPromptMode,
      permissionLevel: spec.specialist.execution.permission_required,
      specialistName: spec.specialist.metadata?.name,
      specialistPermissions: spec.specialist.permissions,
      skillPaths,
      thinkingLevel,
      cwd: options.projectDir ?? process.cwd(),
      stallTimeoutMs: spec.specialist.execution.stall_timeout_ms ?? timeoutMs,
      ...(extensionSelection.excludeExtensions.length > 0 ? { excludeExtensions: extensionSelection.excludeExtensions } : {}),
      ...(extensionSelection.extensionSources.length > 0 ? { extensionSources: extensionSelection.extensionSources } : {}),
      ...(extensionSelection.offline === false ? { offline: false } : {}),
      resolvedToolContract,
      onToken: (delta) => {
        recordAssistantDelta(delta);
        appendTimelineEvent?.({ t: Date.now(), type: 'text', char_count: delta.length });
      },
      onThinking: (delta) => appendTimelineEvent?.({ t: Date.now(), type: 'thinking', char_count: delta.length }),
      onToolStart: (tool, args, toolCallId) => appendTimelineEvent?.(mapCallbackEventToTimelineEvent('tool_execution_start', { tool, args, toolCallId })),
      onToolEnd: (tool, isError, toolCallId, resultContent, resultRaw) => appendTimelineEvent?.(mapCallbackEventToTimelineEvent('tool_execution_end', { tool, isError, toolCallId, resultContent, resultRaw })),
      onEvent: (type, details) => {
        if (type === 'message_start_assistant') markAssistantMessageStart();
        if (type === 'message_end_assistant') markAssistantMessageEnd();
        appendTimelineEvent?.(mapCallbackEventToTimelineEvent(type, {
          charCount: details?.charCount,
          toolCallId: details?.toolCallId,
          compaction: details,
          retry: details,
          modelChange: details?.action ? { action: details.action, model: details.model, previousModel: details.previousModel } : undefined,
          extensionError: details,
        }));
      },
      onMetric: (event) => {
        if (event.type === 'token_usage') appendTimelineEvent?.(createTokenUsageEvent(event.token_usage, event.source));
        if (event.type === 'finish_reason') appendTimelineEvent?.(createFinishReasonEvent(event.finish_reason, event.source));
        if (event.type === 'turn_summary') appendTimelineEvent?.(createTurnSummaryEvent(event.turn_index, event.token_usage, event.finish_reason));
        if (event.type === 'api_error') appendTimelineEvent?.(mapCallbackEventToTimelineEvent('api_error', { apiError: event }));
        if (event.type === 'compaction') appendTimelineEvent?.(mapCallbackEventToTimelineEvent(event.phase === 'start' ? 'auto_compaction_start' : 'auto_compaction_end', { compaction: event }));
        if (event.type === 'retry') appendTimelineEvent?.(mapCallbackEventToTimelineEvent(event.phase === 'start' ? 'auto_retry_start' : 'auto_retry_end', { retry: event }));
        if (event.type === 'extension_error') appendTimelineEvent?.(mapCallbackEventToTimelineEvent('extension_error', { extensionError: event }));
      },
      onMeta: (meta) => appendTimelineEvent?.(createMetaEvent(meta.model, meta.backend)),
    });

    let assistantText = '';
    let stderr = '';
    let timedOut = false;
    let outputTooLarge = false;
    let outputTooLargeReason: AttemptFailureReason | undefined;
    let currentAssistantMessage = '';
    let lastCompletedAssistantMessage = '';

    const markAssistantMessageStart = (): void => {
      currentAssistantMessage = '';
    };
    const markAssistantMessageEnd = (): void => {
      if (currentAssistantMessage.trim()) lastCompletedAssistantMessage = currentAssistantMessage;
      currentAssistantMessage = '';
    };
    const recordAssistantDelta = (delta: string): void => {
      if (!delta) return;
      currentAssistantMessage += delta;
    };
    const resolveAssistantText = async (): Promise<string> => {
      const rpcText = await session.getLastOutput();
      return preferAssistantText({
        rpcText,
        streamedText: lastCompletedAssistantMessage,
        requiredJsonKeys,
      });
    };

    try {
      await session.start();
      await session.prompt(prompt);
      await session.waitForDone(timeoutMs);
      assistantText = await resolveAssistantText();
      stderr = session.getStderr();

      if (requiredJsonKeys.length > 0 && !outputSatisfiesJsonContract(assistantText, requiredJsonKeys)) {
        const repairPrompt = [
          'Return FINAL answer now as JSON only.',
          `Required top-level keys: ${requiredJsonKeys.join(', ')}.`,
          'No prose. No markdown fences. No tool-call markup. No preamble or commentary.',
          'Use work already completed in this session. Do not restart from scratch. Avoid more tools unless strictly necessary.',
        ].join(' ');
        markAssistantMessageStart();
        await session.resume(repairPrompt, timeoutMs);
        assistantText = await resolveAssistantText();
        stderr = session.getStderr();
      }

      if (Buffer.byteLength(assistantText, 'utf8') > assistantTextLimitBytes) {
        outputTooLarge = true;
        outputTooLargeReason = 'assistant_text_too_large';
      }
      return {
        model,
        text: assistantText,
        stderr,
        exitCode: 0,
        timedOut,
        outputTooLarge,
        outputTooLargeReason,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      timedOut = message.toLowerCase().includes('timed out');
      if (timedOut) session.kill(error instanceof Error ? error : new Error(message));
      assistantText = await session.getLastOutput().catch(() => '');
      stderr = session.getStderr() || message;
      return {
        model,
        text: assistantText,
        stderr,
        exitCode: 1,
        timedOut,
        outputTooLarge,
        outputTooLargeReason,
      };
    } finally {
      await session.close().catch(() => undefined);
    }
  }

  return await new Promise((resolve, reject) => {
    const args = ['--mode', 'json', '--no-session', '--no-extensions', '--no-skills'];
    if (extensionSelection.offline !== false) args.push('--offline');
    args.push('--no-context-files', '--no-prompt-templates', '--no-themes');
    const toolsFlag = resolvedToolContract?.toolsFlag;
    if (toolsFlag && resolvedToolContract.exposedExtensionSources.length === 0) args.push('--tools', toolsFlag);
    for (const skillPath of skillPaths) args.push('--skill', skillPath);
    args.push('--model', model);
    if (thinkingLevel) args.push('--thinking', thinkingLevel);
    if (systemPrompt) args.push(systemPromptMode === 'append' ? '--append-system-prompt' : '--system-prompt', systemPrompt);
    appendExtensionArgs(args, spec, resolvedToolContract, extensionSelection.extensionSources);

    // Extension tool policy gate: appended LAST (-e) after every configured
    // source; activates granted natives + extension-registered tools under
    // --no-builtin-tools (unitAI-34pyf). No-op without enabled sources.
    const policyEnv: Record<string, string> = {};
    applyExtensionToolPolicyGate(args, resolvedToolContract, policyEnv);

    const pi = spawn('pi', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.projectDir ?? process.cwd(),
      ...(Object.keys(policyEnv).length > 0 ? { env: { ...process.env, ...policyEnv } } : {}),
    });
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
  const errorType = mapErrorType(attempt.stderr);
  const retryable = errorType !== 'auth' && isRetryableModelFailure(attempt.stderr, attempt.text);
  if (attempt.exitCode !== 0) {
    return { retryable, kind: 'failure', error: attempt.stderr || `pi exit ${attempt.exitCode}`, errorType, text: attempt.text };
  }
  if (!attempt.text) {
    return { retryable, kind: 'failure', error: attempt.stderr || 'pi produced no assistant text', errorType, text: attempt.text };
  }
  return { retryable: false, kind: 'success', error: '', errorType: 'internal', text: attempt.text };
}

export function isRetryableModelFailure(stderr: string, text: string): boolean {
  const normalizedStderr = stderr.toLowerCase();
  if (isAuthFailureMessage(normalizedStderr)) return false;
  return normalizedStderr.includes('0 tokens') || normalizedStderr.includes('quota') || normalizedStderr.includes('rate limit') || normalizedStderr.includes('insufficient_quota') || (!text && !normalizedStderr.trim());
}

function isAuthFailureMessage(message: string): boolean {
  return /\b(401|403)\b/.test(message)
    || message.includes('auth')
    || message.includes('unauthorized')
    || message.includes('forbidden')
    || message.includes('invalid_api_key')
    || message.includes('authentication failed')
    || message.includes('credentials');
}
