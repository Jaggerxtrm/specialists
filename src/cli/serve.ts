import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawnSync, type ChildProcess } from 'node:child_process';
import { access, readdir, readFile, constants } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SpecialistLoader } from '../specialist/loader.js';
import { runScriptSpecialist, type ScriptGenerateRequest, type ScriptSpecialistErrorType } from '../specialist/script-runner.js';
import { createObservabilitySqliteClient, createObservabilitySqliteClientAtPath } from '../specialist/observability-sqlite.js';
import { collectPrometheusProjectionFromClient } from '../specialist/prometheus-projection.js';
import { ensureObservabilityDbFile, resolveObservabilityDbLocation } from '../specialist/observability-db.js';
import { parseSpecialist } from '../specialist/schema.js';
import { createUserDirWatcher } from './serve-hot-reload.js';

interface ServeArgs {
  port: number;
  concurrency: number;
  queueTimeoutMs: number;
  shutdownGraceMs: number;
  projectDir: string;
  dbPath?: string;
  fallbackModel?: string;
  auditFailureThreshold: number;
  allowSkills: boolean;
  allowSkillsRoots: string[];
  reloadPollMs: number;
  readinessCanaryMode: 'off' | 'warn' | 'require';
  readinessRequiredPiFlags: string[];
  readinessCanarySpecialist?: string;
  readinessCanaryTimeoutMs: number;
  logLevel: 'off' | 'info' | 'debug';
}

const AUDIT_WINDOW_MS = 60_000;
// NOTE: `-e <path>` extensions (read-line-numbers, quality-gates, service-skills,
// caveman, worktree-boundary) are wired at spawn time in session.ts / script-runner.ts.
// This list enumerates flags that MUST be present for readiness; it is not an
// exhaustive allowlist. read-line-numbers: bundled at config/pi-extensions/.
const DEFAULT_REQUIRED_PI_FLAGS = ['--mode', '--no-session', '--no-extensions', '--no-tools', '--no-context-files', '--no-skills', '--no-prompt-templates', '--no-themes'];

export type ReadinessReason =
  | 'draining'
  | 'degraded:audit'
  | 'pi_config_unreadable'
  | 'db_not_writable'
  | 'pi_binary_missing'
  | 'pi_flag_missing'
  | 'pi_smoke_failed'
  | 'empty_user_dir'
  | 'invalid_spec_in_user_dir';

export interface ReadinessState {
  shuttingDown: boolean;
  auditFailures: number[];
  dbWriteFailuresTotal: number;
}

export function createReadinessState(): ReadinessState {
  return { shuttingDown: false, auditFailures: [], dbWriteFailuresTotal: 0 };
}

export function recordAuditFailure(state: ReadinessState, now: number = Date.now()): void {
  state.auditFailures.push(now);
  state.dbWriteFailuresTotal++;
  pruneAuditFailures(state, now);
}

function pruneAuditFailures(state: ReadinessState, now: number = Date.now()): void {
  const cutoff = now - AUDIT_WINDOW_MS;
  while (state.auditFailures.length > 0 && state.auditFailures[0] < cutoff) {
    state.auditFailures.shift();
  }
}

async function checkUserDirSpecs(userDir: string): Promise<'ok' | 'empty' | 'invalid'> {
  if (!existsSync(userDir)) return 'empty';
  const entries = await readdir(userDir).catch(() => [] as string[]);
  const specFiles = entries.filter((name) => name.endsWith('.specialist.json') || name.endsWith('.specialist.yaml'));
  if (specFiles.length === 0) return 'empty';
  let validCount = 0;
  for (const file of specFiles) {
    try {
      const content = await readFile(join(userDir, file), 'utf-8');
      // Only handle JSON here — YAML support would mirror loader.toJson; keep simple.
      const json = file.endsWith('.json') ? content : null;
      if (!json) continue;
      await parseSpecialist(json);
      validCount++;
    } catch {
      // skip — counts as parse failure
    }
  }
  return validCount > 0 ? 'ok' : 'invalid';
}

