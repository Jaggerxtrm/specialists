import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { SpecialistLoader } from './loader.js';
import { renderTemplate } from './templateEngine.js';
import { createObservabilitySqliteClient } from './observability-sqlite.js';
import type { Specialist } from './schema.js';
import type { SupervisorStatus } from './supervisor.js';

export type ScriptSpecialistErrorType =
  | 'specialist_not_found'
  | 'specialist_load_error'
  | 'template_variable_missing'
  | 'auth'
  | 'quota'
  | 'timeout'
  | 'network'
  | 'invalid_json'
  | 'output_too_large'
  | 'internal';

export interface ScriptGenerateRequest {
  specialist: string;
  variables?: Record<string, string>;
  template?: string;
  model_override?: string;
  timeout_ms?: number;
  trace?: boolean;
}

export interface ScriptGenerateSuccess {
  success: true;
  output: string;
  parsed_json?: unknown;
  meta: { specialist: string; model: string; duration_ms: number; trace_id: string };
}

export interface ScriptGenerateFailure {
  success: false;
  error: string;
  error_type: ScriptSpecialistErrorType;
  meta?: { specialist?: string; model?: string; duration_ms?: number; trace_id?: string };
}

export type ScriptGenerateResult = ScriptGenerateSuccess | ScriptGenerateFailure;

export interface ScriptRunnerOptions {
  loader: SpecialistLoader;
  userDir?: string;
  fallbackModel?: string;
  observabilityDbPath?: string;
  onChild?: (child: ChildProcess) => void;
}

function hasUnsubstitutedVariables(template: string): string | null {
  const match = template.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/);
  return match?.[1] ?? null;
}

export function compatGuard(spec: Specialist): void {
  const execution = spec.specialist.execution;
  if (execution.interactive) throw new Error('interactive specialists are not allowed');
  if (execution.requires_worktree) throw new Error('worktree specialists are not allowed');
  if (execution.permission_required !== 'READ_ONLY') throw new Error('permission_required must be READ_ONLY');
  if ((spec.specialist.skills?.scripts?.length ?? 0) > 0) throw new Error('scripts not allowed');
}

export function renderTaskTemplate(template: string, variables: Record<string, string>): string {
  const output = renderTemplate(template, variables);
  const missing = hasUnsubstitutedVariables(output);
  if (missing) throw new Error(`Missing template variable: ${missing}`);
  return output;
}

function mapErrorType(message: string): ScriptSpecialistErrorType {
  if (message.includes('Specialist not found')) return 'specialist_not_found';
  if (message.includes('interactive') || message.includes('worktree') || message.includes('permission_required') || message.includes('scripts not allowed')) return 'specialist_load_error';
  if (message.includes('Missing template variable')) return 'template_variable_missing';
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

function writeTraceRow(client: ReturnType<typeof createObservabilitySqliteClient>, specialist: string, model: string, traceId: string, output: string, durationMs: number): void {
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
  } as unknown as SupervisorStatus;
  client.upsertStatus(status);
  client.upsertResult(traceId, output);
}

function openObservabilityClient(options: ScriptRunnerOptions): ReturnType<typeof createObservabilitySqliteClient> {
  const dbPath = options.observabilityDbPath ?? options.userDir;
  return createObservabilitySqliteClient(dbPath);
}

