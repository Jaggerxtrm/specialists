import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const INSTALL_SCRIPT = join(process.cwd(), 'bin', 'install.js');

async function runInstall() {
  try {
    const result = await execFileAsync(process.execPath, [INSTALL_SCRIPT]);
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

describe('install script (deprecated)', () => {
  it('shows deprecation message and redirects to init', async () => {
    const result = await runInstall();
    expect(result.stdout).toContain('DEPRECATED');
    expect(result.stdout).toContain('specialists init');
  });
});