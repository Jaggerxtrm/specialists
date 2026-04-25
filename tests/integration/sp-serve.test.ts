import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServe } from '../../src/cli/serve.js';

const originalCwd = process.cwd();
let tempRoot = '';

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
    join(tempRoot, 'bin', 'pi'),
    '#!/usr/bin/env node\nconst fs = require("node:fs");\nconst input = process.argv.slice(2).join(" ");\nif (input.includes("--model")) {\n  process.stdout.write(JSON.stringify({ type: "assistant", data: { text: JSON.stringify({ message: "hello" }) } }) + "\\n");\n}\n',
    { mode: 0o755 },
  );
  process.chdir(tempRoot);
  process.env.PATH = `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`;
});

afterEach(() => {
  process.chdir(originalCwd);
});

describe('sp serve', () => {
  it('serves generate and writes observability row', async () => {
    const started = await startServe(['--port', '0', '--user-dir', tempRoot]);
    const port = (started.server.address() as { port: number }).port;

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

    const dbPath = join(tempRoot, '.specialists', 'db', 'observability.db');
    expect(existsSync(dbPath)).toBe(true);
    started.server.close();
  });
});
