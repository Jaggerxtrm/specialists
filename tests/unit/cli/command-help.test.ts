import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function captureIndexHelp(args: string[]): string {
  const entry = join(process.cwd(), 'dist', 'index.js');
  return execFileSync('bun', [entry, ...args], { encoding: 'utf-8' });
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

  it('run --help documents --background as the agent-pane dispatch form', () => {
    const out = captureIndexHelp(['run', '--help']);
    expect(out).toContain('--background');
    expect(out).toContain('Required from an agent pane');
    // The `&` form must stay marked as insufficient, not as the recommendation.
    expect(out).toMatch(/`&` is not sufficient|interactive shells only/);
  });

  // xtrm-wiy5n.4.21: --background was implemented, parsed, and silently dropped from
  // help. Nothing caught it. This test is the guard: every flag parseArgs accepts must
  // appear in `sp run --help`, so help and implementation cannot drift apart again.
  it('every run flag parsed by run.ts appears in run --help', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'cli', 'run.ts'), 'utf-8');
    const parsed = [...source.matchAll(/token === '(--[a-z0-9-]+)'/g)].map(m => m[1]);
    expect(parsed.length).toBeGreaterThan(10);

    // Rejection stubs: parsed only to emit a removal error, deliberately undocumented.
    const rejected = new Set(['--no-worktree']);
    const out = captureIndexHelp(['run', '--help']);
    const undocumented = parsed.filter(f => !rejected.has(f) && !out.includes(f));

    expect(undocumented).toEqual([]);
  });

  it('merge --help marks the command broken without executable guidance', () => {
    const out = captureIndexHelp(['merge', '--help']);
    expect(out).toContain('[broken]');
    expect(out).not.toContain('sp epic merge');
    expect(out).not.toContain('specialists merge unitAI');
  });

  it('feed --help documents single-job and global follow modes', () => {
    const out = captureIndexHelp(['feed', '--help']);
    expect(out).toContain('specialists feed <job-id>');
    expect(out).toContain('specialists feed -f');
    expect(out).toContain('--forever');
  });

  it('forensic --help documents persisted forensic event queries', () => {
    const out = captureIndexHelp(['forensic', '--help']);
    expect(out).toContain('xtrm.forensic.v1');
    expect(out).toContain('--family <name>');
    expect(out).toContain('--event-name <name>');
  });

  it('integration --help documents BOTH the write and the read verb', () => {
    const out = captureIndexHelp(['integration', '--help']);
    expect(out).toContain('xtrm.branch.integration.v1');
    // write verb (#201)
    expect(out).toContain('specialists integration record');
    expect(out).toContain('--source-branch <b>');
    // read verb (#203)
    expect(out).toContain('specialists integration list');
    expect(out).toContain('--target-branch <b>');
    expect(out).toContain('--job <job-id>');
    expect(out).toContain('git stays the merge authority');
  });

  // --help must be reachable at the verb level too, for both verbs.
  it.each(['record', 'list'])('integration %s --help reaches the same help block', (verb) => {
    expect(captureIndexHelp(['integration', verb, '--help']))
      .toContain('specialists integration list');
  });

  it('metrics --help documents Prometheus projection label discipline', () => {
    const out = captureIndexHelp(['metrics', '--help']);
    expect(out).toContain('Prometheus text format');
    expect(out).toContain('--since <5m|iso>');
    expect(out).toContain('Opaque ids');
  });

  it('status --help describes sections it reports', () => {
    const out = captureIndexHelp(['status', '--help']);
    expect(out).toContain('Sections include:');
    expect(out).toContain('active background jobs');
  });

  it('clean --help describes TTL and cleanup modes', () => {
    const out = captureIndexHelp(['clean', '--help']);
    expect(out).toContain('Clean specialist runtime artifacts');
    expect(out).toContain('SPECIALISTS_JOB_TTL_DAYS');
    expect(out).toContain('never removes SQLite artifacts');
    expect(out).toContain('--all');
    expect(out).toContain('--keep <n>');
    expect(out).toContain('--dry-run');
  });

  it('db --help documents legacy migration scope', () => {
    const out = captureIndexHelp(['db', '--help']);
    expect(out).toContain('maintenance and migration');
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
    expect(out).toContain('config <get|set|show>');
    expect(out).toContain('specialists edit');
    expect(out).toContain('--name <specialist>');
    expect(out).toContain('--resolved');
  });

  it('edit --help documents global positional form and global set/get', () => {
    const out = captureIndexHelp(['edit', '--help']);
    expect(out).toContain('specialists edit --global [name.field value]');
    expect(out).toContain('specialists edit --global --set name.execution.model <value>');
    expect(out).toContain('specialists edit --global --get name.execution.model');
  });

  it('nested epic and db help exits before runtime access', () => {
    expect(captureIndexHelp(['epic', 'list', '--help'])).toContain('specialists epic list [--unresolved] [--json]');
    expect(captureIndexHelp(['epic', 'status', '--help'])).toContain('specialists epic status <epic-id> [--json]');
    expect(captureIndexHelp(['epic', 'sync', '--help'])).toContain('specialists epic sync <epic-id> [--apply] [--json]');
    expect(captureIndexHelp(['epic', 'abandon', '--help'])).toContain('specialists epic abandon <epic-id> --reason <text>');
    expect(captureIndexHelp(['epic', 'merge', '--help'])).toMatch(/specialists epic merge <epic-id>.*\[broken\]/);
    expect(captureIndexHelp(['epic', '--help'])).not.toContain('specialists epic merge unitAI');
    expect(captureIndexHelp(['db', 'setup', '--help'])).toContain('specialists db <setup|backfill|vacuum|prune|extract|stats|benchmark-export>');
  });

  it('top-level help advertises only current epic/report surfaces', () => {
    const out = captureIndexHelp(['--help']);
    expect(out).toContain('epic sync');
    expect(out).toContain('epic abandon');
    expect(out).not.toContain('epic resolve');
    expect(out).not.toContain('specialists report list');
  });
});
