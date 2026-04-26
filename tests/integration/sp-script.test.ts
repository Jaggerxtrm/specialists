import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';

const ORIGINAL_CWD = process.cwd();
let tempRoot = '';
let firstRun: ChildProcess | undefined;

function waitForExit(child: ChildProcess): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += String(chunk); });
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'sp-script-'));
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
    '#!/usr/bin/env node\nsetTimeout(() => { const event = { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify({ message: "hello" }) }] } }; process.stdout.write(JSON.stringify(event) + "\\n"); }, 200);\n',
    { mode: 0o755 },
  );
  process.chdir(tempRoot);
  process.env.PATH = `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`;
});

afterEach(() => {
  if (firstRun && !firstRun.killed) firstRun.kill('SIGTERM');
  process.chdir(ORIGINAL_CWD);
});

describe('sp script', () => {
  it('prints text by default and json with --json', async () => {
    const baseEnv = { ...process.env, PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}` };

    const plain = spawn('bun', ['src/index.ts', 'script', 'echo', '--vars', 'name=world', '--user-dir', tempRoot], {
      cwd: ORIGINAL_CWD,
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const plainResult = await waitForExit(plain);
    expect(plainResult.code).toBe(0);
    expect(plainResult.stdout).toContain('hello');

    const json = spawn('bun', ['src/index.ts', 'script', 'echo', '--vars', 'name=world', '--user-dir', tempRoot, '--json'], {
      cwd: ORIGINAL_CWD,
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const jsonResult = await waitForExit(json);
    expect(jsonResult.code).toBe(0);
    expect(JSON.parse(jsonResult.stdout).success).toBe(true);
  });

  it('returns 75 when single-instance lock busy', async () => {
    const baseEnv = { ...process.env, PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}` };
    const lockPath = join(tempRoot, 'script.lock');

    firstRun = spawn('bun', ['src/index.ts', 'script', 'echo', '--vars', 'name=world', '--user-dir', tempRoot, '--single-instance', lockPath], {
      cwd: ORIGINAL_CWD,
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    const second = spawn('bun', ['src/index.ts', 'script', 'echo', '--vars', 'name=world', '--user-dir', tempRoot, '--single-instance', lockPath], {
      cwd: ORIGINAL_CWD,
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const secondResult = await waitForExit(second);
    const firstResult = await waitForExit(firstRun);

    expect(secondResult.code).toBe(75);
    expect(firstResult.code).toBe(0);
    expect(firstResult.stdout).toContain('hello');
  });
});
