// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { afterEach, describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { BeadsClient } from '../../../src/specialist/beads.js';
import { dispatchInput } from '../../../src/cli/chat/control.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const createdBeads: string[] = [];
const createdJobs: string[] = [];

function runCli(args: string[]) {
  return spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), ...args], { cwd: repoRoot, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' } });
}

function createBead(title: string): string {
  const result = spawnSync('bd', ['create', title, '-t', 'task', '--json'], { cwd: repoRoot, encoding: 'utf-8' });
  expect(result.status).toBe(0);
  const parsed = JSON.parse(result.stdout.trim());
  const id = Array.isArray(parsed) ? parsed[0].id : parsed.id;
  createdBeads.push(id);
  return id;
}

function closeBead(id: string): void {
  spawnSync('bd', ['close', id, '-r', 'test cleanup'], { cwd: repoRoot, stdio: 'ignore' });
}

function cleanupJob(jobId: string): void {
  if (!jobId) return;
  spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), 'stop', jobId], { cwd: repoRoot, stdio: 'ignore', encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' } });
}

afterEach(() => {
  for (const id of createdJobs) {
    try { cleanupJob(id); } catch {}
  }
  for (const id of createdBeads) {
    try { closeBead(id); } catch {}
  }
  createdJobs.length = 0;
  createdBeads.length = 0;
});

describe('chat control boundary', () => {
  it('routes plain text by live state', () => {
    expect(dispatchInput('run it', { jobState: 'running' })).toEqual({ kind: 'steer', text: 'run it' });
    expect(dispatchInput('next', { jobState: 'waiting' })).toEqual({ kind: 'resume', text: 'next' });
  });

  it('stopJob idempotent via CLI boundary', () => {
    const beadId = createBead(`unitAI-control-stop-${Date.now()}`);
    const launch = runCli(['run', 'reviewer', '--bead', beadId, '--background', '--no-beads', '--no-bead-notes']);
    expect(launch.status).toBe(0);
    const jobId = launch.stdout.trim();
    createdJobs.push(jobId);

    const first = runCli(['stop', jobId]);
    const second = runCli(['stop', jobId]);

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(second.stdout + second.stderr).toContain('already finalized');
  }, 30000);

  it('finalizeJob on non-chain job returns structured error', () => {
    const beadId = createBead(`unitAI-control-finalize-${Date.now()}`);
    const launch = runCli(['run', 'reviewer', '--bead', beadId, '--background', '--no-beads', '--no-bead-notes']);
    expect(launch.status).toBe(0);
    const jobId = launch.stdout.trim();
    createdJobs.push(jobId);

    const result = runCli(['finalize', jobId]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No reviewer with PASS compliance verdict found in chain');
  }, 30000);

  it('appendBeadNote empty text refuses and happy path lands in bd show', () => {
    const beadId = createBead(`unitAI-control-note-${Date.now()}`);
    const beads = new BeadsClient();

    expect(beads.updateBeadNotes(beadId, '')).toEqual({ ok: false, error: 'beads unavailable or empty payload' });
    const note = `note-${Date.now()}`;
    expect(beads.updateBeadNotes(beadId, note)).toEqual({ ok: true });
    expect(execSync(`bd show ${beadId}`, { cwd: repoRoot, encoding: 'utf-8' })).toContain(note);
  }, 30000);

  it('FIFO write timeout fires when reader is gone', () => {
    const beadId = createBead(`unitAI-control-fifo-${Date.now()}`);
    const launch = runCli(['run', 'reviewer', '--bead', beadId, '--background', '--no-beads', '--no-bead-notes']);
    expect(launch.status).toBe(0);
    const jobId = launch.stdout.trim();
    createdJobs.push(jobId);

    const stopped = runCli(['stop', jobId]);
    expect(stopped.status).toBe(0);

    const result = spawnSync('timeout', ['1', 'bun', 'run', join(repoRoot, 'src/index.ts'), 'steer', jobId, 'ping'], { cwd: repoRoot, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' } });
    expect(result.status).toBe(124);
  }, 10000);
});
