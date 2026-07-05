import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectOrphanProcesses, collectProcessHealth, collectStaleSpecialistJobs } from '../../../src/specialist/process-health.js';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

// SupervisorStatus is intentionally narrow, but the runtime source in process-health.ts casts
// per-status to include pid/updated_at_ms (see `as SupervisorStatus & { pid?: number; updated_at_ms?: number }`
// in collectStaleSpecialistJobs). Test fixtures need to carry these fields too; the type
// alias makes that an intentional widening instead of a per-literal cast at every callsite.
type StatusFixture = Partial<SupervisorStatus> & { pid?: number; updated_at_ms?: number };
const asStatuses = (rows: StatusFixture[]): SupervisorStatus[] => rows as unknown as SupervisorStatus[];

function writeProcProcess(root: string, pid: number, data: { cmdline: string; comm: string; stat: string; status: string; cwd?: string }): void {
  const dir = join(root, String(pid));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cmdline'), data.cmdline, 'utf-8');
  writeFileSync(join(dir, 'comm'), data.comm, 'utf-8');
  writeFileSync(join(dir, 'stat'), data.stat, 'utf-8');
  writeFileSync(join(dir, 'status'), data.status, 'utf-8');
  if (data.cwd) symlinkSync(data.cwd, join(dir, 'cwd')); 
}

