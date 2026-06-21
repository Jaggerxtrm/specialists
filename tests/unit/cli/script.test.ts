import { describe, expect, it } from 'vitest';

describe('script CLI', () => {
  it('parses flags and variables (--project-dir)', async () => {
    const { parseArgs } = await import('../../../src/cli/script.js');
    const parsed = parseArgs(['echo', '--vars', 'name=world', '--template', 'hi', '--model', 'mock/model', '--thinking', 'low', '--project-dir', '/tmp/proj', '--db-path', '/tmp/db/observability.db', '--timeout-ms', '2500', '--json', '--allow-local-scripts', '--allow-write-capable', '--single-instance', '/tmp/lock', '--no-trace']);

    expect(parsed).toMatchObject({
      specialist: 'echo',
      variables: { name: 'world' },
      template: 'hi',
      modelOverride: 'mock/model',
      thinking: 'low',
      projectDir: '/tmp/proj',
      dbPath: '/tmp/db/observability.db',
      timeoutMs: 2500,
      json: true,
      singleInstance: '/tmp/lock',
      trace: false,
      allowLocalScripts: true,
      allowWriteCapable: true,
    });
  });

  it('defaults dangerous trust flags off', async () => {
    const { parseArgs } = await import('../../../src/cli/script.js');
    const parsed = parseArgs(['echo', '--project-dir', '/tmp/proj']);
    expect(parsed.allowLocalScripts).toBe(false);
    expect(parsed.allowWriteCapable).toBe(false);
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
});
