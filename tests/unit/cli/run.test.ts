// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tmuxUtils from '../../../src/cli/tmux-utils.js';
import * as worktree from '../../../src/specialist/worktree.js';

import { BeadsClient } from '../../../src/specialist/beads.js';
import { SpecialistLoader } from '../../../src/specialist/loader.js';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
import { Supervisor } from '../../../src/specialist/supervisor.js';
import { initSchema } from '../../../src/specialist/observability-sqlite.js';
import { resolveObservabilityDbLocation } from '../../../src/specialist/observability-db.js';
import { buildInjectedObligationsDiffVariables, buildInjectedReviewerDiffVariables, buildInjectedWriterDiffVariables, buildTmuxLiveFeedCommand, resolveBasePin, run, startEventTailer, type RunArgs } from '../../../src/cli/run.js';

function makeRunArgs(overrides: Partial<RunArgs> = {}): RunArgs {
  return {
    name: 'executor',
    prompt: 'x',
    noBeads: false,
    noBeadNotes: false,
    noKeepAlive: false,
    background: false,
    contextDepth: 3,
    outputMode: 'human',
    worktree: true,
    forceJob: false,
    forceStaleBase: false,
    acceptStaleBase: false,
    ...overrides,
  };
}

function createBasePinRepo(): { repoDir: string; baseSha: string } {
  const remoteDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
  const repoDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
  childProcess.execSync('git init --bare', { cwd: remoteDir });
  childProcess.execSync('git init -b main', { cwd: repoDir });
  childProcess.execSync('git config user.email test@example.com', { cwd: repoDir });
  childProcess.execSync('git config user.name Test User', { cwd: repoDir });
  fs.writeFileSync(`${repoDir}/README.md`, 'base\n');
  childProcess.execSync('git add README.md && git commit -m base', { cwd: repoDir, shell: '/bin/bash' as never });
  childProcess.execSync(`git remote add origin ${remoteDir}`, { cwd: repoDir, shell: '/bin/bash' as never });
  childProcess.execSync('git push -u origin main', { cwd: repoDir, shell: '/bin/bash' as never });
  childProcess.execSync('git fetch origin main', { cwd: repoDir, shell: '/bin/bash' as never });
  childProcess.execSync('git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main', { cwd: repoDir });
  const baseSha = childProcess.execSync('git rev-parse HEAD', { cwd: repoDir, encoding: 'utf8' }).trim();
  return { repoDir, baseSha };
}

