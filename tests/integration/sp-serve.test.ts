import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { countArg, getExtensionArgs, readLoggedPiArgv } from './helpers/fake-pi';

const originalCwd = process.cwd();
let tempRoot = '';
let server: ChildProcess | undefined;
let serverStdout = '';

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'sp-serve-'));
  serverStdout = '';
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
    join(tempRoot, 'insert-forensic-event.mjs'),
    [
      "import { Database } from 'bun:sqlite';",
      'const db = new Database(process.argv[2]);',
      'const event = JSON.parse(process.argv[3]);',
      "db.run(`INSERT INTO specialist_forensic_events (job_id, seq, t, schema_version, event_family, event_name, participant_kind, participant_role, participant_id, redaction_status, event_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [event.correlation.job_id, event.seq, event.t_unix_ms, event.schema_version, event.event_family, event.event_name, event.resource.participant_kind, event.resource.participant_role, `${event.correlation.chain_id}::${event.resource.participant_role}`, event.redaction.status, JSON.stringify(event)]);",
      'db.close();',
    ].join('\n'),
  );
  writeFileSync(
    join(tempRoot, 'bin', 'pi'),
    '#!/usr/bin/env node\nconst input = process.argv.slice(2).join(" ");\nif (input.includes("--model")) {\n  const event = { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify({ message: "hello", cwd: process.cwd() }) }] } };\n  process.stdout.write(JSON.stringify(event) + "\\n");\n}\n',
    { mode: 0o755 },
  );
  process.chdir(tempRoot);
  process.env.PATH = `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`;
});

