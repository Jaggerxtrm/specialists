import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';
import type { TimelineEvent } from '../../../src/specialist/timeline-events.js';

let tempRoot: string;

const sqliteState = {
  statuses: [] as SupervisorStatus[],
  events: new Map<string, TimelineEvent[]>(),
};

vi.mock('../../../src/specialist/observability-sqlite.js', () => ({
  createObservabilitySqliteClientAtPath: () => ({
    listStatuses: () => sqliteState.statuses,
    readEvents: (jobId: string) => sqliteState.events.get(jobId) ?? [],
    close: vi.fn(),
  }),
}));

function seedJob(jobId: string, worktreePath: string = tempRoot): void {
  const status: SupervisorStatus = {
    id: jobId,
    specialist: 'reviewer',
    status: 'cancelled',
    started_at_ms: 1000,
    last_event_at_ms: 3000,
    pid: 123,
    bead_id: 'unitAI-log',
    branch: 'feature/log',
    worktree_path: worktreePath,
    model: 'gpt-5.3-codex',
    backend: 'openai-codex',
  };
  sqliteState.statuses = [status];
  sqliteState.events.set(jobId, [
    { t: 1000, seq: 1, type: 'run_start', specialist: 'reviewer', bead_id: 'unitAI-log' },
    { t: 1500, seq: 2, type: 'tool', tool: 'bash', phase: 'start', args: { command: 'echo noisy' } },
    { t: 1700, seq: 3, type: 'retry', phase: 'start' },
    { t: 1705, seq: 4, type: 'retry', phase: 'start' },
    { t: 2000, seq: 5, type: 'control_signal', action: 'stop_requested', source: 'cli', pid: 123, previous_status: 'running', next_status: 'cancelled', reason: 'operator_stop' },
    { t: 3000, seq: 6, type: 'status_change', previous_status: 'running', status: 'cancelled' },
  ] as TimelineEvent[]);
}

describe('log CLI', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'sp-log-test-'));
    sqliteState.statuses = [];
    sqliteState.events.clear();
    mkdirSync(join(tempRoot, '.specialists', 'db'), { recursive: true });
    writeFileSync(join(tempRoot, '.specialists', 'db', 'observability.db'), '');
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('prints lean runtime rows with compact worktree and control signal detail', async () => {
    seedJob('joblog');
    process.argv = ['node', 'specialists', 'log', 'joblog'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => logs.push(String(msg ?? '')));

    const { run } = await import('../../../src/cli/log.js');
    await run();

    const output = logs.join('\n');
    expect(output).toContain('joblog');
    expect(output).toContain('reviewer');
    expect(output).toContain('bead=unitAI-log');
    expect(output).toContain(`worktree=${tempRoot.split('/').pop()}`);
    expect(output).toContain('CTRL');
    expect(output.match(/phase=start/g)).toHaveLength(1);
    expect(output).not.toContain('tool=bash');
    expect(output).not.toContain(`path=${tempRoot}`);
    expect(output).toContain('action=stop_requested');
    expect(output).toContain('status=running->cancelled');
  });





  it('discovers a single child repo when run from its parent directory', async () => {
    rmSync(join(tempRoot, '.specialists'), { recursive: true, force: true });
    const repoRoot = join(tempRoot, 'onlyrepo');
    mkdirSync(join(repoRoot, '.specialists', 'db'), { recursive: true });
    writeFileSync(join(repoRoot, '.specialists', 'db', 'observability.db'), '');
    seedJob('parentjob', repoRoot);
    process.argv = ['node', 'specialists', 'log', 'parentjob'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => logs.push(String(msg ?? '')));

    const { run } = await import('../../../src/cli/log.js');
    await run();

    expect(logs.join('\n')).toContain('worktree=onlyrepo');
    expect(logs.join('\n')).toContain('parentjob');
  });

  it('can include agent-internal events when --all-events is set', async () => {
    seedJob('jobverbose');
    process.argv = ['node', 'specialists', 'log', 'jobverbose', '--all-events'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => logs.push(String(msg ?? '')));

    const { run } = await import('../../../src/cli/log.js');
    await run();

    expect(logs.join('\n')).toContain('tool=bash');
  });

  it('prints fallback_step events in chronological order with telemetry fields', async () => {
    sqliteState.events.set('jobfallback', [
      { t: 1000, seq: 1, type: 'fallback_step', event: 'fallback_step', attempt_n: 2, model_tried: 'anthropic/claude-sonnet-4-6', error_class: 'transient', terminal: false },
      { t: 2000, seq: 2, type: 'fallback_step', event: 'fallback_step', attempt_n: 3, model_tried: 'openai-codex/gpt-5.4', error_class: 'timeout', terminal: true },
    ] as TimelineEvent[]);
    sqliteState.statuses = [{
      id: 'jobfallback',
      specialist: 'reviewer',
      status: 'error',
      started_at_ms: 1000,
      last_event_at_ms: 2000,
      pid: 123,
      bead_id: 'unitAI-log',
      branch: 'feature/log',
      worktree_path: tempRoot,
      model: 'openai-codex/gpt-5.4',
      backend: 'openai-codex',
    }];
    process.argv = ['node', 'specialists', 'log', 'jobfallback', '--all-events'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => logs.push(String(msg ?? '')));

    const { run } = await import('../../../src/cli/log.js');
    await run();

    const output = logs.join('\n');
    const firstIndex = output.indexOf('attempt_n":2');
    const secondIndex = output.indexOf('attempt_n":3');
    expect(output).toContain('FALLBA');
    expect(output).toContain('event":"fallback_step"');
    expect(output).toContain('model_tried":"anthropic/claude-sonnet-4-6"');
    expect(output).toContain('error_class":"transient"');
    expect(output).toContain('terminal":true');
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(output).not.toContain('stack');
    expect(output).not.toContain('prompt');
  });

  it('emits JSON rows with full event payload', async () => {
    seedJob('jobjson');
    process.argv = ['node', 'specialists', 'log', 'jobjson', '--json', '--limit', '1'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => logs.push(String(msg ?? '')));

    const { run } = await import('../../../src/cli/log.js');
    await run();

    const row = JSON.parse(logs[0]) as { job_id: string; bead_id: string; event: { type: string }; forensic_event: any };
    expect(row.job_id).toBe('jobjson');
    expect(row.bead_id).toBe('unitAI-log');
    expect(row.event.type).toBe('status_change');
    expect(row.forensic_event.schema_version).toBe('xtrm.forensic.v1');
    expect(row.forensic_event.resource.participant_role).toBe('reviewer');
    expect(row.forensic_event.correlation.job_id).toBe('jobjson');
  });
});