describe('run CLI base pinning', () => {
  it('records matching declared base', () => {
    const { repoDir, baseSha } = createBasePinRepo();
    expect(resolveBasePin(makeRunArgs({ baseSha, baseRef: 'main' }), repoDir)).toEqual(expect.objectContaining({
      baseShaPinned: baseSha,
      baseShaObserved: baseSha,
      currentSha: baseSha,
      commitsBehind: 0,
      override: false,
    }));
  });

  // ── Coordinator branch ancestry (core xtrm-6hey0.6 / audit P1-03) ──────────
  //
  // provisionWorktree bases a job branch on the dispatching coordinator's
  // integration branch. That branch — not origin/HEAD — is then the job's
  // declared base; pinning against origin/HEAD would report every
  // coordinator-dispatched job as stale_base and refuse the dispatch.

  /** Branch off `main`, add a commit, and leave HEAD on it (as a job worktree would sit). */
  function addCoordinatorBranch(repoDir: string, name = 'xt/coordinator'): string {
    childProcess.execSync(`git checkout -q -b ${name}`, { cwd: repoDir });
    fs.writeFileSync(`${repoDir}/coord.md`, 'coordinator work\n');
    childProcess.execSync('git add coord.md && git commit -m coordinator', { cwd: repoDir, shell: '/bin/bash' as never });
    return childProcess.execSync(`git rev-parse ${name}`, { cwd: repoDir, encoding: 'utf8' }).trim();
  }

  it('pins to the coordinator branch instead of origin/HEAD', () => {
    const { repoDir } = createBasePinRepo();
    const coordinatorSha = addCoordinatorBranch(repoDir);
    expect(resolveBasePin(makeRunArgs(), repoDir, 'xt/coordinator')).toEqual(expect.objectContaining({
      baseShaPinned: coordinatorSha,
      baseShaObserved: coordinatorSha,
      currentSha: coordinatorSha,
      commitsBehind: 0,
      override: false,
    }));
  });

  it('would refuse the same worktree without the coordinator base', () => {
    const { repoDir } = createBasePinRepo();
    addCoordinatorBranch(repoDir);
    // Same repo state, coordinator base omitted -> pins origin/HEAD -> stale.
    // This is the regression the coordinator-base argument exists to prevent.
    expect(() => resolveBasePin(makeRunArgs(), repoDir)).toThrow('"error_code":"stale_base"');
  });

  it('lets an explicit --base-sha override the coordinator base', () => {
    const { repoDir, baseSha } = createBasePinRepo();
    addCoordinatorBranch(repoDir);
    // Direct operator intent wins over the inherited coordinator base.
    expect(() => resolveBasePin(makeRunArgs({ baseSha }), repoDir, 'xt/coordinator'))
      .toThrow('"error_code":"stale_base"');
  });

  it('refuses stale base by default', () => {
    const { repoDir, baseSha } = createBasePinRepo();
    fs.writeFileSync(`${repoDir}/README.md`, 'base\nchange\n');
    childProcess.execSync('git add README.md && git commit -m change', { cwd: repoDir, shell: '/bin/bash' as never });
    expect(() => resolveBasePin(makeRunArgs({ baseSha, baseRef: 'main' }), repoDir)).toThrow('"error_code":"stale_base"');
  });

  it('accepts stale base with reason', () => {
    const { repoDir, baseSha } = createBasePinRepo();
    fs.writeFileSync(`${repoDir}/README.md`, 'base\nchange\n');
    childProcess.execSync('git add README.md && git commit -m change', { cwd: repoDir, shell: '/bin/bash' as never });
    expect(resolveBasePin(makeRunArgs({ baseSha, baseRef: 'main', acceptStaleBase: true, staleBaseReason: 'known divergence' }), repoDir)).toEqual(expect.objectContaining({
      baseShaPinned: baseSha,
      override: true,
    }));
  });

  it('surfaces unknown base fetch failure', () => {
    const { repoDir, baseSha } = createBasePinRepo();
    expect(() => resolveBasePin(makeRunArgs({ baseSha, baseRef: 'missing' }), repoDir)).toThrow(/error_code.*base_fetch_failed/);

    try {
      resolveBasePin(makeRunArgs({ baseSha, baseRef: 'missing' }), repoDir);
      throw new Error('expected base fetch refusal');
    } catch (error) {
      const envelope = JSON.parse((error as Error).message) as Record<string, unknown>;
      expect(envelope.ok).toBe(false);
      expect(envelope.error_code).toBe('base_fetch_failed');
      expect(envelope.blocked_by).toEqual(['fetch_or_resolve_failure']);
      expect(envelope.next_safe_action).toBe('verify network/remote/declared base ref is reachable, or rerun with --accept-stale-base --reason <text> if intentional');
      expect(envelope.worktree_path).toBe(repoDir);
    }
  });
});

describe('tmux live feed command', () => {
  it('starts the run in the background, waits for handoff, then follows sp feed', () => {
    const command = buildTmuxLiveFeedCommand({
      cwd: '/repo/work tree',
      runCommand: "bun /repo/src/index.ts run explorer --prompt 'hello'",
      handoffPath: '/repo/.specialists/jobs/.bg-job-id-sp-explorer-abc123',
      feedCommandPrefix: "bun /repo/src/index.ts feed",
    });

    expect(command).toContain('/bin/bash -c');
    expect(command).toContain('/repo/work tree');
    expect(command).toContain("/repo/.specialists/jobs/.bg-job-id-sp-explorer-abc123.log");
    expect(command).toContain('run_pid=$!');
    expect(command).not.toContain('&;');
    expect(command).toContain('tmux live feed: %s');
    expect(command).toContain('bun /repo/src/index.ts feed "$job_id" --follow');
    expect(command).toContain('wait "$run_pid"');
  });
});

