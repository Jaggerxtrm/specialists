// tests/unit/cli/help.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

function captureTopLevelHelp(): string {
  const entry = join(process.cwd(), 'dist', 'index.js');
  return execFileSync(process.execPath, [entry, 'help'], { encoding: 'utf-8' });
}

describe('help CLI — run()', () => {
  it('prints usage section', () => {
    const combined = captureTopLevelHelp();
    expect(combined).toContain('Usage:');
    expect(combined).toContain('specialists|sp [command]');
  });

  it('teaches bead-first workflow', () => {
    const combined = captureTopLevelHelp();
    expect(combined).toContain('bd create');
    expect(combined).toContain('--bead');
    expect(combined).toContain('Tracked work');
  });

  it('distinguishes tracked vs ad-hoc work', () => {
    const combined = captureTopLevelHelp();
    expect(combined).toContain('Ad-hoc work');
    expect(combined).toContain('--prompt');
  });

  it('mentions --context-depth and --no-beads semantics', () => {
    const combined = captureTopLevelHelp();
    expect(combined).toContain('--context-depth');
    expect(combined).toContain('--no-beads');
    expect(combined).toContain('does not disable bead reading');
  });

  it('lists core commands plainly', () => {
    const combined = captureTopLevelHelp();
    expect(combined).toContain('Core commands:');
    for (const cmd of ['init', 'list', 'config', 'run', 'serve', 'script', 'feed', 'result', 'clean', 'stop', 'report', 'status', 'doctor', 'quickstart']) {
      expect(combined, `missing command: ${cmd}`).toContain(cmd);
    }
  });

  it('includes db setup and deprecated setup/install commands', () => {
    const combined = captureTopLevelHelp();
    expect(combined).toContain('db setup');
    expect(combined).toContain('[deprecated] Use specialists init instead');
  });

  it('mentions xtrm worktree commands', () => {
    const combined = captureTopLevelHelp();
    expect(combined).toContain('xtrm worktree commands:');
    expect(combined).toContain('xt pi');
    expect(combined).toContain('xt end');
  });

  it('references quickstart and command-specific help', () => {
    const combined = captureTopLevelHelp();
    expect(combined).toContain('specialists quickstart');
    expect(combined).toContain('specialists run --help');
    expect(combined).toContain('specialists init --help');
  });

  it('states project-only model', () => {
    const combined = captureTopLevelHelp();
    expect(combined).toContain('project-only');
  });
});
