import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync, spawn, execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from 'bun:sqlite';
import { createObservabilitySqliteClient, initSchema } from '../../../src/specialist/observability-sqlite.js';
import { ensureObservabilityDbFile, resolveObservabilityDbLocation } from '../../../src/specialist/observability-db.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const entry = join(repoRoot, 'src/index.ts');

type CliResult = ReturnType<typeof spawnSync>;

function runCli(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): CliResult {
  return spawnSync('bun', [entry, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('integration: sp node CLI surface', () => {
  let tempDir = '';
  let coordinatorProcess: ReturnType<typeof spawn> | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sp-node-cli-int-'));
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });

    const location = resolveObservabilityDbLocation(tempDir);
    ensureObservabilityDbFile(location);
    const db = new Database(location.dbPath);
    initSchema(db);
    db.close();

    const sqliteClient = createObservabilitySqliteClient(tempDir);
    expect(sqliteClient).not.toBeNull();

    coordinatorProcess = spawn('sleep', ['60'], { stdio: 'ignore' });
    expect(coordinatorProcess.pid).toBeTypeOf('number');

    const fifoPath = join(tempDir, 'coordinator.fifo');
    await writeFile(fifoPath, '', 'utf-8');

    sqliteClient!.upsertNodeRun({
      id: 'node-1',
      node_name: 'wave4-node',
      status: 'running',
      coordinator_job_id: 'job-coordinator',
      started_at_ms: 10,
      updated_at_ms: 20,
      status_json: JSON.stringify({ reason: 'operator-check' }),
    });

    sqliteClient!.upsertNodeMember({
      node_run_id: 'node-1',
      member_id: 'explorer-1',
      job_id: 'job-member-1',
      specialist: 'explorer',
      role: 'research',
      status: 'running',
      enabled: true,
      generation: 2,
      worktree_path: '/tmp/worktree-1',
      parent_member_id: 'explorer-0',
      replaced_member_id: 'explorer-old',
      phase_id: 'phase-1',
    });

    sqliteClient!.upsertNodeMemory({
      node_run_id: 'node-1',
      namespace: 'wave4',
      entry_id: 'finding-1',
      entry_type: 'fact',
      summary: 'First summary',
      source_member_id: 'explorer-1',
      confidence: 0.8,
      created_at_ms: 11,
      updated_at_ms: 21,
      provenance_json: JSON.stringify({ source: 'integration' }),
    });

    sqliteClient!.appendNodeEvent('node-1', 22, 'member_spawned', {
      member_id: 'explorer-1',
      job_id: 'job-member-1',
      status: 'running',
      generation: 2,
      worktree_path: '/tmp/worktree-1',
      phase_id: 'phase-1',
    });

    sqliteClient!.upsertStatus({
      id: 'job-coordinator',
      specialist: 'node-coordinator',
      status: 'running',
      pid: coordinatorProcess!.pid,
      started_at_ms: 1,
      fifo_path: fifoPath,
      tmux_session: 'node-session',
    });

    sqliteClient!.upsertStatus({
      id: 'job-member-1',
      specialist: 'explorer',
      status: 'running',
      started_at_ms: 2,
      reused_from_job_id: 'job-member-0',
      worktree_owner_job_id: 'job-coordinator',
    });

    sqliteClient!.upsertNodeRun({
      id: 'node-no-tmux',
      node_name: 'wave4-node-no-tmux',
      status: 'running',
      coordinator_job_id: 'job-no-tmux',
      started_at_ms: 30,
      updated_at_ms: 31,
      status_json: JSON.stringify({ reason: 'no-tmux' }),
    });

    sqliteClient!.upsertStatus({
      id: 'job-no-tmux',
      specialist: 'node-coordinator',
      status: 'running',
      started_at_ms: 5,
    });

    sqliteClient!.close();

    const binDir = join(tempDir, 'bin');
    await mkdir(binDir, { recursive: true });
    await writeFile(
      join(binDir, 'tmux'),
      '#!/usr/bin/env bash\necho "$@" > "' + join(tempDir, 'tmux-attach.log') + '"\n',
      { mode: 0o755 },
    );
  });

  afterEach(async () => {
    if (coordinatorProcess?.pid && isPidAlive(coordinatorProcess.pid)) {
      coordinatorProcess.kill('SIGKILL');
    }
    coordinatorProcess = null;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('prints node help with expanded command surface', () => {
    const result = runCli(tempDir, ['node', '--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: specialists node <run|list|status|feed|promote|members|memory|steer|stop|attach>');
    expect(result.stdout).toContain('run <node-config> [--inline JSON] [--bead <bead-id>] [--context-depth <n>] [--json]');
    expect(result.stdout).toContain('members <node-id> [--json]');
    expect(result.stdout).toContain('memory <node-id> [--json]');
    expect(result.stdout).toContain('steer <node-id> <message> [--json]');
    expect(result.stdout).toContain('stop <node-id> [--json]');
    expect(result.stdout).toContain('attach <node-id>');
  });

  it('returns status/feed/members/memory JSON with lineage and memory summaries', async () => {
    const statusResult = runCli(tempDir, ['node', 'status', '--node', 'node-1', '--json']);
    expect(statusResult.status).toBe(0);
    const statusJson = JSON.parse(statusResult.stdout);
    expect(statusJson.node_id).toBe('node-1');
    expect(statusJson.memory_summary.total).toBe(1);
    expect(statusJson.members[0].generation).toBe(2);
    expect(statusJson.members[0].reused_from_job_id).toBe('job-member-0');
    expect(statusJson.members[0].worktree_owner_job_id).toBe('job-coordinator');

    const membersResult = runCli(tempDir, ['node', 'members', 'node-1', '--json']);
    expect(membersResult.status).toBe(0);
    const membersJson = JSON.parse(membersResult.stdout);
    expect(membersJson.node_id).toBe('node-1');
    expect(membersJson.members[0]).toMatchObject({
      member_id: 'explorer-1',
      generation: 2,
      worktree_path: '/tmp/worktree-1',
      reused_from_job_id: 'job-member-0',
      worktree_owner_job_id: 'job-coordinator',
    });

    const memoryResult = runCli(tempDir, ['node', 'memory', 'node-1', '--json']);
    expect(memoryResult.status).toBe(0);
    const memoryJson = JSON.parse(memoryResult.stdout);
    expect(memoryJson.summary.total).toBe(1);
    expect(memoryJson.summary.by_type.fact).toBe(1);
    expect(memoryJson.summary.latest_summary).toBe('First summary');

    const feedResult = runCli(tempDir, ['node', 'feed', 'node-1', '--json']);
    expect(feedResult.status).toBe(0);
    const eventLine = feedResult.stdout.trim().split('\n')[0];
    const feedJson = JSON.parse(eventLine);
    expect(feedJson.type).toBe('node_event');
    expect(feedJson.node_id).toBe('node-1');
    expect(feedJson.event_type).toBe('member_spawned');
    expect(feedJson.event_json.member_id).toBe('explorer-1');
  });

  it('wires steer/stop/attach commands to coordinator control paths', async () => {
    const steerResult = runCli(tempDir, ['node', 'steer', 'node-1', 'hold-wave-2', '--json']);
    expect(steerResult.status).toBe(0);
    expect(JSON.parse(steerResult.stdout)).toMatchObject({
      node_id: 'node-1',
      coordinator_job_id: 'job-coordinator',
      steered: true,
    });

    const fifoContent = await readFile(join(tempDir, 'coordinator.fifo'), 'utf-8');
    expect(fifoContent).toContain('"type":"steer"');
    expect(fifoContent).toContain('"message":"hold-wave-2"');

    const stopResult = runCli(tempDir, ['node', 'stop', 'node-1', '--json']);
    expect(stopResult.status).toBe(0);
    const stopJson = JSON.parse(stopResult.stdout);
    expect(stopJson.stopped).toBe(true);
    expect(stopJson.pid).toBe(coordinatorProcess!.pid);
    expect(isPidAlive(coordinatorProcess!.pid!)).toBe(false);

    const attachResult = runCli(
      tempDir,
      ['node', 'attach', 'node-1'],
      { PATH: `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}` },
    );
    expect(attachResult.status).toBe(0);
    expect(existsSync(join(tempDir, 'tmux-attach.log'))).toBe(true);
    const attachArgs = await readFile(join(tempDir, 'tmux-attach.log'), 'utf-8');
    expect(attachArgs.trim()).toBe('attach-session -t node-session');
  });

  it('returns clear non-zero failures for missing args and unsupported targets', () => {
    const missingNodeResult = runCli(tempDir, ['node', 'members']);
    expect(missingNodeResult.status).toBe(1);
    expect(missingNodeResult.stderr).toContain('Usage: specialists node members <node-id> [--json]');

    const unsupportedTargetResult = runCli(tempDir, ['node', 'steer', 'missing-node', 'msg']);
    expect(unsupportedTargetResult.status).toBe(1);
    expect(unsupportedTargetResult.stderr).toContain('Node run not found: missing-node');

    const attachNoTmuxResult = runCli(
      tempDir,
      ['node', 'attach', 'node-no-tmux'],
      { PATH: `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}` },
    );
    expect(attachNoTmuxResult.status).toBe(1);
    expect(attachNoTmuxResult.stderr).toContain('Coordinator job job-no-tmux has no tmux session');
  });
});