afterEach(() => {
  if (server && !server.killed) server.kill('SIGTERM');
  delete process.env.PI_ARGV_LOG;
  delete process.env.PI_FAKE_EXIT_CODE;
  delete process.env.PI_FAKE_STDERR;
  process.chdir(originalCwd);
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
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
        serverStdout += String(chunk);
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

  async function waitForGenerateLog(): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5_000) {
      for (const line of serverStdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed.path === '/v1/generate') return parsed;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`generate log not found in stdout: ${serverStdout}`);
  }

  it('logs one structured operational line per generate request by default', async () => {
    const port = 8128;
    await startServer(port);

    const payload = { specialist: 'echo', variables: { name: 'world' }, trace: true };
    const response = await fetch(`http://127.0.0.1:${port}/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json() as { success: boolean; meta?: { trace_id?: string } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const log = await waitForGenerateLog();
    expect(log.level).toBe('info');
    expect(log.trace_id).toBe(body.meta?.trace_id);
    expect(log.specialist).toBe('echo');
    expect(log.resolved_specialist).toBe('echo');
    expect(log.model).toBe('mock/model');
    expect(log.status).toBe('success');
    expect(log.method).toBe('POST');
    expect(log.path).toBe('/v1/generate');
    expect(typeof log.duration_ms).toBe('number');
    expect(log.prompt_bytes).toBe(Buffer.byteLength(JSON.stringify(payload), 'utf8'));
  });

  it('suppresses generate operational logs when --log-level off', async () => {
    const port = 8129;
    await startServer(port, ['--log-level', 'off']);

    const response = await fetch(`http://127.0.0.1:${port}/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ specialist: 'echo', variables: { name: 'world' }, trace: true }),
    });
    const body = await response.json() as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(serverStdout.split('\n').filter(line => line.trim().startsWith('{'))).toHaveLength(0);
  });

  it('logs malformed generate requests without logging request bodies', async () => {
    const port = 8130;
    await startServer(port);

    const response = await fetch(`http://127.0.0.1:${port}/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const body = await response.json() as { success: boolean; error_type?: string };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error_type).toBe('invalid_json');

    const log = await waitForGenerateLog();
    expect(log.status).toBe('invalid_json');
    expect(log.error).toBe('malformed_request');
    expect(log.prompt_bytes).toBe(Buffer.byteLength('{not-json', 'utf8'));
    expect(JSON.stringify(log)).not.toContain('not-json');
  });

  it('serves per-job normalized forensic feed events', async () => {
    const port = 8132;
    await startServer(port);

    const dbPath = join(tempRoot, '.specialists', 'db', 'observability.db');
    const event = {
      schema_version: 'xtrm.forensic.v1',
      timestamp: '2026-06-04T00:00:00.000Z',
      t_unix_ms: 1_780_000_000_000,
      seq: 1,
      severity: 'info',
      event_family: 'tool',
      event_name: 'tool.call.completed',
      event_version: 1,
      resource: {
        service_namespace: 'xtrm',
        service_name: 'specialists',
        service_component: 'test',
        deployment_environment: 'local',
        repo: 'specialists',
        participant_kind: 'specialist',
        participant_role: 'executor',
      },
      correlation: { job_id: 'job-feed', chain_id: 'chain-feed', trace_id: 'trace-feed' },
      body: { tool_name: 'bash' },
      redaction: { status: 'clean' },
    };
    const insert = spawnSync('bun', [join(tempRoot, 'insert-forensic-event.mjs'), dbPath, JSON.stringify(event)], { encoding: 'utf-8' });
    expect(insert.status).toBe(0);

    // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
    const response = await fetch(`http://127.0.0.1:${port}/jobs/job-feed/feed-events?family=tool`);
    const body = await response.json() as { job_id: string; events: any[]; next_cursor: { t: number; seq: number } | null };

    expect(response.status).toBe(200);
    expect(body.job_id).toBe('job-feed');
    expect(body.events).toHaveLength(1);
    expect(body.events[0].schema_version).toBe('xtrm.forensic.v1');
    expect(body.events[0].event_name).toBe('tool.call.completed');
    expect(body.events[0].body).toEqual({ tool_name: 'bash' });
    expect(body.events[0].redaction).toEqual({ status: 'clean' });
    expect(body.next_cursor).toEqual({ t: 1_780_000_000_000, seq: 1 });
  });

  it('forwards ordered enabled extension sources on serve generate and keeps offline for local-only sources', async () => {
    const argvLog = join(tempRoot, 'pi-argv.jsonl');
    mkdirSync(join(tempRoot, 'workspace', 'local-extension'), { recursive: true });
    writeFileSync(
      join(tempRoot, '.specialists', 'user', 'serve-ext.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'serve-ext', version: '1.0.0', description: 'echo', category: 'test' },
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
            extensions: {
              serena: false,
              './local-extension': true,
              './second-local-extension': true,
              'https://example.test/disabled': false,
            },
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
    mkdirSync(join(tempRoot, 'workspace', 'second-local-extension'), { recursive: true });

    writeFileSync(
      join(tempRoot, 'bin', 'pi'),
      '#!/usr/bin/env node\nconst { appendFileSync } = require("node:fs");\nappendFileSync(process.env.PI_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");\nprocess.stdin.resume();\nprocess.stdin.on("end", () => {\n  setTimeout(() => {\n    const event = { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify({ message: "hello", cwd: process.cwd() }) }] } };\n    process.stdout.write(JSON.stringify(event) + "\\n");\n  }, 25);\n});\n',
      { mode: 0o755 },
    );
    process.env.PI_ARGV_LOG = argvLog;

    const port = 8133;
    await startServer(port);
    // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- isolated loopback test server
    const response = await fetch(`http://127.0.0.1:${port}/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ specialist: 'serve-ext', variables: { name: 'world' }, trace: true }),
    });
    const body = await response.json() as { success: boolean };
    const [argv] = readLoggedPiArgv(argvLog);
    const extensionArgs = getExtensionArgs(argv);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(argv).toContain('--offline');
    expect(extensionArgs.filter((value) => ['./local-extension', './second-local-extension'].includes(value))).toEqual([
      './local-extension',
      './second-local-extension',
    ]);
    expect(countArg(extensionArgs, './local-extension')).toBe(1);
    expect(countArg(extensionArgs, './second-local-extension')).toBe(1);
    expect(extensionArgs).not.toContain('https://example.test/disabled');
    expect(extensionArgs).not.toContain('serena');
    expect(extensionArgs.join(' ')).not.toContain('service-skills');
  });

  it('metrics responds with Prometheus text regardless of readiness', async () => {
    const port = 8131;
    await startServer(port);
    const response = await fetch(`http://127.0.0.1:${port}/metrics`);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(text).toContain('# TYPE xtrm_prometheus_projection_timestamp_seconds gauge');
    expect(text).not.toMatch(/job_id=|bead_id=|chain_id=|participant_id=|trace_id=/);
  });

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
    await startServer(port);

    const response = await fetch(`http://127.0.0.1:${port}/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ specialist: 'echo', variables: { name: 'world' }, trace: true }),
    });
    const body = await response.json() as { success: boolean; output?: string; parsed_json?: { cwd?: string }; meta?: { trace_id?: string } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.output).toContain('hello');
    expect(body.parsed_json?.cwd).toBe(tempRoot);
    expect(body.meta?.trace_id).toBeTruthy();

    expect(body.meta?.trace_id).toBeTruthy();
    expect(existsSync(join(tempRoot, '.specialists', 'db', 'observability.db'))).toBe(true);
  });

  it('uses --db-path as the exact serve observability database file', async () => {
    const port = 8127;
    const customDbPath = join(tempRoot, 'state', 'observability.db');
    await startServer(port, ['--db-path', customDbPath]);

    const response = await fetch(`http://127.0.0.1:${port}/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ specialist: 'echo', variables: { name: 'world' }, trace: true }),
    });
    const body = await response.json() as { success: boolean; meta?: { trace_id?: string } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(existsSync(customDbPath)).toBe(true);
    expect(existsSync(join(tempRoot, '.specialists', 'db', 'observability.db'))).toBe(false);

    const query = spawnSync('bun', [join(tempRoot, 'query-db.mjs'), customDbPath, body.meta?.trace_id ?? ''], { encoding: 'utf-8' });
    expect(query.status).toBe(0);
    const rows = JSON.parse(query.stdout.trim()) as Array<{ specialist: string; status_json: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].specialist).toBe('echo');
  });
});
