import { afterEach, describe, expect, it, vi } from 'vitest';

const fsMocks = {
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  watch: vi.fn(() => ({ close: vi.fn() })),
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
};

vi.mock('node:fs', () => fsMocks);

describe('feed CLI', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
    vi.resetModules();
    Object.values(fsMocks).forEach((mockFn) => {
      if ('mockReset' in mockFn) mockFn.mockReset();
    });
  });

  it('prints usage and exits when no job id is provided without --follow', async () => {
    process.argv = ['node', 'specialists', 'feed'];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/feed.js');

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith('Usage: specialists feed --job <job-id> [--follow]');
  });

  it('supports global follow mode when -f is used without a job id', async () => {
    process.argv = ['node', 'specialists', 'feed', '-f'];
    fsMocks.existsSync.mockReturnValue(false);
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      output.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(output.join('\n')).toContain('No jobs to follow.');
  });

  it('prints prefixed events for completed jobs in global follow mode', async () => {
    process.argv = ['node', 'specialists', 'feed', '-f'];
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['abc123']);
    fsMocks.readFileSync.mockReturnValue('{"t":1710000000000,"type":"toolcall","tool":"bash"}\n');

    const { Supervisor } = await import('../../../src/specialist/supervisor.js');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'abc123',
      specialist: 'code-review',
      status: 'done',
      bead_id: 'unitAI-9re',
      started_at_ms: 1710000000000,
    });

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const combined = logs.join('\n');
    expect(combined).toContain('abc123');
    expect(combined).toContain('code-review');
    expect(combined).toContain('unitAI-9re');
    expect(combined).toContain('toolcall');
    expect(combined).toContain('bash');
  });

  it('replays backlog oldest first so newest lines end up at the bottom', async () => {
    process.argv = ['node', 'specialists', 'feed', '-f'];
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readdirSync.mockReturnValue(['new222', 'old111']);
    fsMocks.readFileSync.mockImplementation((path: string) => {
      if (path.includes('old111/status.json')) return JSON.stringify({ id: 'old111', specialist: 'older', status: 'done', bead_id: 'unitAI-old', started_at_ms: 1710000000000 });
      if (path.includes('new222/status.json')) return JSON.stringify({ id: 'new222', specialist: 'newer', status: 'done', bead_id: 'unitAI-new', started_at_ms: 1810000000000 });
      if (path.includes('old111/events.jsonl')) return '{"t":1710000000000,"type":"done"}\n';
      if (path.includes('new222/events.jsonl')) return '{"t":1810000000000,"type":"done"}\n';
      return '';
    });

    const { Supervisor } = await import('../../../src/specialist/supervisor.js');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'old111') return { id: 'old111', specialist: 'older', status: 'done', bead_id: 'unitAI-old', started_at_ms: 1710000000000 } as any;
      if (id === 'new222') return { id: 'new222', specialist: 'newer', status: 'done', bead_id: 'unitAI-new', started_at_ms: 1810000000000 } as any;
      return null as any;
    });

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('old111');
    expect(logs[1]).toContain('new222');
  });
});