export interface ReadinessCheckOptions {
  state: ReadinessState;
  projectDir: string;
  dbPath: string;
  piConfigPath?: string;
  auditFailureThreshold: number;
  now?: number;
  piCanaryMode?: 'off' | 'warn' | 'require';
  piCanaryCheck?: () => Promise<ReadinessReason | undefined> | ReadinessReason | undefined;
}

export async function evaluateReadiness(opts: ReadinessCheckOptions): Promise<{ ready: true; warning?: ReadinessReason } | { ready: false; reason: ReadinessReason }> {
  const now = opts.now ?? Date.now();
  if (opts.state.shuttingDown) return { ready: false, reason: 'draining' };

  pruneAuditFailures(opts.state, now);
  if (opts.state.auditFailures.length > opts.auditFailureThreshold) {
    return { ready: false, reason: 'degraded:audit' };
  }

  const piConfigPath = opts.piConfigPath ?? join(homedir(), '.pi', 'agent', 'auth.json');
  try {
    await access(piConfigPath, constants.R_OK);
  } catch {
    return { ready: false, reason: 'pi_config_unreadable' };
  }

  try {
    await access(opts.dbPath, constants.W_OK);
  } catch {
    return { ready: false, reason: 'db_not_writable' };
  }

  let warning: ReadinessReason | undefined;
  const canaryMode = opts.piCanaryMode ?? 'off';
  if (canaryMode !== 'off' && opts.piCanaryCheck) {
    const canaryFailure = await opts.piCanaryCheck();
    if (canaryFailure) {
      if (canaryMode === 'require') return { ready: false, reason: canaryFailure };
      warning = canaryFailure;
    }
  }

  const userDir = join(opts.projectDir, '.specialists', 'user');
  const userDirResult = await checkUserDirSpecs(userDir);
  if (userDirResult === 'empty') return { ready: false, reason: 'empty_user_dir' };
  if (userDirResult === 'invalid') return { ready: false, reason: 'invalid_spec_in_user_dir' };

  return warning ? { ready: true, warning } : { ready: true };
}

function parseArgs(argv: string[]): ServeArgs {
  let port = 8000;
  let concurrency = 4;
  let queueTimeoutMs = 5_000;
  let shutdownGraceMs = 30_000;
  let projectDir = process.cwd();
  let dbPath: string | undefined;
  let fallbackModel: string | undefined;
  let auditFailureThreshold = 5;
  let allowSkills = false;
  let allowSkillsRoots: string[] = [];
  let reloadPollMs = 0;
  let readinessCanaryMode: ServeArgs['readinessCanaryMode'] = 'off';
  const readinessRequiredPiFlags: string[] = [];
  let readinessCanarySpecialist: string | undefined;
  let readinessCanaryTimeoutMs = 5_000;
  let logLevel: ServeArgs['logLevel'] = 'info';

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--port' && argv[i + 1]) port = Number(argv[++i]);
    else if (token === '--concurrency' && argv[i + 1]) concurrency = Number(argv[++i]);
    else if (token === '--queue-timeout-ms' && argv[i + 1]) queueTimeoutMs = Number(argv[++i]);
    else if (token === '--shutdown-grace-ms' && argv[i + 1]) shutdownGraceMs = Number(argv[++i]);
    else if ((token === '--project-dir' || token === '--user-dir') && argv[i + 1]) projectDir = argv[++i];
    else if (token === '--db-path' && argv[i + 1]) dbPath = argv[++i];
    else if (token === '--fallback-model' && argv[i + 1]) fallbackModel = argv[++i];
    else if (token === '--audit-failure-threshold' && argv[i + 1]) auditFailureThreshold = Number(argv[++i]);
    else if (token === '--allow-skills') allowSkills = true;
    else if (token === '--allow-skills-roots' && argv[i + 1]) allowSkillsRoots = argv[++i].split(':').filter(Boolean);
    else if (token === '--allow-local-scripts') throw new Error('--allow-local-scripts is not supported for script-class specialists');
    else if (token === '--reload-poll-ms' && argv[i + 1]) reloadPollMs = Number(argv[++i]);
    else if (token === '--readiness-canary' && argv[i + 1]) {
      const mode = argv[++i];
      if (mode === 'off' || mode === 'warn' || mode === 'require') readinessCanaryMode = mode;
    }
    else if (token === '--readiness-required-pi-flag' && argv[i + 1]) readinessRequiredPiFlags.push(argv[++i]);
    else if (token === '--readiness-canary-specialist' && argv[i + 1]) readinessCanarySpecialist = argv[++i];
    else if (token === '--readiness-canary-timeout-ms' && argv[i + 1]) readinessCanaryTimeoutMs = Number(argv[++i]);
    else if (token === '--log-level' && argv[i + 1]) {
      const value = argv[++i];
      if (value === 'off' || value === 'info' || value === 'debug') logLevel = value;
      else throw new Error('--log-level must be one of: off, info, debug');
    }
  }

  return { port, concurrency, queueTimeoutMs, shutdownGraceMs, projectDir, dbPath, fallbackModel, auditFailureThreshold, allowSkills, allowSkillsRoots, reloadPollMs, readinessCanaryMode, readinessRequiredPiFlags, readinessCanarySpecialist, readinessCanaryTimeoutMs, logLevel };
}

