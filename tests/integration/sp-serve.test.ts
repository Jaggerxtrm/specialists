import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const originalCwd = process.cwd();
let tempRoot = '';
let server: ChildProcess | undefined;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'sp-serve-'));
  mkdirSync(join(tempRoot, '.specialists', 'user'), { recursive: true });
  mkdirSync(join(tempRoot, 'bin'), { recursive: true });
  writeFileSync(
    join(tempRoot, '.specialists', 'user', 'echo.specialist.json'),
    JSON.stringify({
      specialist: {
        metadata: { name: 'echo', version: '1.0.0', description: 'echo', category: 'test' },
        execution: {
          mode: 'auto',
          model: 'mock/model',
          timeout_ms: 1000,
          interactive: false,
          response_format: 'json',
          output_type: 'custom',
          permission_required: 'READ_ONLY',
          requires_worktree: false,
          max_retries: 0,
        },
        prompt: {
          task_template: 'say hi to $name',
          output_schema: { type: 'object', required: ['message'] },
          examples: [],
        },
        skills: {},
      },
    }),
  );
  writeFileSync(
    join(tempRoot, 'query-db.mjs'),
    [
      "import { Database } from 'bun:sqlite';",
      'const db = new Database(process.argv[2]);',
      'const jobId = process.argv[3];',
      "const rows = db.query('SELECT specialist, status_json FROM specialist_jobs WHERE job_id = ?').all(jobId);",
      'console.log(JSON.stringify(rows));',
      'db.close();',
    ].join('\n'),
  );
  writeFileSync(
    join(tempRoot, 'bin', 'pi'),
    '#!/usr/bin/env node\nconst input = process.argv.slice(2).join(" ");\nif (input.includes("--model")) {\n  const event = { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify({ message: "hello" }) }] } };\n  process.stdout.write(JSON.stringify(event) + "\\n");\n}\n',
    { mode: 0o755 },
  );
  process.chdir(tempRoot);
  process.env.PATH = `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`;
});

afterEach(() => {
  if (server && !server.killed) server.kill('SIGTERM');
  process.chdir(originalCwd);
});

describe('sp serve', () => {
  async function startServer(port: number, extraArgs: string[] = []): Promise<void> {
    server = spawn('bun', ['src/index.ts', 'serve', '--port', String(port), '--user-dir', tempRoot, ...extraArgs], {
      cwd: originalCwd,
      env: { ...process.env, PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`, HOME: tempRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server start timeout')), 10_000);
      server?.stdout?.on('data', (chunk) => {
        if (String(chunk).includes('sp serve listening on')) {
          clearTimeout(timer);
          resolve();
        }
      });
      if (server) {
        server.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`server exit ${code ?? 'unknown'}`));
        });
      }
    });
  }

  it('healthz responds 200 regardless of readiness', async () => {
    const port = 8124;
    await startServer(port);
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('readyz returns 503 pi_config_unreadable when no pi auth file', async () => {
    const port = 8125;
    await startServer(port);
    const response = await fetch(`http://127.0.0.1:${port}/readyz`);
    expect(response.status).toBe(503);
    const body = await response.json() as { ready: boolean; reason: string; db_write_failures_total: number };
    expect(body.ready).toBe(false);
    expect(body.reason).toBe('pi_config_unreadable');
    expect(body.db_write_failures_total).toBe(0);
  });

  it('readyz returns 200 ready when pi auth + db + spec all present', async () => {
    mkdirSync(join(tempRoot, '.pi', 'agent'), { recursive: true });
    writeFileSync(join(tempRoot, '.pi', 'agent', 'auth.json'), '{}');
    const port = 8126;
    await startServer(port);
    // Hit /v1/generate first to materialize the DB file (server creates it on init).
    const ready = await fetch(`http://127.0.0.1:${port}/readyz`);
    expect(ready.status).toBe(200);
    const body = await ready.json() as { ready: boolean };
    expect(body.ready).toBe(true);
  });

  it('serves generate and writes observability row', async () => {
    const port = 8123;
    server = spawn('bun', ['src/index.ts', 'serve', '--port', String(port), '--user-dir', tempRoot], {
      cwd: originalCwd,
      env: { ...process.env, PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server start timeout')), 10_000);
      server?.stdout?.on('data', (chunk) => {
        if (String(chunk).includes('sp serve listening on')) {
          clearTimeout(timer);
          resolve();
        }
      });
      if (server) {
        server.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`server exit ${code ?? 'unknown'}`));
        });
      }
    });

    const response = await fetch(`http://127.0.0.1:${port}/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ specialist: 'echo', variables: { name: 'world' }, trace: true }),
    });
    const body = await response.json() as { success: boolean; output?: string; meta?: { trace_id?: string } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.output).toContain('hello');
    expect(body.meta?.trace_id).toBeTruthy();

    const traceId = body.meta?.trace_id ?? '';
    const query = spawnSync('bun', [join(tempRoot, 'query-db.mjs'), join(tempRoot, '.specialists', 'db', 'observability.db'), traceId], { encoding: 'utf-8' });
    expect(query.status).toBe(0);
    const rows = JSON.parse(query.stdout.trim()) as Array<{ specialist: string; status_json: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].specialist).toBe('echo');
    expect(JSON.parse(rows[0].status_json).surface).toBe('script_specialist');
  });
});