describe('run JSON tailer', () => {
  it('reads SQLite timeline events and emits pi-compatible NDJSON', () => {
    const root = fs.mkdtempSync(join(tmpdir(), 'sp-run-json-'));
    const jobsDir = join(root, '.specialists', 'jobs');
    fs.mkdirSync(jobsDir, { recursive: true });
    const location = resolveObservabilityDbLocation(root);
    fs.mkdirSync(location.dbDirectory, { recursive: true });
    const { Database } = require('bun:sqlite');
    const db = new Database(location.dbPath);
    initSchema(db);
    const now = Date.now();
    const worktreePath = join(root, 'job-worktree');
    const status = { id: 'job-json', specialist: 'explorer', status: 'done', started_at_ms: now, model: 'nano-gpt/kimi-k2.6', backend: 'nano-gpt', worktree_path: worktreePath };
    db.run(
      `INSERT INTO specialist_jobs (job_id, specialist, status, status_json, updated_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
      ['job-json', 'explorer', 'done', JSON.stringify(status), now],
    );
    const events = [
      { t: now, seq: 1, type: 'run_start', specialist: 'explorer' },
      { t: now + 1, seq: 2, type: 'text', content: 'ok', char_count: 2 },
      { t: now + 2, seq: 3, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1, output: 'ok' },
    ];
    for (const event of events) {
      db.run(
        `INSERT INTO specialist_events (job_id, seq, specialist, t, type, event_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['job-json', event.seq, 'explorer', event.t, event.type, JSON.stringify(event)],
      );
    }
    db.close();

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const writes: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });

    const stop = startEventTailer('job-json', jobsDir, 'json', 'explorer');
    stop();

    const output = writes.join('').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    expect(output.map((event) => event.type)).toEqual([
      'session',
      'agent_start',
      'message_start',
      'message_update',
      'message_update',
      'message_update',
      'message_end',
      'agent_end',
      'agent_settled',
    ]);
    expect(output[0]).toMatchObject({ type: 'session', cwd: worktreePath });
    expect(output.find((event) => event.type === 'agent_end')).toMatchObject({
      messages: [{ provider: 'nano-gpt', model: 'kimi-k2.6', content: [{ type: 'text', text: 'ok' }] }],
    });

    stdoutSpy.mockRestore();
    cwdSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not replay SQLite events when file fallback activates', () => {
    vi.useFakeTimers();
    const root = fs.mkdtempSync(join(tmpdir(), 'sp-run-json-fallback-'));
    const jobsDir = join(root, '.specialists', 'jobs');
    const jobDir = join(jobsDir, 'job-json');
    fs.mkdirSync(jobDir, { recursive: true });
    const location = resolveObservabilityDbLocation(root);
    fs.mkdirSync(location.dbDirectory, { recursive: true });
    const { Database } = require('bun:sqlite');
    const now = Date.now();
    const timeline = [
      { t: now, seq: 1, type: 'run_start', specialist: 'explorer' },
      { t: now + 1, seq: 2, type: 'text', content: 'ok', char_count: 2 },
      { t: now + 2, seq: 3, type: 'tool', phase: 'start', tool: 'read', tool_call_id: 'call-1', args: { path: 'a.ts' } },
    ];
    fs.writeFileSync(join(jobDir, 'events.jsonl'), `${timeline.map((event) => JSON.stringify(event)).join('\n')}\n`);

    const db = new Database(location.dbPath);
    initSchema(db);
    const status = { id: 'job-json', specialist: 'explorer', status: 'running', started_at_ms: now };
    db.run(
      `INSERT INTO specialist_jobs (job_id, specialist, status, status_json, updated_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
      ['job-json', 'explorer', 'running', JSON.stringify(status), now],
    );
    for (const event of timeline.slice(0, 2)) {
      db.run(
        `INSERT INTO specialist_events (job_id, seq, specialist, t, type, event_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['job-json', event.seq, 'explorer', event.t, event.type, JSON.stringify(event)],
      );
    }
    db.close();

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const writes: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    const stop = startEventTailer('job-json', jobsDir, 'json', 'explorer');

    vi.advanceTimersByTime(100);
    const breaker = new Database(location.dbPath);
    breaker.run('DROP TABLE specialist_events');
    breaker.close();
    vi.advanceTimersByTime(100);
    stop();

    const output = writes.join('').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    expect(output.filter((event) => event.type === 'message_update')).toHaveLength(3);
    expect(output.filter((event) => event.type === 'tool_execution_start')).toHaveLength(1);

    stdoutSpy.mockRestore();
    cwdSpy.mockRestore();
    vi.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('run CLI', () => {
  const originalArgv = process.argv;
  const originalIsTTY = process.stdin.isTTY;

  // Default Supervisor mocks: bypass SQLite-required code paths and forward
  // runOptions to SpecialistRunner.prototype.run (which individual tests spy on
  // to assert what the runner received). Tests that need different supervisor
  // behavior re-spy these methods locally.
  beforeEach(() => {
    vi.spyOn(Supervisor.prototype, 'run').mockImplementation(async function (this: any) {
      const runner = this.opts?.runner;
      const runOptions = this.opts?.runOptions ?? {};
      if (runner && typeof runner.run === 'function') {
        await runner.run(runOptions);
      }
      return 'job-test';
    });
    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-test',
      specialist: 'code-review',
      status: 'done',
      started_at_ms: 0,
      last_event_at_ms: 1000,
      backend: 'google-gemini-cli',
      model: 'gemini',
    } as any);
  });

  afterEach(() => {
    process.argv = originalArgv;
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    vi.restoreAllMocks();
  });

  it('emits deprecation warning for --force-stale-base alias', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--force-stale-base'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue(null);
    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);
    vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'ok',
      backend: 'test',
      model: 'gemini',
      durationMs: 1,
      specialistVersion: '1.0.0',
      promptHash: 'hash',
    });
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await run();

    expect(stderrWrite).toHaveBeenCalledWith('[deprecated] --force-stale-base is deprecated; use --accept-stale-base --reason <text>. Aliased for one release.\n');
  });

  it('falls through from noise-only unstaged files to branch-vs-base reviewer diff', () => {
    const remoteDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
    const repoDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
    childProcess.execSync('git init --bare', { cwd: remoteDir });
    childProcess.execSync('git init -b main', { cwd: repoDir });
    childProcess.execSync('git config user.email test@example.com', { cwd: repoDir });
    childProcess.execSync('git config user.name Test User', { cwd: repoDir });
    childProcess.execSync('mkdir -p src/cli .xtrm', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/src/cli/run.ts`, 'base\n');
    childProcess.execSync('git add src/cli/run.ts && git commit -m base', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync(`git remote add origin ${remoteDir}`, { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git push -u origin main', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git fetch origin main', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main', { cwd: repoDir });
    childProcess.execSync('git checkout -b feature', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/src/cli/run.ts`, 'base\nchange\n');
    childProcess.execSync('git add src/cli/run.ts && git commit -m change', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/.xtrm/SKILL.md`, 'noise\n');

    const variables = buildInjectedReviewerDiffVariables(repoDir);

    expect(variables).toEqual(expect.objectContaining({
      reviewer_diff_source: expect.stringContaining('branch-vs-base diff'),
      reviewer_diff_files: 'src/cli/run.ts',
    }));
    expect(variables.reviewer_diff_files).not.toContain('.xtrm/SKILL.md');
  });

  it('builds obligations_diff from same injected diff source without requiring shell reconstruction', () => {
    const remoteDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
    const repoDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
    childProcess.execSync('git init --bare', { cwd: remoteDir });
    childProcess.execSync('git init -b main', { cwd: repoDir });
    childProcess.execSync('git config user.email test@example.com', { cwd: repoDir });
    childProcess.execSync('git config user.name Test User', { cwd: repoDir });
    childProcess.execSync('mkdir -p src .xtrm', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/src/scan.ts`, 'base\n');
    childProcess.execSync('git add src/scan.ts && git commit -m base', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync(`git remote add origin ${remoteDir}`, { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git push -u origin main', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git fetch origin main', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main', { cwd: repoDir });
    childProcess.execSync('git checkout -b feature', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/src/scan.ts`, 'base\n// TODO(unitAI-abc12): tracked\n');
    childProcess.execSync('git add src/scan.ts && git commit -m change', { cwd: repoDir, shell: '/bin/bash' as never });

    const variables = buildInjectedObligationsDiffVariables(repoDir);

    expect(variables.obligations_diff).toContain('## Obligations Diff Evidence');
    expect(variables.obligations_diff).toContain('branch-vs-base diff');
    expect(variables.obligations_diff).toContain('### Diff hunks');
    expect(variables.obligations_diff).toContain('+// TODO(unitAI-abc12): tracked');
  });

  it('builds writer_diff from the same worktree diff source as reviewer context', () => {
    const remoteDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
    const repoDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
    childProcess.execSync('git init --bare', { cwd: remoteDir });
    childProcess.execSync('git init -b main', { cwd: repoDir });
    childProcess.execSync('git config user.email test@example.com', { cwd: repoDir });
    childProcess.execSync('git config user.name Test User', { cwd: repoDir });
    childProcess.execSync('mkdir -p src .xtrm', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/src/writer.ts`, 'base\n');
    childProcess.execSync('git add src/writer.ts && git commit -m base', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync(`git remote add origin ${remoteDir}`, { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git push -u origin main', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git fetch origin main', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main', { cwd: repoDir });
    childProcess.execSync('git checkout -b feature', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/src/writer.ts`, 'base\nwriter change\n');
    childProcess.execSync('git add src/writer.ts && git commit -m change', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/.xtrm/SKILL.md`, 'noise\n');

    const variables = buildInjectedWriterDiffVariables(repoDir);

    expect(variables.writer_diff).toContain('Source: injected diff context (branch-vs-base diff');
    expect(variables.writer_diff).toContain('Changed files:\nsrc/writer.ts');
    expect(variables.writer_diff).toContain('Diff stat:');
    expect(variables.writer_diff).toContain('+writer change');
    expect(variables.writer_diff).not.toContain('.xtrm/SKILL.md');
  });

  it('uses bead content as the prompt when --bead is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--bead', 'unitAI-55d'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue({
      id: 'unitAI-55d',
      title: 'Refactor auth',
      description: 'Extract JWT validation',
    });
    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);
    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    expect(runnerRun).toHaveBeenCalled();
    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs).toEqual(expect.objectContaining({
      name: 'code-review',
      inputBeadId: 'unitAI-55d',
      keepAlive: undefined,
      noKeepAlive: false,
      beadsWriteNotes: true,
    }));
    expect(runArgs.prompt).toContain('# Task: Refactor auth');
    expect(runArgs.prompt).toContain('Extract JWT validation');
    expect(runArgs.variables).toEqual(expect.objectContaining({
      bead_id: 'unitAI-55d',
    }));
  });

  it('passes noKeepAlive=true when --no-keep-alive is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--no-keep-alive'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY', interactive: true },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.keepAlive).toBeUndefined();
    expect(runArgs.noKeepAlive).toBe(true);
  });

  it('passes beadsWriteNotes=false when --no-bead-notes is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--bead', 'unitAI-55d', '--no-bead-notes'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue({
      id: 'unitAI-55d',
      title: 'Refactor auth',
      description: 'Extract JWT validation',
    });
    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.beadsWriteNotes).toBe(false);
  });

  it('respects specialist beads_write_notes=false from YAML config', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
        beads_write_notes: false,
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.beadsWriteNotes).toBe(false);
  });

  it('does not duplicate backend prefix in completion footer when model is already provider-qualified', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--model', 'anthropic/claude-haiku-4-5'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-123');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-123',
      specialist: 'code-review',
      status: 'done',
      started_at_ms: 0,
      last_event_at_ms: 1000,
      backend: 'anthropic',
      model: 'anthropic/claude-haiku-4-5',
      is_dead: false,
    } as any);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const stderrText = stderrWrite.mock.calls.map(([chunk]) => String(chunk)).join('');
    const plainText = stderrText.replace(/\x1b\[[0-9;]*m/g, '');

    expect(plainText).toContain('anthropic/claude-haiku-4-5');
    expect(plainText).not.toContain('anthropic/anthropic/claude-haiku-4-5');
  });

  it('auto-provisions worktree for edit-capable specialists when bead is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--bead', 'unitAI-55d'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue({
      id: 'unitAI-55d',
      title: 'Refactor auth',
      description: 'Extract JWT validation',
    });
    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);
    const provisionSpy = vi.spyOn(worktree, 'provisionWorktree').mockReturnValue({
      worktreePath: '/tmp/unitAI-55d-code-review',
      branch: 'feature/unitAI-55d-code-review',
      reused: false,
    });

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-123');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-123',
      specialist: 'code-review',
      status: 'done',
      started_at_ms: 0,
      last_event_at_ms: 1000,
      backend: 'anthropic',
      model: 'anthropic/claude-haiku-4-5',
      is_dead: false,
    } as any);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
    expect(provisionSpy).toHaveBeenCalledWith({
      beadId: 'unitAI-55d',
      specialistName: 'code-review',
    });
  });

  it('fails when --no-worktree is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--no-worktree'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);

    const allText = [
      ...consoleError.mock.calls.map(args => args.join(' ')),
      ...stderrWrite.mock.calls.map(([chunk]) => String(chunk)),
    ].join('\n');
    expect(allText).toContain('--no-worktree has been removed');
  });

  it('uses tmux background mode when tmux is available', async () => {
    process.argv = ['node', '/repo/src/index.ts', 'run', 'code-review', '--prompt', "he'llo", '--background'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const randomBytesSpy = vi.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('a1b2c3', 'hex') as any);
    const isTmuxAvailableSpy = vi.spyOn(tmuxUtils, 'isTmuxAvailable').mockReturnValue(true);
    const createTmuxSessionSpy = vi.spyOn(tmuxUtils, 'createTmuxSession').mockImplementation(() => {});
    const detachedSpawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => ({
      pid: 123,
      unref: vi.fn(),
    } as any));

    let latestReads = 0;
    vi.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      if (String(path).endsWith('/.specialists/jobs/latest')) {
        latestReads += 1;
        return latestReads === 1 ? 'old-job' : 'job-from-tmux';
      }
      throw new Error('unexpected path');
    });

    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');

    expect(randomBytesSpy).toHaveBeenCalledWith(3);
    expect(isTmuxAvailableSpy).toHaveBeenCalled();
    expect(createTmuxSessionSpy).toHaveBeenCalledWith(
      'sp-code-review-a1b2c3',
      process.cwd(),
      expect.stringContaining('"$job_id" --follow'),
      { SPECIALISTS_BG_JOB_ID_PATH: expect.stringContaining('.bg-job-id-sp-code-review-a1b2c3') },
    );
    expect(createTmuxSessionSpy.mock.calls[0]?.[2]).toContain(`${process.execPath} /repo/src/index.ts 'run' 'code-review' '--prompt' 'he'\\''llo'`);
    expect(detachedSpawnSpy).not.toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith('job-from-tmux\n');
    expect(stderrWrite).not.toHaveBeenCalledWith(expect.stringContaining('tmux'));
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('falls back to detached spawn when tmux is not available', async () => {
    process.argv = ['node', '/repo/src/index.ts', 'run', 'code-review', '--prompt', 'hello', '--background'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(tmuxUtils, 'isTmuxAvailable').mockReturnValue(false);
    const createTmuxSessionSpy = vi.spyOn(tmuxUtils, 'createTmuxSession').mockImplementation(() => {});
    const unref = vi.fn();
    const child = new EventEmitter() as any;
    child.pid = 456;
    child.unref = unref;
    child.stderr = new EventEmitter();
    child.stderr.setEncoding = vi.fn();
    const detachedSpawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => child);

    let latestReads = 0;
    vi.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      if (String(path).endsWith('/.specialists/jobs/latest')) {
        latestReads += 1;
        return latestReads === 1 ? 'old-job' : 'job-from-fallback';
      }
      throw new Error('unexpected path');
    });

    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');

    expect(createTmuxSessionSpy).not.toHaveBeenCalled();
    expect(detachedSpawnSpy).toHaveBeenCalledTimes(1);
    const [command, spawnArgs, options] = detachedSpawnSpy.mock.calls[0] as [string, string[], any];
    expect(command).toBe(process.execPath);
    expect(spawnArgs).toEqual([
      '/repo/src/index.ts',
      'run',
      'code-review',
      '--prompt',
      'hello',
    ]);
    expect(options.detached).toBe(true);
    expect(options.stdio).toEqual(['ignore', 'ignore', 'pipe']);
    expect(options.cwd).toBe(process.cwd());
    expect(options.env).toBe(process.env);
    expect(unref).toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith('job-from-fallback\n');
    expect(exit).toHaveBeenCalledWith(0);
  });


  it('surfaces detached child stderr and exits non-zero when child fails before jobId exists', async () => {
    process.argv = ['node', '/repo/src/index.ts', 'run', 'code-review', '--prompt', 'hello', '--background'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(tmuxUtils, 'isTmuxAvailable').mockReturnValue(false);
    const child = new EventEmitter() as any;
    child.pid = 456;
    child.unref = vi.fn();
    child.stderr = new EventEmitter();
    child.stderr.setEncoding = vi.fn();
    vi.spyOn(childProcess, 'spawn').mockImplementation(() => child);

    vi.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      if (String(path).endsWith('/.specialists/jobs/latest')) {
        throw new Error('no job yet');
      }
      throw new Error('unexpected path');
    });

    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    setImmediate(() => {
      child.stderr.emit('data', 'epic guard refusal\n');
      child.emit('exit', 3);
    });

    await expect(run()).rejects.toThrow('exit:3');

    expect(stderrWrite).toHaveBeenCalledWith('epic guard refusal\n');
    expect(exit).toHaveBeenCalledWith(3);
  });
  it('blocks MEDIUM specialists from reusing a running job worktree', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-running'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-running',
      specialist: 'other',
      status: 'running',
      started_at_ms: Date.now(),
      worktree_path: '/tmp/wt-job-running',
    } as any);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);

    const stderrText = consoleError.mock.calls.map((args) => args.map((a) => String(a)).join(' ')).join('\n');
    expect(stderrText).toContain('Target job job-running is still running (status: running).');
    expect(stderrText).toContain('--force-job');
  });

  it('blocks MEDIUM specialists when target job status is starting with exact error text', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-starting'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-starting',
      specialist: 'other',
      status: 'starting',
      started_at_ms: Date.now(),
      worktree_path: '/tmp/wt-job-starting',
    } as any);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);

    const stderrText = consoleError.mock.calls.map((args) => args.map((a) => String(a)).join(' ')).join('\n');
    const plainText = stderrText.replace(/\x1b\[[0-9;]*m/g, '');
    const exactMessage = 'Target job job-starting is still running (status: starting). MEDIUM/HIGH specialists cannot enter an active worktree. Wait for completion or use --force-job to override.';
    const matchedLine = plainText.split('\n').find((line) => line.startsWith('Target job job-starting is still running'));

    expect(matchedLine).toBe(exactMessage);
  });

  it('sets reviewed_job_id and reused-worktree awareness variables when --job is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-reviewed'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-reviewed') {
        return {
          id,
          specialist: 'executor',
          status: 'done',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-reviewed',
          worktree_owner_job_id: 'job-root-owner',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.variables).toEqual(expect.objectContaining({
      reviewed_job_id: 'job-reviewed',
      reused_worktree_awareness: expect.stringContaining('Reused workspace awareness (from --job)'),
    }));
    expect(runArgs.variables?.reused_worktree_awareness).toContain('job-reviewed');
    expect(runArgs.variables?.reused_worktree_awareness).toContain('job-root-owner');
    expect(runArgs.variables?.reused_worktree_awareness).toContain('Workspace may contain uncommitted edits');
    expect(runArgs.variables?.reused_worktree_awareness).toContain('git status --short --branch');
  });

  it('injects writer_diff for seconder when --job reuses a writer worktree', async () => {
    const remoteDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
    const repoDir = childProcess.execSync('mktemp -d', { encoding: 'utf8' }).trim();
    childProcess.execSync('git init --bare', { cwd: remoteDir });
    childProcess.execSync('git init -b main', { cwd: repoDir });
    childProcess.execSync('git config user.email test@example.com', { cwd: repoDir });
    childProcess.execSync('git config user.name Test User', { cwd: repoDir });
    childProcess.execSync('mkdir -p src', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/src/writer.ts`, 'base\n');
    childProcess.execSync('git add src/writer.ts && git commit -m base', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync(`git remote add origin ${remoteDir}`, { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git push -u origin main', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git fetch origin main', { cwd: repoDir, shell: '/bin/bash' as never });
    childProcess.execSync('git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main', { cwd: repoDir });
    childProcess.execSync('git checkout -b feature', { cwd: repoDir, shell: '/bin/bash' as never });
    fs.writeFileSync(`${repoDir}/src/writer.ts`, 'base\nwriter change\n');
    childProcess.execSync('git add src/writer.ts && git commit -m change', { cwd: repoDir, shell: '/bin/bash' as never });

    process.argv = ['node', 'specialists', 'run', 'seconder', '--prompt', 'review writer', '--job', 'job-writer'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'seconder', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt\n$writer_diff' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-writer') {
        return {
          id,
          specialist: 'executor',
          status: 'done',
          started_at_ms: Date.now(),
          worktree_path: repoDir,
          worktree_owner_job_id: 'job-root-owner',
        } as any;
      }
      return {
        id,
        specialist: 'seconder',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await run();

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.variables).toEqual(expect.objectContaining({
      reviewed_job_id: 'job-writer',
      writer_diff: expect.stringContaining('Diff hunks:'),
    }));
    expect(runArgs.variables?.writer_diff).toContain('src/writer.ts');
    expect(runArgs.variables?.writer_diff).toContain('+writer change');
  });

  it('prefers explicit reviewed_job_id override from prompt over --job lineage', async () => {
    process.argv = ['node', 'specialists', 'run', 'reviewer', '--prompt', 'reviewed_job_id: job-override', '--job', 'job-reviewed'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'reviewer', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });

    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-reviewed') {
        return {
          id,
          specialist: 'executor',
          status: 'done',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-reviewed',
        } as any;
      }
      return {
        id,
        specialist: 'reviewer',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.variables).toEqual(expect.objectContaining({ reviewed_job_id: 'job-override' }));
  });

  it('infers bead context from --job metadata when --bead is omitted', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--job', 'job-reviewed'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(BeadsClient.prototype, 'readBead').mockImplementation((id: string) => {
      if (id === 'unitAI-inferred') {
        return {
          id,
          title: 'Review inferred bead',
          description: 'Use metadata from reviewed job',
        } as any;
      }
      return null as any;
    });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });

    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-reviewed') {
        return {
          id,
          specialist: 'executor',
          status: 'done',
          bead_id: 'unitAI-inferred',
          worktree_path: '/tmp/wt-job-reviewed',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
    expect(consoleError).toHaveBeenCalledWith('[input bead auto-resolved from job job-reviewed: unitAI-inferred]');

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.inputBeadId).toBe('unitAI-inferred');
    expect(runArgs.prompt).toContain('# Task: Review inferred bead');
    expect(runArgs.variables).toEqual(expect.objectContaining({
      bead_id: 'unitAI-inferred',
      reviewed_job_id: 'job-reviewed',
    }));
  });

  it('fails when --job has no bead metadata and no prompt is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--job', 'job-reviewed'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-reviewed') {
        return {
          id,
          specialist: 'executor',
          status: 'done',
          worktree_path: '/tmp/wt-job-reviewed',
        } as any;
      }
      return null as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith('Error: provide --prompt, pipe stdin, use --bead <id>, or provide --job <id> for bead inference.');
  });

  it('keeps explicit --bead when --job also has bead_id metadata', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--bead', 'unitAI-explicit', '--job', 'job-reviewed'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const readBead = vi.spyOn(BeadsClient.prototype, 'readBead').mockImplementation((id: string) => {
      if (id === 'unitAI-explicit') {
        return {
          id,
          title: 'Explicit bead context',
          description: 'Explicit bead should win',
        } as any;
      }
      return null as any;
    });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });

    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-reviewed') {
        return {
          id,
          specialist: 'executor',
          status: 'done',
          bead_id: 'unitAI-inferred',
          worktree_path: '/tmp/wt-job-reviewed',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.inputBeadId).toBe('unitAI-explicit');
    expect(runArgs.variables).toEqual(expect.objectContaining({ bead_id: 'unitAI-explicit' }));
    expect(readBead).toHaveBeenCalledWith('unitAI-explicit');
    expect(readBead).not.toHaveBeenCalledWith('unitAI-inferred');
  });

  it('fails clearly when inferred bead from --job is unreadable', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--job', 'job-reviewed'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue(null as any);
    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-reviewed') {
        return {
          id,
          specialist: 'executor',
          status: 'done',
          bead_id: 'unitAI-inferred',
          worktree_path: '/tmp/wt-job-reviewed',
        } as any;
      }
      return null as any;
    });

    await expect(run()).rejects.toThrow("Unable to read inferred bead 'unitAI-inferred' from --job 'job-reviewed' via bd show --json");
  });

  it('allows MEDIUM specialists to reuse done job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-done'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-done') {
        return {
          id,
          specialist: 'other',
          status: 'done',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-done',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows MEDIUM specialists to reuse error job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-error'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-error') {
        return {
          id,
          specialist: 'other',
          status: 'error',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-error',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows MEDIUM specialists to reuse cancelled job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-cancelled'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-cancelled') {
        return {
          id,
          specialist: 'other',
          status: 'cancelled',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-cancelled',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('blocks MEDIUM specialists for unknown target job status', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-unknown'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'readStatus').mockReturnValue({
      id: 'job-unknown',
      specialist: 'other',
      status: 'unrecognized-status',
      started_at_ms: Date.now(),
      worktree_path: '/tmp/wt-job-unknown',
    } as any);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);

    const stderrText = consoleError.mock.calls.map((args) => args.map((a) => String(a)).join(' ')).join('\n');
    expect(stderrText).toContain("Target job job-unknown has unknown status 'unrecognized-status'.");
    expect(stderrText).toContain('--force-job');
  });

  it('allows --force-job for MEDIUM specialists with unknown target job status', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-unknown', '--force-job'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-unknown') {
        return {
          id,
          specialist: 'other',
          status: 'unrecognized-status',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-unknown',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows MEDIUM specialists to reuse waiting job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-waiting'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'MEDIUM' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-waiting') {
        return {
          id,
          specialist: 'other',
          status: 'waiting',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-waiting',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows READ_ONLY specialists to reuse running job worktrees', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-running'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-running') {
        return {
          id,
          specialist: 'other',
          status: 'running',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-running',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('allows --force-job to bypass active job reuse guard', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--job', 'job-running', '--force-job'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'HIGH' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    vi.spyOn(Supervisor.prototype, 'run').mockResolvedValue('job-new');
    vi.spyOn(Supervisor.prototype, 'readStatus').mockImplementation((id: string) => {
      if (id === 'job-running') {
        return {
          id,
          specialist: 'other',
          status: 'running',
          started_at_ms: Date.now(),
          worktree_path: '/tmp/wt-job-running',
        } as any;
      }
      return {
        id,
        specialist: 'code-review',
        status: 'done',
        started_at_ms: 0,
        last_event_at_ms: 10,
      } as any;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits when both --prompt and --bead are provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello', '--bead', 'unitAI-55d'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith('Error: use either --prompt or --bead, not both.');
    expect(runnerRun).not.toHaveBeenCalled();
  });

  it('keeps reused_worktree_awareness empty when run does not use --job', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review', '--prompt', 'hello'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    vi.spyOn(SpecialistLoader.prototype, 'get').mockResolvedValue({
      specialist: {
        metadata: { name: 'code-review', version: '1.0.0' },
        execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
        prompt: { task_template: 'Do $prompt' },
      },
    } as any);

    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(run()).rejects.toThrow('exit:0');
    expect(exit).toHaveBeenCalledWith(0);

    const runArgs = runnerRun.mock.calls[0][0];
    expect(runArgs.variables).toEqual(expect.objectContaining({ reused_worktree_awareness: '' }));
  });

  it('executor and debugger templates include reused-worktree awareness injection slot', async () => {
    const executorConfig = JSON.parse(fs.readFileSync('config/specialists/executor.specialist.json', 'utf-8'));
    const debuggerConfig = JSON.parse(fs.readFileSync('config/specialists/debugger.specialist.json', 'utf-8'));

    expect(executorConfig.specialist.prompt.task_template).toContain('$reused_worktree_awareness');
    expect(debuggerConfig.specialist.prompt.task_template).toContain('$reused_worktree_awareness');
  });

  it('exits when neither prompt nor bead nor stdin is provided', async () => {
    process.argv = ['node', 'specialists', 'run', 'code-review'];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runnerRun = vi.spyOn(SpecialistRunner.prototype, 'run').mockResolvedValue({
      output: 'done',
      durationMs: 5,
      model: 'gemini',
      backend: 'google-gemini-cli',
      promptHash: 'abc123def4567890',
      specialistVersion: '1.0.0',
    });

    await expect(run()).rejects.toThrow('exit:1');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith('Error: provide --prompt, pipe stdin, use --bead <id>, or provide --job <id> for bead inference.');
    expect(runnerRun).not.toHaveBeenCalled();
  });
});