export async function runScriptSpecialist(input: ScriptGenerateRequest, options: ScriptRunnerOptions): Promise<ScriptGenerateResult> {
  const traceId = randomUUID();
  const startedAt = Date.now();
  try {
    const spec = await options.loader.get(input.specialist);
    compatGuard(spec);

    const template = input.template ?? spec.specialist.prompt.task_template;
    const prompt = renderTaskTemplate(template, input.variables ?? {});
    const model = input.model_override ?? spec.specialist.execution.model ?? options.fallbackModel ?? 'unknown';
    const timeoutMs = input.timeout_ms ?? spec.specialist.execution.timeout_ms ?? 120_000;

    const args = ['--mode', 'json', '--no-session', '--no-extensions', '--no-tools', '--model', model];
    if (spec.specialist.execution.thinking_level) args.push('--thinking', spec.specialist.execution.thinking_level);
    args.push('--', prompt);

    const pi = spawn('pi', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    options.onChild?.(pi);

    const chunks: Buffer[] = [];
    let stderr = '';
    let timedOut = false;
    let outputTooLarge = false;
    const stdoutLimit = 4 * 1024 * 1024;
    let stdoutBytes = 0;

    const timer = setTimeout(() => {
      timedOut = true;
      pi.kill('SIGTERM');
      setTimeout(() => pi.kill('SIGKILL'), 2000);
    }, timeoutMs);

    pi.stdout.on('data', chunk => {
      const buffer = Buffer.from(chunk);
      chunks.push(buffer);
      stdoutBytes += buffer.length;
      if (stdoutBytes > stdoutLimit && !outputTooLarge) {
        outputTooLarge = true;
        pi.kill('SIGTERM');
        setTimeout(() => pi.kill('SIGKILL'), 2000);
      }
    });
    pi.stderr.on('data', chunk => { stderr += String(chunk); });

    const exitCode = await new Promise<number>((resolve, reject) => {
      pi.on('error', reject);
      pi.on('close', code => resolve(code ?? 0));
    }).finally(() => clearTimeout(timer));

    const stdout = Buffer.concat(chunks).toString('utf-8');
    const text = extractAssistantText(stdout.split(/\r?\n/));
    const durationMs = Date.now() - startedAt;
    const observability = openObservabilityClient(options);
    if (observability) writeTraceRow(observability, input.specialist, model, traceId, text, durationMs);

    if (outputTooLarge) {
      return { success: false, error: 'stdout exceeded 4MB cap', error_type: 'output_too_large', meta: { specialist: input.specialist, model, duration_ms: durationMs, trace_id: traceId } };
    }
    if (timedOut) {
      return { success: false, error: stderr || 'timed out', error_type: 'timeout', meta: { specialist: input.specialist, model, duration_ms: durationMs, trace_id: traceId } };
    }
    if (exitCode !== 0) {
      return { success: false, error: stderr || `pi exit ${exitCode}`, error_type: mapErrorType(stderr), meta: { specialist: input.specialist, model, duration_ms: durationMs, trace_id: traceId } };
    }

    if (!text) {
      const piError = extractPiErrorMessage(stdout.split(/\r?\n/));
      if (piError) {
        return { success: false, error: piError, error_type: mapErrorType(piError), meta: { specialist: input.specialist, model, duration_ms: durationMs, trace_id: traceId } };
      }
      return { success: false, error: 'pi produced no assistant text', error_type: 'internal', meta: { specialist: input.specialist, model, duration_ms: durationMs, trace_id: traceId } };
    }

    let parsed_json: unknown;
    if (spec.specialist.execution.response_format === 'json') {
      try {
        parsed_json = JSON.parse(stripMarkdownFences(text));
        const required = Array.isArray(spec.specialist.prompt.output_schema?.required)
          ? spec.specialist.prompt.output_schema.required.filter((value): value is string => typeof value === 'string')
          : [];
        for (const key of required) {
          if (parsed_json === null || typeof parsed_json !== 'object' || !(key in parsed_json)) {
            throw new Error(`Missing required output field: ${key}`);
          }
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), error_type: 'invalid_json', meta: { specialist: input.specialist, model, duration_ms: durationMs, trace_id: traceId } };
      }
    }

    return { success: true, output: text, parsed_json, meta: { specialist: input.specialist, model, duration_ms: durationMs, trace_id: traceId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message, error_type: mapErrorType(message), meta: { specialist: input.specialist, duration_ms: Date.now() - startedAt, trace_id: traceId } };
  }
}
