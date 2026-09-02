// tests/unit/specialist/runner-script-exec.test.ts
// Real-execution contract for runScript: no child_process mocks. Proves stdout
// and stderr are captured on success and failure, exit status is exact, and
// spawn errors/timeouts are represented (unitAI-x64ys).
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runScript, sanitizeScriptName } from '../../../src/specialist/runner.js';

const cwd = tmpdir();

describe('runScript execution contract', () => {
  it('captures exact nonzero exit code', () => {
    const result = runScript('exit 7', cwd);
    expect(result.exitCode).toBe(7);
  });

  it('captures stdout and stderr on success', () => {
    const result = runScript('echo out-line; echo err-line 1>&2', cwd);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('out-line');
    expect(result.stderr).toContain('err-line');
  });

  it('captures stdout and stderr on failure', () => {
    const result = runScript('echo to-stdout; echo to-stderr 1>&2; exit 4', cwd);
    expect(result.exitCode).toBe(4);
    expect(result.output).toContain('to-stdout');
    expect(result.stderr).toContain('to-stderr');
  });

  it('keeps stderr-only failures visible', () => {
    const result = runScript('echo boom 1>&2; exit 1', cwd);
    expect(result.exitCode).toBe(1);
    expect(result.output.trim()).toBe('');
    expect(result.stderr).toContain('boom');
  });

  it('represents spawn errors without leaking the host path', () => {
    const hostPath = '/definitely-not-a-real-cwd-xyz';
    const result = runScript('echo hi', hostPath);
    expect(result.exitCode).not.toBe(0);
    expect(result.spawnError).toBe('ENOENT');
    expect(result.stderr).toContain('spawn error: ENOENT');
    expect(result.stderr).not.toContain(hostPath);
  });

  it('bounds attacker/script output via maxBuffer truncation', () => {
    const result = runScript('yes 0123456789 | head -c 20000000', cwd);
    expect(result.exitCode).not.toBe(0);
    expect(result.output.length).toBeLessThanOrEqual(1024 * 1024 + 2);
  });

  it('renders control-safe bounded script names', () => {
    expect(sanitizeScriptName('check.sh')).toBe('check.sh');
    expect(sanitizeScriptName(':')).toBe(':');
    expect(sanitizeScriptName('bad\x1b[31m"na<me>')).toBe('unknown');
    expect(sanitizeScriptName('bad\u009b31mname')).toBe('bad31mname');
    expect(sanitizeScriptName('TOKEN=secret')).toBe('unknown');
    expect(sanitizeScriptName('x'.repeat(500)).length).toBe(128);
    expect(sanitizeScriptName('\x00\x01')).toBe('unknown');
  });
});
