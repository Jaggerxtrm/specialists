import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { access, readdir, readFile, constants } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SpecialistLoader } from '../specialist/loader.js';
import { runScriptSpecialist, type ScriptGenerateRequest } from '../specialist/script-runner.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { ensureObservabilityDbFile, resolveObservabilityDbLocation } from '../specialist/observability-db.js';
import { parseSpecialist } from '../specialist/schema.js';
import { createUserDirWatcher } from './serve-hot-reload.js';

interface ServeArgs {
  port: number;
  concurrency: number;
  queueTimeoutMs: number;
  shutdownGraceMs: number;
  projectDir: string;
  fallbackModel?: string;
  auditFailureThreshold: number;
  allowSkills: boolean;
  allowSkillsRoots: string[];
  allowLocalScripts: boolean;
  reloadPollMs: number;
}

const AUDIT_WINDOW_MS = 60_000;

export type ReadinessReason =
  | 'draining'
  | 'degraded:audit'
  | 'pi_config_unreadable'
  | 'db_not_writable'
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
}

export async function evaluateReadiness(opts: ReadinessCheckOptions): Promise<{ ready: true } | { ready: false; reason: ReadinessReason }> {
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

  const userDir = join(opts.projectDir, '.specialists', 'user');
  const userDirResult = await checkUserDirSpecs(userDir);
  if (userDirResult === 'empty') return { ready: false, reason: 'empty_user_dir' };
  if (userDirResult === 'invalid') return { ready: false, reason: 'invalid_spec_in_user_dir' };

  return { ready: true };
}

function parseArgs(argv: string[]): ServeArgs {
  let port = 8000;
  let concurrency = 4;
  let queueTimeoutMs = 5_000;
  let shutdownGraceMs = 30_000;
  let projectDir = process.cwd();
  let fallbackModel: string | undefined;
  let auditFailureThreshold = 5;
  let allowSkills = false;
  let allowSkillsRoots: string[] = [];
  let allowLocalScripts = false;
  let reloadPollMs = 0;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--port' && argv[i + 1]) port = Number(argv[++i]);
    else if (token === '--concurrency' && argv[i + 1]) concurrency = Number(argv[++i]);
    else if (token === '--queue-timeout-ms' && argv[i + 1]) queueTimeoutMs = Number(argv[++i]);
    else if (token === '--shutdown-grace-ms' && argv[i + 1]) shutdownGraceMs = Number(argv[++i]);
    else if ((token === '--project-dir' || token === '--user-dir') && argv[i + 1]) projectDir = argv[++i];
    else if (token === '--fallback-model' && argv[i + 1]) fallbackModel = argv[++i];
    else if (token === '--audit-failure-threshold' && argv[i + 1]) auditFailureThreshold = Number(argv[++i]);
    else if (token === '--allow-skills') allowSkills = true;
    else if (token === '--allow-skills-roots' && argv[i + 1]) allowSkillsRoots = argv[++i].split(':').filter(Boolean);
    else if (token === '--allow-local-scripts') allowLocalScripts = true;
    else if (token === '--reload-poll-ms' && argv[i + 1]) reloadPollMs = Number(argv[++i]);
  }

  return { port, concurrency, queueTimeoutMs, shutdownGraceMs, projectDir, fallbackModel, auditFailureThreshold, allowSkills, allowSkillsRoots, allowLocalScripts, reloadPollMs };
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
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
  ensureObservabilityDbFile(dbLocation);
  const db = createObservabilitySqliteClient(args.projectDir);
  const readinessState = createReadinessState();
  const userDir = join(args.projectDir, '.specialists', 'user');
  const hotReload = createUserDirWatcher({ loader, userDir, pollMs: args.reloadPollMs });
  let active = 0;
  const children = new Set<ChildProcess>();

  const server = createServer(async (req, res) => {
    if (req.url === '/healthz') return sendJson(res, 200, { ok: true });
    if (req.url === '/readyz') {
      const result = await evaluateReadiness({
        state: readinessState,
        projectDir: args.projectDir,
        dbPath: dbLocation.dbPath,
        auditFailureThreshold: args.auditFailureThreshold,
      });
      if (result.ready) {
        return sendJson(res, 200, { ready: true, db_write_failures_total: readinessState.dbWriteFailuresTotal });
      }
      return sendJson(res, 503, {
        ready: false,
        reason: result.reason,
        db_write_failures_total: readinessState.dbWriteFailuresTotal,
      });
    }
    if (req.method !== 'POST' || req.url !== '/v1/generate') return sendJson(res, 404, { success: false, error: 'not_found', error_type: 'internal' });
    if (readinessState.shuttingDown) return sendJson(res, 503, { success: false, error: 'shutting_down', error_type: 'internal' });

    const entered = await waitForSlot(args.concurrency, args.queueTimeoutMs, () => active);
    if (!entered) return sendJson(res, 429, { success: false, error: 'too_many_requests', error_type: 'quota' });
    active++;
    const work = (async () => {
      try {
        const raw = await readBody(req);
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { return sendJson(res, 400, { success: false, error: 'malformed_request', error_type: 'invalid_json' }); }
        if (!isValidRequest(parsed)) return sendJson(res, 400, { success: false, error: 'malformed_request', error_type: 'invalid_json' });
        const result = await runScriptSpecialist(parsed, {
          loader,
          fallbackModel: args.fallbackModel,
          observabilityDbPath: args.projectDir,
          onChild: (child) => {
            children.add(child);
            child.once('exit', () => children.delete(child));
          },
          onAuditFailure: () => recordAuditFailure(readinessState),
          trust: {
            allowSkills: args.allowSkills,
            allowSkillsRoots: args.allowSkillsRoots,
            allowLocalScripts: args.allowLocalScripts,
          },
        });
        return sendJson(res, 200, result);
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
