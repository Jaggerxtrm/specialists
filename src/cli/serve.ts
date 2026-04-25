import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { SpecialistLoader } from '../specialist/loader.js';
import { runScriptSpecialist, type ScriptGenerateRequest } from '../specialist/script-runner.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { ensureObservabilityDbFile, resolveObservabilityDbLocation } from '../specialist/observability-db.js';

interface ServeArgs {
  port: number;
  concurrency: number;
  queueTimeoutMs: number;
  shutdownGraceMs: number;
  userDir: string;
  fallbackModel?: string;
}

function parseArgs(argv: string[]): ServeArgs {
  let port = 8000;
  let concurrency = 4;
  let queueTimeoutMs = 5_000;
  let shutdownGraceMs = 30_000;
  let userDir = process.cwd();
  let fallbackModel: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--port' && argv[i + 1]) port = Number(argv[++i]);
    else if (token === '--concurrency' && argv[i + 1]) concurrency = Number(argv[++i]);
    else if (token === '--queue-timeout-ms' && argv[i + 1]) queueTimeoutMs = Number(argv[++i]);
    else if (token === '--shutdown-grace-ms' && argv[i + 1]) shutdownGraceMs = Number(argv[++i]);
    else if (token === '--user-dir' && argv[i + 1]) userDir = argv[++i];
    else if (token === '--fallback-model' && argv[i + 1]) fallbackModel = argv[++i];
  }

  return { port, concurrency, queueTimeoutMs, shutdownGraceMs, userDir, fallbackModel };
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
  const loader = new SpecialistLoader({ projectDir: args.userDir });
  const dbLocation = resolveObservabilityDbLocation(args.userDir);
  ensureObservabilityDbFile(dbLocation);
  const db = createObservabilitySqliteClient(args.userDir);
  let active = 0;
  let shuttingDown = false;
  const children = new Set<ChildProcess>();

  const server = createServer(async (req, res) => {
    if (req.url === '/healthz') return sendJson(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/v1/generate') return sendJson(res, 404, { success: false, error: 'not_found', error_type: 'internal' });
    if (shuttingDown) return sendJson(res, 503, { success: false, error: 'shutting_down', error_type: 'internal' });

    const entered = await waitForSlot(args.concurrency, args.queueTimeoutMs, () => active);
    if (!entered) return sendJson(res, 429, { success: false, error: 'too_many_requests', error_type: 'quota' });
    active++;
    const work = (async () => {
      try {
        const raw = await readBody(req);
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { return sendJson(res, 400, { success: false, error: 'malformed_request', error_type: 'invalid_json' }); }
        if (!isValidRequest(parsed)) return sendJson(res, 400, { success: false, error: 'malformed_request', error_type: 'invalid_json' });
        const result = await runScriptSpecialist(parsed, { loader, fallbackModel: args.fallbackModel, observabilityDbPath: args.userDir, onChild: (child) => {
          children.add(child);
          child.once('exit', () => children.delete(child));
        } });
        return sendJson(res, 200, result);
      } finally {
        active--;
      }
    })();
    await work;
  });

  server.listen(args.port);
  process.on('SIGTERM', () => {
    shuttingDown = true;
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
  return { server, args, db };
}

export async function run(argv: string[] = process.argv.slice(3)): Promise<void> {
  await startServe(argv);
}
