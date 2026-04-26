import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

function captureIndexHelp(args: string[]): string {
  const entry = join(process.cwd(), 'dist', 'index.js');
  return execFileSync(process.execPath, [entry, ...args], { encoding: 'utf-8' });
}

describe('command-specific --help', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('init --help mentions symlink prerequisite and sync-defaults', () => {
    const out = captureIndexHelp(['init', '--help']);
    expect(out).toContain('specialists onboarding command');
    expect(out).toContain('.claude/skills and .pi/skills must already be symlinks');
    expect(out).toContain('--sync-defaults');
    expect(out).toContain('Human-only');
  });

  it('run --help distinguishes tracked and ad-hoc modes', () => {
    const out = captureIndexHelp(['run', '--help']);
    expect(out).toContain('tracked:');
    expect(out).toContain('--bead');
    expect(out).toContain('ad-hoc:');
    expect(out).toContain('--prompt');
    expect(out).toContain('does not disable bead reading');
  });

  it('feed --help documents single-job and global follow modes', () => {
    const out = captureIndexHelp(['feed', '--help']);
    expect(out).toContain('specialists feed <job-id>');
    expect(out).toContain('specialists feed -f');
    expect(out).toContain('--forever');
  });

  it('status --help describes sections it reports', () => {
    const out = captureIndexHelp(['status', '--help']);
    expect(out).toContain('Sections include:');
    expect(out).toContain('active background jobs');
  });

  it('clean --help describes TTL and cleanup modes', () => {
    const out = captureIndexHelp(['clean', '--help']);
    expect(out).toContain('Purge completed job directories');
    expect(out).toContain('SPECIALISTS_JOB_TTL_DAYS');
    expect(out).toContain('never removes SQLite artifacts');
    expect(out).toContain('--all');
    expect(out).toContain('--keep <n>');
    expect(out).toContain('--dry-run');
  });

  it('db --help documents legacy migration scope', () => {
    const out = captureIndexHelp(['db', '--help']);
    expect(out).toContain('legacy/migration tooling');
    expect(out).toContain('human-only');
    expect(out).toContain('XDG_DATA_HOME');
  });

  it('doctor --help describes checks it performs', () => {
    const out = captureIndexHelp(['doctor', '--help']);
    expect(out).toContain('Checks:');
    expect(out).toContain('.specialists/ runtime directories');
    expect(out).toContain('zombie job detection');
  });

  it('list --help describes project-only scope', () => {
    const out = captureIndexHelp(['list', '--help']);
    expect(out).toContain('current project');
    expect(out).toContain('project-only');
    expect(out).not.toContain('--scope <project|user>');
  });

  it('config --help documents get/set and targeting flags', () => {
    const out = captureIndexHelp(['config', '--help']);
    expect(out).toContain('config <get|set>');
    expect(out).toContain('config/specialists/');
    expect(out).toContain('--name <specialist>');
    expect(out).toContain('stall_timeout_ms');
  });
});
