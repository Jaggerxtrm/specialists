import { afterEach, describe, expect, it, vi } from 'vitest';

async function captureIndexHelp(args: string[]): Promise<string> {
  const originalArgv = process.argv;
  const logs: string[] = [];
  const errors: string[] = [];

  process.argv = ['node', 'specialists', ...args];
  vi.spyOn(console, 'log').mockImplementation((msg?: any) => {
    logs.push(String(msg ?? ''));
  });
  vi.spyOn(console, 'error').mockImplementation((msg?: any) => {
    errors.push(String(msg ?? ''));
  });

  await import(`../../../src/index.ts?test=${Date.now()}-${Math.random()}`);
  process.argv = originalArgv;
  return [...logs, ...errors].join('\n');
}

describe('command-specific --help', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('init --help mentions sole onboarding command and force-workflow', async () => {
    const out = await captureIndexHelp(['init', '--help']);
    expect(out).toContain('sole onboarding command');
    expect(out).toContain('--force-workflow');
    expect(out).toContain('AGENTS.md and CLAUDE.md');
  });

  it('run --help distinguishes tracked and ad-hoc modes', async () => {
    const out = await captureIndexHelp(['run', '--help']);
    expect(out).toContain('tracked:');
    expect(out).toContain('--bead');
    expect(out).toContain('ad-hoc:');
    expect(out).toContain('--prompt');
    expect(out).toContain('does not disable bead reading');
  });

  it('feed --help documents single-job and global follow modes', async () => {
    const out = await captureIndexHelp(['feed', '--help']);
    expect(out).toContain('specialists feed <job-id>');
    expect(out).toContain('specialists feed -f');
    expect(out).toContain('--forever');
  });

  it('status --help describes sections it reports', async () => {
    const out = await captureIndexHelp(['status', '--help']);
    expect(out).toContain('Sections include:');
    expect(out).toContain('active background jobs');
  });

  it('doctor --help describes checks it performs', async () => {
    const out = await captureIndexHelp(['doctor', '--help']);
    expect(out).toContain('Checks:');
    expect(out).toContain('.specialists/ runtime directories');
    expect(out).toContain('zombie job detection');
  });

  it('list --help describes project-only scope', async () => {
    const out = await captureIndexHelp(['list', '--help']);
    expect(out).toContain('current project');
    expect(out).toContain('project-only');
    expect(out).not.toContain('--scope <project|user>');
  });
});