export function checkPiHelpForFlags(flags: string[] = DEFAULT_REQUIRED_PI_FLAGS): ReadinessReason | undefined {
  const result = spawnSync('pi', ['--help'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status === 127) return 'pi_binary_missing';
  const help = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const missing = flags.find((flag) => !help.includes(flag));
  return missing ? 'pi_flag_missing' : undefined;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseFeedEventsRequest(url: string | undefined): { jobId: string; eventFamily?: string; eventName?: string; sinceMs?: number; limit?: number } | null {
  if (!url) return null;
  const parsed = new URL(url, 'http://localhost');
  const match = parsed.pathname.match(/^\/(?:api\/specialists\/)?jobs\/([^/]+)\/feed-events$/);
  if (!match) return null;
  const since = parsed.searchParams.get('since');
  const limit = parsed.searchParams.get('limit');
  return {
    jobId: decodeURIComponent(match[1]),
    eventFamily: parsed.searchParams.get('family') ?? undefined,
    eventName: parsed.searchParams.get('event_name') ?? undefined,
    sinceMs: since ? Number(since) : undefined,
    limit: limit ? Number(limit) : undefined,
  };
}

function feedEventsResponse(rows: ReturnType<NonNullable<ReturnType<typeof createObservabilitySqliteClient>>['readForensicEvents']>): { events: unknown[]; next_cursor: { t: number; seq: number } | null } {
  const events = rows.map((row) => JSON.parse(row.event_json) as unknown);
  const last = rows.at(-1);
  return {
    events,
    next_cursor: last ? { t: last.t, seq: last.seq } : null,
  };
}

type GenerateLogStatus = 'success' | ScriptSpecialistErrorType;

function emitGenerateLog(logLevel: ServeArgs['logLevel'], entry: {
  trace_id: string;
  specialist: string;
  resolved_specialist?: string;
  model?: string;
  status: GenerateLogStatus;
  duration_ms: number;
  prompt_bytes: number;
  method: string;
  path: string;
  error?: string;
}): void {
  if (logLevel === 'off') return;
  console.log(JSON.stringify({ level: logLevel, ts: new Date().toISOString(), ...entry }));
}

function shortLogError(value: unknown, limit = 240): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.length <= limit ? message : `${message.slice(0, limit)}…`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

function isValidRequest(body: unknown): body is ScriptGenerateRequest {
  return Boolean(body && typeof body === 'object' && typeof (body as { specialist?: unknown }).specialist === 'string');
}

async function waitForSlot(limit: number, timeoutMs: number, getActive: () => number): Promise<boolean> {
  const startedAt = Date.now();
  while (getActive() >= limit) {
    if (Date.now() - startedAt >= timeoutMs) return false;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return true;
}

export async function startServe(argv: string[] = process.argv.slice(3)) {
  const args = parseArgs(argv);
  const loader = new SpecialistLoader({ projectDir: args.projectDir });
  const dbLocation = resolveObservabilityDbLocation(args.projectDir);
  const dbPath = args.dbPath ?? dbLocation.dbPath;
  const db = args.dbPath ? createObservabilitySqliteClientAtPath(args.dbPath) : (() => {
    ensureObservabilityDbFile(dbLocation);
    return createObservabilitySqliteClientAtPath(dbLocation.dbPath);
  })();
  const readinessState = createReadinessState();
  const userDir = join(args.projectDir, '.specialists', 'user');
  const hotReload = createUserDirWatcher({ loader, userDir, pollMs: args.reloadPollMs });
  let active = 0;
  const children = new Set<ChildProcess>();
  const piCanaryCheck = async (): Promise<ReadinessReason | undefined> => {
    const requiredFlags = args.readinessRequiredPiFlags.length > 0 ? args.readinessRequiredPiFlags : DEFAULT_REQUIRED_PI_FLAGS;
    const compatibilityFailure = checkPiHelpForFlags(requiredFlags);
    if (compatibilityFailure) return compatibilityFailure;
    if (!args.readinessCanarySpecialist) return undefined;
    const result = await runScriptSpecialist({ specialist: args.readinessCanarySpecialist, trace: false, timeout_ms: args.readinessCanaryTimeoutMs }, {
      loader,
      fallbackModel: args.fallbackModel,
      observabilityDbPath: args.projectDir,
    });
    return result.success ? undefined : 'pi_smoke_failed';
  };

  const server = createServer(async (req, res) => {
    if (req.url === '/healthz') return sendJson(res, 200, { ok: true });
    if (req.method === 'GET') {
      const feedRequest = parseFeedEventsRequest(req.url);
      if (feedRequest) {
        if (!db) return sendJson(res, 503, { success: false, error: 'observability_unavailable', error_type: 'internal' });
        const { jobId, ...filters } = feedRequest;
        const rows = db.readForensicEvents({ jobId, ...filters });
        return sendJson(res, 200, { job_id: jobId, ...feedEventsResponse(rows) });
      }
    }
    if (req.method === 'GET' && req.url === '/metrics') {
      if (!db) return sendJson(res, 503, { success: false, error: 'observability_unavailable', error_type: 'internal' });
      const text = collectPrometheusProjectionFromClient(db, { repo: dbLocation.gitRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? 'specialists' });
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(text);
      return;
    }
    if (req.url === '/readyz') {
      const result = await evaluateReadiness({
        state: readinessState,
        projectDir: args.projectDir,
        dbPath,
        auditFailureThreshold: args.auditFailureThreshold,
        piCanaryMode: args.readinessCanaryMode,
        piCanaryCheck,
      });
      if (result.ready) {
        return sendJson(res, 200, { ready: true, ...(result.warning ? { warning: result.warning } : {}), db_write_failures_total: readinessState.dbWriteFailuresTotal });
      }
      return sendJson(res, 503, {
        ready: false,
        reason: result.reason,
        db_write_failures_total: readinessState.dbWriteFailuresTotal,
      });
    }
    if (req.method !== 'POST' || req.url !== '/v1/generate') return sendJson(res, 404, { success: false, error: 'not_found', error_type: 'internal' });

    const requestStartedAt = Date.now();
    const method = req.method ?? 'POST';
    const path = req.url ?? '/v1/generate';
    const requestTraceId = randomUUID();

    if (readinessState.shuttingDown) {
      emitGenerateLog(args.logLevel, {
        trace_id: requestTraceId,
        specialist: 'unknown',
        status: 'internal',
        duration_ms: Date.now() - requestStartedAt,
        prompt_bytes: 0,
        method,
        path,
        error: 'shutting_down',
      });
      return sendJson(res, 503, { success: false, error: 'shutting_down', error_type: 'internal' });
    }

    const entered = await waitForSlot(args.concurrency, args.queueTimeoutMs, () => active);
    if (!entered) {
      emitGenerateLog(args.logLevel, {
        trace_id: requestTraceId,
        specialist: 'unknown',
        status: 'quota',
        duration_ms: Date.now() - requestStartedAt,
        prompt_bytes: 0,
        method,
        path,
        error: 'too_many_requests',
      });
      return sendJson(res, 429, { success: false, error: 'too_many_requests', error_type: 'quota' });
    }
    active++;
    const work = (async () => {
      let promptBytes = 0;
      let requestedSpecialist = 'unknown';
      try {
        const raw = await readBody(req);
        promptBytes = Buffer.byteLength(raw, 'utf8');
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch {
          const duration_ms = Date.now() - requestStartedAt;
          const trace_id = requestTraceId;
          emitGenerateLog(args.logLevel, { trace_id, specialist: 'unknown', status: 'invalid_json', duration_ms, prompt_bytes: promptBytes, method, path, error: 'malformed_request' });
          return sendJson(res, 400, { success: false, error: 'malformed_request', error_type: 'invalid_json' });
        }
        if (!isValidRequest(parsed)) {
          const duration_ms = Date.now() - requestStartedAt;
          const trace_id = requestTraceId;
          emitGenerateLog(args.logLevel, { trace_id, specialist: 'unknown', status: 'invalid_json', duration_ms, prompt_bytes: promptBytes, method, path, error: 'malformed_request' });
          return sendJson(res, 400, { success: false, error: 'malformed_request', error_type: 'invalid_json' });
        }
        requestedSpecialist = parsed.specialist;
        const result = await runScriptSpecialist(parsed, {
          loader,
          projectDir: args.projectDir,
          fallbackModel: args.fallbackModel,
          ...(args.dbPath ? { observabilityDbPath: args.dbPath } : {}),
          onChild: (child) => {
            children.add(child);
            child.once('exit', () => children.delete(child));
          },
          onAuditFailure: () => recordAuditFailure(readinessState),
          trust: {
            allowSkills: args.allowSkills,
            allowSkillsRoots: args.allowSkillsRoots,
          },
        });
        const duration_ms = Date.now() - requestStartedAt;
        const meta = result.meta ?? {};
        emitGenerateLog(args.logLevel, {
          trace_id: meta.trace_id ?? requestTraceId,
          specialist: meta.specialist ?? (typeof parsed === 'object' && parsed !== null ? String((parsed as { specialist?: unknown }).specialist ?? 'unknown') : 'unknown'),
          resolved_specialist: meta.resolved_specialist,
          model: meta.model,
          status: result.success ? 'success' : result.error_type,
          duration_ms: meta.duration_ms ?? duration_ms,
          prompt_bytes: promptBytes,
          method,
          path,
          ...(result.success ? {} : { error: shortLogError(result.error) }),
        });
        return sendJson(res, 200, result);
      } catch (error) {
        emitGenerateLog(args.logLevel, {
          trace_id: requestTraceId,
          specialist: requestedSpecialist,
          status: 'internal',
          duration_ms: Date.now() - requestStartedAt,
          prompt_bytes: promptBytes,
          method,
          path,
          error: shortLogError(error),
        });
        if (!res.headersSent) return sendJson(res, 500, { success: false, error: 'internal_error', error_type: 'internal' });
      } finally {
        active--;
      }
    })();
    await work;
  });

  server.listen(args.port);
  process.on('SIGTERM', () => {
    readinessState.shuttingDown = true;
    hotReload.stop();
    server.close();
    for (const child of children) child.kill('SIGTERM');
    void (async () => {
      const deadline = Date.now() + args.shutdownGraceMs;
      while (active > 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
      for (const child of children) child.kill('SIGKILL');
      db?.close();
      process.exit(0);
    })();
  });

  await once(server, 'listening');
  console.log(`sp serve listening on ${args.port}`);
  return { server, args, db, readinessState };
}

export async function run(argv: string[] = process.argv.slice(3)): Promise<void> {
  await startServe(argv);
}