describe('process-health', () => {
  let root = '';

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('collects rss, dolt, serena, and orphan signals from proc snapshot fixtures', () => {
    root = mkdtempSync(join(tmpdir(), 'process-health-'));
    const meminfo = join(root, 'meminfo');
    writeFileSync(meminfo, 'MemAvailable:       1000 kB\n', 'utf-8');
    writeFileSync(join(root, 'uptime'), '2000.00 1000.00\n', 'utf-8');

    writeProcProcess(root, 101, {
      cmdline: 'specialists\0run\0',
      comm: 'specialists',
      stat: '101 (specialists) R   1 1 1 0 -1 4194560 100 0 0 200 50 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t2048 kB\n',
      cwd: '/home/me/.worktrees/alpha',
    });
    writeProcProcess(root, 102, {
      cmdline: 'dolt sql-server\0',
      comm: 'dolt',
      stat: '102 (dolt) S  1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/home/me/.worktrees/alpha/.beads',
    });
    writeProcProcess(root, 103, {
      cmdline: 'serena language-server\0',
      comm: 'serena',
      stat: '103 (serena) S    1 1 1 0 -1 4194560 100 0 0 60 10 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t512 kB\n',
      cwd: '/home/me/.worktrees/alpha/.serena',
    });
    writeProcProcess(root, 104, {
      cmdline: 'gitnexus mcp\0',
      comm: 'gitnexus',
      stat: '104 (gitnexus) S  1 1 1 0 -1 4194560 100 0 0 50 10 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t256 kB\n',
      cwd: '/tmp/orphan',
    });

    const report = collectProcessHealth({ procRoot: root, meminfoPath: meminfo, nowMs: 200_000 });

    expect(report.specialistCount).toBe(1);
    expect(report.doltCount).toBe(1);
    expect(report.serenaLspCount).toBe(1);
    expect(report.orphanCount).toBe(1);
    expect(report.warnPct).toBe(70);
    expect(report.refusePct).toBe(85);
    expect(report.totalRssBytes).toBe(3840 * 1024);
    expect(report.serenaWorkspaces[0]?.count).toBe(1);
    expect(report.specialistProcesses[0]?.ageSeconds).toBeCloseTo(2000, 1);
    expect(report.specialistProcesses[0]?.cpuPct).toBeGreaterThan(0);
  });

  it('warns when dolt or orphan process counts exceed safe defaults', () => {
    root = mkdtempSync(join(tmpdir(), 'process-health-'));
    const meminfo = join(root, 'meminfo');
    writeFileSync(meminfo, 'MemAvailable:       100000 kB\n', 'utf-8');
    writeFileSync(join(root, 'uptime'), '2000.00 1000.00\n', 'utf-8');

    for (const pid of [201, 202]) {
      writeProcProcess(root, pid, {
        cmdline: 'dolt sql-server\0',
        comm: 'dolt',
        stat: `${pid} (dolt) S 1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0`,
        status: 'VmRSS:\t1024 kB\n',
        cwd: '/home/me/.worktrees/alpha/.beads',
      });
    }

    const report = collectProcessHealth({ procRoot: root, meminfoPath: meminfo });

    expect(report.status).toBe('WARN');
    expect(report.statusReasons).toContain('dolt sql-server count 2 > expected 1');
  });

  it('collects deleted-cwd dolt and tool processes as reapable leaks', () => {
    root = mkdtempSync(join(tmpdir(), 'process-health-'));
    const meminfo = join(root, 'meminfo');
    writeFileSync(meminfo, 'MemAvailable:       100000 kB\n', 'utf-8');
    writeFileSync(join(root, 'uptime'), '2000.00 1000.00\n', 'utf-8');

    writeProcProcess(root, 301, {
      cmdline: 'dolt sql-server\0',
      comm: 'dolt',
      stat: '301 (dolt) S 1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo/.worktrees/a/a/.beads/dolt (deleted)',
    });
    writeProcProcess(root, 302, {
      cmdline: 'serena language-server\0',
      comm: 'serena',
      stat: '302 (serena) S 2 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo/.worktrees/a/a (deleted)',
    });
    writeProcProcess(root, 303, {
      cmdline: 'dolt sql-server\0',
      comm: 'dolt',
      stat: '303 (dolt) S 1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo/.beads/dolt',
    });

    const reapable = collectOrphanProcesses({ procRoot: root });
    void meminfo;

    expect(reapable.map(process => process.pid)).toEqual([301, 302]);
    expect(reapable[0]?.reason).toBe('dolt-worktree-local');
    expect(reapable[1]?.reason).toBe('deleted-worktree-process');
  });

  it('collects stale specialist jobs for dead pids, orphaned keep-alives, and dead toolchains', () => {
    root = mkdtempSync(join(tmpdir(), 'process-health-'));
    const meminfo = join(root, 'meminfo');
    writeFileSync(meminfo, 'MemAvailable:	100000 kB\n', 'utf-8');
    writeFileSync(join(root, 'uptime'), '4000.00 1000.00\n', 'utf-8');

    const deadPid = 600;
    const keepAlivePid = 602;
    const deadToolchainPid = 603;
    writeProcProcess(root, keepAlivePid, {
      cmdline: 'specialists run executor --bead abc\0',
      comm: 'bun',
      stat: '602 (bun) S 1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 0 100000',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo/.worktrees/xtrm-tools',
    });
    writeProcProcess(root, deadToolchainPid, {
      cmdline: 'specialists run executor --bead stale\0',
      comm: 'bun',
      stat: '603 (bun) S 2 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 0 100000',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo/.worktrees/xtrm-tools',
    });

    const jobs = collectStaleSpecialistJobs({
      procRoot: root,
      nowMs: 4_000_000,
      minKeepAliveAgeMs: 30 * 60 * 1000,
      observabilityClient: {
        listStatuses: () => asStatuses([
          { id: 'dead-job', bead_id: 'bead-dead', specialist: 'tester', status: 'running', pid: deadPid, updated_at_ms: 1_000_000 },
          { id: 'keepalive-job', bead_id: 'bead-live', specialist: 'tester', status: 'waiting', pid: keepAlivePid, updated_at_ms: 1_000_000 },
          { id: 'toolchain-job', bead_id: 'bead-toolchain', specialist: 'tester', status: 'running', pid: deadToolchainPid, updated_at_ms: 1_000_000 },
          { id: 'too-fresh', bead_id: 'bead-fresh', specialist: 'tester', status: 'waiting', pid: 601, updated_at_ms: 3_900_000 },
        ]),
        getLastActivityTimestampMs: (jobId) => (jobId === 'toolchain-job' ? 2_000_000 : null),
      },
    });

    expect(jobs).toEqual([
      { jobId: 'dead-job', pid: deadPid, beadId: 'bead-dead', specialist: 'tester', cwd: null, ageMs: 3_000_000, reason: 'dead-pid' },
      { jobId: 'keepalive-job', pid: keepAlivePid, beadId: 'bead-live', specialist: 'tester', cwd: '/repo/.worktrees/xtrm-tools', ageMs: 3_000_000, reason: 'orphaned-keep-alive' },
      { jobId: 'toolchain-job', pid: deadToolchainPid, beadId: 'bead-toolchain', specialist: 'tester', cwd: '/repo/.worktrees/xtrm-tools', ageMs: 3_000_000, reason: 'dead-toolchain' },
    ]);
  });

  it('detects terminal-alive jobs: registry done/error/cancelled but PID still running (unitAI-yme9q)', () => {
    root = mkdtempSync(join(tmpdir(), 'process-health-'));
    const meminfo = join(root, 'meminfo');
    writeFileSync(meminfo, 'MemAvailable:	100000 kB\n', 'utf-8');
    writeFileSync(join(root, 'uptime'), '4000.00 1000.00\n', 'utf-8');

    const terminalAlivePid = 700;
    const terminalAliveErrorPid = 701;
    const terminalAliveCancelledPid = 702;
    const terminalFreshPid = 703;

    for (const pid of [terminalAlivePid, terminalAliveErrorPid, terminalAliveCancelledPid, terminalFreshPid]) {
      // Not orphaned (ppid=5000, not 1) — the whole point is this class survives with a normal
      // parent (bash wrapper / tmux pane), which the existing orphaned-keep-alive check misses.
      writeProcProcess(root, pid, {
        cmdline: 'specialists run reviewer --bead abc\0',
        comm: 'bun',
        stat: `${pid} (bun) S 5000 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 0 100000`,
        status: 'VmRSS:\t1024 kB\n',
        cwd: '/repo/.worktrees/xtrm-tools',
      });
    }

    const jobs = collectStaleSpecialistJobs({
      procRoot: root,
      nowMs: 4_000_000,
      minTerminalAliveAgeMs: 60_000,
      observabilityClient: {
        listStatuses: () => asStatuses([
          // Terminal-alive: done > 60s ago, PID still alive with normal parent
          { id: 'done-alive', bead_id: 'bead-done', specialist: 'reviewer', status: 'done', pid: terminalAlivePid, updated_at_ms: 3_000_000 },
          { id: 'error-alive', bead_id: 'bead-err', specialist: 'reviewer', status: 'error', pid: terminalAliveErrorPid, updated_at_ms: 3_000_000 },
          { id: 'cancelled-alive', bead_id: 'bead-cancel', specialist: 'reviewer', status: 'cancelled', pid: terminalAliveCancelledPid, updated_at_ms: 3_000_000 },
          // Fresh terminal: transitioned <60s ago — grace period for pi's 8s close backstop
          { id: 'done-fresh', bead_id: 'bead-fresh', specialist: 'reviewer', status: 'done', pid: terminalFreshPid, updated_at_ms: 3_990_000 },
          // Terminal but PID gone: correctly finalized, nothing to reap
          { id: 'done-dead', bead_id: 'bead-clean', specialist: 'reviewer', status: 'done', pid: 704, updated_at_ms: 3_000_000 },
        ]),
      },
    });

    expect(jobs).toEqual([
      { jobId: 'done-alive', pid: terminalAlivePid, beadId: 'bead-done', specialist: 'reviewer', cwd: '/repo/.worktrees/xtrm-tools', ageMs: 1_000_000, reason: 'terminal-alive' },
      { jobId: 'error-alive', pid: terminalAliveErrorPid, beadId: 'bead-err', specialist: 'reviewer', cwd: '/repo/.worktrees/xtrm-tools', ageMs: 1_000_000, reason: 'terminal-alive' },
      { jobId: 'cancelled-alive', pid: terminalAliveCancelledPid, beadId: 'bead-cancel', specialist: 'reviewer', cwd: '/repo/.worktrees/xtrm-tools', ageMs: 1_000_000, reason: 'terminal-alive' },
    ]);
  });
  it('does not count MCP, tsserver, or shell tooling as specialist jobs', () => {
    root = mkdtempSync(join(tmpdir(), 'process-health-'));
    const meminfo = join(root, 'meminfo');
    writeFileSync(meminfo, 'MemAvailable:       100000 kB\n', 'utf-8');
    writeFileSync(join(root, 'uptime'), '2000.00 1000.00\n', 'utf-8');

    writeProcProcess(root, 401, {
      cmdline: 'serena start-mcp-server\0',
      comm: 'python',
      stat: '401 (python) S 1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo',
    });
    writeProcProcess(root, 402, {
      cmdline: 'node gitnexus mcp\0',
      comm: 'node',
      stat: '402 (node) S 1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo',
    });
    writeProcProcess(root, 403, {
      cmdline: 'node node_modules/typescript/lib/tsserver.js\0',
      comm: 'node',
      stat: '403 (node) S 1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo',
    });
    writeProcProcess(root, 404, {
      cmdline: 'bun /path/to/specialists run executor --bead abc\0',
      comm: 'bun',
      stat: '404 (bun) S 1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo',
    });
    writeProcProcess(root, 405, {
      cmdline: '/usr/bin/zsh -c specialists run executor --bead abc\0',
      comm: 'zsh',
      stat: '405 (zsh) S 1 1 1 0 -1 4194560 100 0 0 80 20 0 0 20 0 1 0 1000 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
      status: 'VmRSS:\t1024 kB\n',
      cwd: '/repo',
    });

    const report = collectProcessHealth({ procRoot: root, meminfoPath: meminfo });

    expect(report.specialistCount).toBe(1);
    expect(report.specialistProcesses[0]?.pid).toBe(404);
  });

});
