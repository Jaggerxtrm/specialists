import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ORIGINAL_CWD = process.cwd();

vi.mock('../../../src/specialist/script-runner.js', () => ({
  runScriptSpecialist: vi.fn(),
}));

describe('script CLI', () => {
  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    vi.restoreAllMocks();
  });

  it('parses flags and variables (--project-dir)', async () => {
    const { parseArgs } = await import('../../../src/cli/script.js');
    const parsed = parseArgs(['echo', '--vars', 'name=world', '--template', 'hi', '--model', 'mock/model', '--thinking', 'low', '--project-dir', '/tmp/proj', '--db-path', '/tmp/db', '--timeout-ms', '2500', '--json', '--single-instance', '/tmp/lock', '--no-trace']);

    expect(parsed).toMatchObject({
      specialist: 'echo',
      variables: { name: 'world' },
      template: 'hi',
      modelOverride: 'mock/model',
      thinking: 'low',
      projectDir: '/tmp/proj',
      dbPath: '/tmp/db',
      timeoutMs: 2500,
      json: true,
      singleInstance: '/tmp/lock',
      trace: false,
    });
  });

  it('accepts --user-dir as a deprecated alias for --project-dir', async () => {
    const { parseArgs } = await import('../../../src/cli/script.js');
    const projectFlag = parseArgs(['echo', '--project-dir', '/tmp/proj']);
    const userFlag = parseArgs(['echo', '--user-dir', '/tmp/proj']);
    expect(projectFlag.projectDir).toBe('/tmp/proj');
    expect(userFlag.projectDir).toBe('/tmp/proj');
  });

  it('maps exit codes from result types', async () => {
    const { mapExitCode } = await import('../../../src/cli/script.js');
    expect(mapExitCode({ success: false, error: 'x', error_type: 'specialist_not_found' })).toBe(2);
    expect(mapExitCode({ success: false, error: 'x', error_type: 'template_variable_missing' })).toBe(3);
    expect(mapExitCode({ success: false, error: 'x', error_type: 'auth' })).toBe(4);
    expect(mapExitCode({ success: false, error: 'x', error_type: 'timeout' })).toBe(5);
    expect(mapExitCode({ success: false, error: 'x', error_type: 'invalid_json' })).toBe(6);
    expect(mapExitCode({ success: false, error: 'x', error_type: 'output_too_large' })).toBe(7);
    expect(mapExitCode({ success: true, output: 'ok', meta: { specialist: 'echo', model: 'm', duration_ms: 1, trace_id: 't' } })).toBe(0);
  });

  it('runs script runner with db path and trace flag', async () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), 'sp-script-'));
    mkdirSync(join(sandboxRoot, '.specialists', 'user'), { recursive: true });
    process.chdir(sandboxRoot);

    const { run } = await import('../../../src/cli/script.js');
    const runner = await import('../../../src/specialist/script-runner.js');
    vi.mocked(runner.runScriptSpecialist).mockResolvedValue({
      success: true,
      output: 'hello',
      meta: { specialist: 'echo', model: 'mock/model', duration_ms: 1, trace_id: 'trace-1' },
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => { throw new Error(`exit:${String(code ?? 0)}`); }) as never);

    await expect(run(['echo', '--db-path', '/tmp/db', '--no-trace'])).rejects.toThrow('exit:0');
    expect(logSpy).toHaveBeenCalledWith('hello');
    expect(vi.mocked(runner.runScriptSpecialist)).toHaveBeenCalledWith(
      expect.objectContaining({ specialist: 'echo', trace: false }),
      expect.objectContaining({ observabilityDbPath: '/tmp/db' }),
    );

    exitSpy.mockRestore();
  });
});
