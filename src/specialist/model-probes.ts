import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { SpecialistLoader } from './loader.js';
import { runScriptSpecialist, type ScriptGenerateResult, type ScriptRunnerOptions } from './script-runner.js';

export type ProbeVerdict = 'PASS' | 'PARTIAL' | 'FAIL';

export interface AgenticFollowthroughMetrics {
  turns_used: number;
  tools_used: number;
  output_length: number;
  files_outside_scope_touched: number;
  premature_agent_end: boolean;
}

export interface AgenticFollowthroughResult {
  verdict: ProbeVerdict;
  metrics: AgenticFollowthroughMetrics;
  sample_output: string;
  transcript_path: string;
}

export interface AgenticFollowthroughOptions {
  cacheDir?: string;
  timeoutMs?: number;
  runSpecialist?: (input: Parameters<typeof runScriptSpecialist>[0], options: ScriptRunnerOptions) => Promise<ScriptGenerateResult>;
  loader?: SpecialistLoader;
  projectDir?: string;
  now?: Date;
}

const PROBE_TEMPLATE = `You are validating agentic follow-through. Stay inside provided SCOPE.

SCOPE:
- probe-notes.md

Contract:
1. Inspect current workspace state before writing.
2. Create or update probe-notes.md with answers to: what changed, why, and how verified.
3. Re-read probe-notes.md and summarize final state with concrete evidence.

Return concise FINAL text with evidence. Do not touch files outside SCOPE.`;

const PASS_MIN_TURNS = 5;
const PASS_MIN_TOOLS = 3;
const PASS_MIN_OUTPUT = 500;
const FAIL_MIN_TURNS = 3;
const FAIL_MIN_TOOLS = 2;
const FAIL_MIN_OUTPUT = 200;
const HARD_TIMEOUT_MS = 300_000;

export async function runAgenticFollowthroughProbe(model: string, specName: string, opts: AgenticFollowthroughOptions = {}): Promise<AgenticFollowthroughResult> {
  const probeDir = getProbeRunDir(model, specName, opts.cacheDir);
  mkdirSync(probeDir, { recursive: true });
  writeFileSync(join(probeDir, 'probe-notes.md'), '# Probe notes\n');

  const run = opts.runSpecialist ?? runScriptSpecialist;
  const result = await withTimeout(run({
    specialist: specName,
    model_override: model,
    template: PROBE_TEMPLATE,
    timeout_ms: Math.min(opts.timeoutMs ?? HARD_TIMEOUT_MS, HARD_TIMEOUT_MS),
    trace: true,
  }, {
    loader: opts.loader ?? new SpecialistLoader({ projectDir: opts.projectDir ?? process.cwd() }),
    projectDir: probeDir,
  }), opts.timeoutMs ?? HARD_TIMEOUT_MS);

  const output = result.success ? result.output : result.error;
  const transcriptPath = writeTranscript(probeDir, result, output, opts.now ?? new Date());
  const metrics = collectMetrics(probeDir, output, result);
  const verdict = classifyProbe(metrics);
  const summaryPath = join(probeDir, 'probe-summary.json');
  writeFileSync(summaryPath, `${JSON.stringify({ verdict, metrics, sample_output: output, transcript_path: transcriptPath }, null, 2)}\n`);

  return { verdict, metrics, sample_output: output, transcript_path: transcriptPath };
}

function collectMetrics(probeDir: string, output: string, result: ScriptGenerateResult): AgenticFollowthroughMetrics {
  const eventsPath = join(probeDir, 'events.jsonl');
  const events = readJsonl(eventsPath);
  const turns = events.filter(isTurnEvent).length;
  const tools = events.filter(isToolEvent).length;
  return {
    turns_used: turns,
    tools_used: tools,
    output_length: output.length,
    files_outside_scope_touched: countFilesOutsideScope(probeDir),
    premature_agent_end: !result.success || turns < FAIL_MIN_TURNS || events.some(isAgentEndEvent),
  };
}

function classifyProbe(metrics: AgenticFollowthroughMetrics): ProbeVerdict {
  if (metrics.turns_used < FAIL_MIN_TURNS || metrics.tools_used < FAIL_MIN_TOOLS || metrics.output_length < FAIL_MIN_OUTPUT || metrics.premature_agent_end) return 'FAIL';
  if (metrics.turns_used >= PASS_MIN_TURNS && metrics.tools_used >= PASS_MIN_TOOLS && metrics.output_length >= PASS_MIN_OUTPUT && metrics.files_outside_scope_touched === 0) return 'PASS';
  return 'PARTIAL';
}

function readJsonl(path: string): unknown[] {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function isTurnEvent(value: unknown): boolean {
  const type = eventType(value);
  return type === 'assistant_turn' || type === 'user_turn' || type === 'turn';
}

function isToolEvent(value: unknown): boolean {
  const type = eventType(value);
  return type === 'tool_use' || type === 'tool_result' || type === 'tool';
}

function isAgentEndEvent(value: unknown): boolean {
  const type = eventType(value);
  return type === 'agent_end' || type === 'premature_agent_end';
}

function eventType(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const type = (value as Record<string, unknown>).type;
  return typeof type === 'string' ? type : null;
}

function countFilesOutsideScope(probeDir: string): number {
  const allowedFiles = new Set(['probe-notes.md', 'events.jsonl', 'probe-summary.json']);
  try {
    return readdirSync(probeDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .filter((entry) => !allowedFiles.has(entry.name))
      .length;
  } catch {
    return 0;
  }
}

function writeTranscript(probeDir: string, result: ScriptGenerateResult, output: string, now: Date): string {
  const transcriptPath = join(probeDir, 'events.jsonl');
  writeFileSync(transcriptPath, `${JSON.stringify({ type: 'probe_result', at: now.toISOString(), result, output })}\n`, { flag: 'a' });
  return transcriptPath;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`probe timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

export function getProbeRunDir(model: string, specName: string, cacheDir = join(homedir(), '.cache', 'specialists', 'probes')): string {
  const probeId = createHash('sha256').update(`${model}\0${specName}\0${PROBE_TEMPLATE}`).digest('hex').slice(0, 12);
  return resolve(cacheDir, `${sanitizePathSegment(model)}-${sanitizePathSegment(specName)}-${probeId}`, randomUUID());
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
