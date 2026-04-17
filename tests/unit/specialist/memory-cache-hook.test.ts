import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

describe('specialists-memory-cache-sync hook', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'memory-hook-'));
    mkdirSync(join(tempDir, 'bin'), { recursive: true });

    const fakeSpecialistsPath = join(tempDir, 'bin', 'specialists');
    const logPath = join(tempDir, 'calls.log');
    writeFileSync(fakeSpecialistsPath, `#!/usr/bin/env bash\necho "$@" >> "${logPath}"\n`, 'utf-8');
    spawnSync('chmod', ['+x', fakeSpecialistsPath]);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function runHook(command: string): string {
    const hookPath = join(process.cwd(), 'config', 'hooks', 'specialists-memory-cache-sync.mjs');
    const payload = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command },
      cwd: tempDir,
    };

    spawnSync('node', [hookPath], {
      input: JSON.stringify(payload),
      env: {
        ...process.env,
        PATH: `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`,
      },
      encoding: 'utf-8',
    });

    const logPath = join(tempDir, 'calls.log');
    try {
      return readFileSync(logPath, 'utf-8');
    } catch {
      return '';
    }
  }

  it('triggers sync on git commit', () => {
    const calls = runHook('git commit -m "x"');
    expect(calls).toContain('memory sync --force --json');
  });

  it('triggers refresh on xt memory update', () => {
    const calls = runHook('xt memory update --note "new"');
    expect(calls).toContain('memory refresh --json');
  });
});
