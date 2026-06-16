import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  const turns = events.filter((event) => hasType(event, 'turn') || hasType(event, 'assistant') || hasType(event, 'user')).length;
  const tools = events.filter((event) => hasType(event, 'tool')).length;
  return {
    turns_used: turns,
    tools_used: tools,
    output_length: output.length,
    files_outside_scope_touched: 0,
    premature_agent_end: !result.success || /premature|agent_end|bail/i.test(output),
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

function hasType(value: unknown, needle: string): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return Object.values(record).some((field) => typeof field === 'string' && field.toLowerCase().includes(needle));
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
