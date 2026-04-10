import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createObservabilitySqliteClient } from '../../../src/specialist/observability-sqlite.js';
import { resolveObservabilityDbLocation, ensureObservabilityDbFile } from '../../../src/specialist/observability-db.js';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const entry = join(repoRoot, 'src/index.ts');

function runCli(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync('bun', [entry, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function initRepo(cwd: string): Promise<void> {
  execSync('git init', { cwd, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd });
  execSync('git config user.name "Test User"', { cwd });
  await writeFile(join(cwd, 'shared.txt'), 'base\n', 'utf-8');
  execSync('git add .', { cwd, stdio: 'ignore' });
  execSync('git commit -m "base"', { cwd, stdio: 'ignore' });
}

async function createBranchCommit(cwd: string, baseBranch: string, branch: string, fileName: string): Promise<void> {
  execSync(`git checkout -b ${branch}`, { cwd, stdio: 'ignore' });
  await writeFile(join(cwd, fileName), `${branch}\n`, 'utf-8');
  execSync('git add .', { cwd, stdio: 'ignore' });
  execSync(`git commit -m "${branch}"`, { cwd, stdio: 'ignore' });
  execSync(`git checkout ${baseBranch}`, { cwd, stdio: 'ignore' });
}

function createStatus(options: {
  id: string;
  beadId: string;
  branch: string;
  status: SupervisorStatus['status'];
  startedAtMs: number;
  chainId: string;
  chainRootJobId: string;
  chainRootBeadId: string;
  epicId: string;
}): SupervisorStatus {
  return {
    id: options.id,
    specialist: 'executor',
    status: options.status,
    started_at_ms: options.startedAtMs,
    bead_id: options.beadId,
    branch: options.branch,
    worktree_path: `/tmp/${options.id}`,
    chain_id: options.chainId,
    chain_root_job_id: options.chainRootJobId,
    chain_root_bead_id: options.chainRootBeadId,
    epic_id: options.epicId,
  };
}

async function writeMockBd(binDir: string): Promise<void> {
  const script = `#!/usr/bin/env bash
set -e
if [[ "$1" == "show" ]]; then
  id="$2"
  if [[ "$id" == "unitAI-epic1" ]]; then
    echo '[{"id":"unitAI-epic1","title":"Epic 1","issue_type":"epic"}]'
    exit 0
  fi
  if [[ "$id" == "unitAI-epic-resolved" ]]; then
    echo '[{"id":"unitAI-epic-resolved","title":"Resolved Epic","issue_type":"epic"}]'
    exit 0
  fi
  if [[ "$id" == "unitAI-chain-a" ]]; then
    echo '[{"id":"unitAI-chain-a","title":"Chain A","parent":"unitAI-epic1","dependencies":[{"id":"unitAI-chain-b"}]}]'
    exit 0
  fi
  if [[ "$id" == "unitAI-chain-b" ]]; then
    echo '[{"id":"unitAI-chain-b","title":"Chain B","parent":"unitAI-epic1","dependencies":[]}]'
    exit 0
  fi
  if [[ "$id" == "unitAI-standalone" ]]; then
    echo '[{"id":"unitAI-standalone","title":"Standalone Chain","dependencies":[]}]'
    exit 0
  fi
fi
if [[ "$1" == "children" ]]; then
  epic="$2"
  if [[ "$epic" == "unitAI-epic1" ]]; then
    echo '[{"id":"unitAI-chain-a"},{"id":"unitAI-chain-b"}]'
    exit 0
  fi
  if [[ "$epic" == "unitAI-epic-resolved" ]]; then
    echo '[{"id":"unitAI-chain-resolved"}]'
    exit 0
  fi
fi
if [[ "$1" == "--version" ]]; then
  echo 'bd-test'
  exit 0
fi
exit 1
`;

  const path = join(binDir, 'bd');
  await writeFile(path, script, 'utf-8');
  await chmod(path, 0o755);
}

async function writeMockBunx(binDir: string): Promise<void> {
  const script = `#!/usr/bin/env bash
set -e
if [[ "$1" == "tsc" ]]; then
  exit 0
fi
exit 1
`;

  const path = join(binDir, 'bunx');
  await writeFile(path, script, 'utf-8');
  await chmod(path, 0o755);
}

async function writeMockGh(binDir: string): Promise<void> {
  const script = `#!/usr/bin/env bash
set -e
if [[ "$1" == "pr" && "$2" == "create" ]]; then
  # Extract title from arguments
  title=""
  body=""
  base=""
  head=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --title) title="$2"; shift 2 ;;
      --body) body="$2"; shift 2 ;;
      --base) base="$2"; shift 2 ;;
      --head) head="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  # Return a fake PR URL
  echo "https://github.com/test/repo/pull/123"
  exit 0
fi
exit 1
`;

  const path = join(binDir, 'gh');
  await writeFile(path, script, 'utf-8');
  await chmod(path, 0o755);
}

async function writeMockBun(binDir: string): Promise<void> {
  const script = `#!/usr/bin/env bash
set -e
if [[ "$1" == "run" && "$2" == "build" ]]; then
  exit 0
fi
exit 1
`;

  const path = join(binDir, 'bun');
  await writeFile(path, script, 'utf-8');
  await chmod(path, 0o755);
}

describe('integration: sp end CLI', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sp-end-integration-'));
    await initRepo(tempDir);

    const baseBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
    await createBranchCommit(tempDir, baseBranch, 'feature/chain-b', 'b.txt');
    await createBranchCommit(tempDir, baseBranch, 'feature/chain-a', 'a.txt');
    await createBranchCommit(tempDir, baseBranch, 'feature/standalone', 'standalone.txt');

    await mkdir(join(tempDir, '.specialists', 'jobs', 'job-chain-a'), { recursive: true });
    await mkdir(join(tempDir, '.specialists', 'jobs', 'job-chain-b'), { recursive: true });
    await mkdir(join(tempDir, '.specialists', 'jobs', 'job-standalone'), { recursive: true });

    // Initialize observability database
    const dbLocation = resolveObservabilityDbLocation(tempDir);
    ensureObservabilityDbFile(dbLocation);

    const sqlite = createObservabilitySqliteClient(tempDir);
    if (!sqlite) {
      throw new Error('failed to initialize observability sqlite in temp repo');
    }

    const now = Date.now();

    // Create unresolved epic with chains
    sqlite.upsertEpicRun({
      epic_id: 'unitAI-epic1',
      status: 'open',
      updated_at_ms: now,
      status_json: JSON.stringify({ epic_id: 'unitAI-epic1', status: 'open' }),
    });

    sqlite.upsertEpicChainMembership({
      chain_id: 'chain-a',
      epic_id: 'unitAI-epic1',
      chain_root_bead_id: 'unitAI-chain-a',
      chain_root_job_id: 'job-chain-a',
      updated_at_ms: now,
    });

    sqlite.upsertEpicChainMembership({
      chain_id: 'chain-b',
      epic_id: 'unitAI-epic1',
      chain_root_bead_id: 'unitAI-chain-b',
      chain_root_job_id: 'job-chain-b',
      updated_at_ms: now,
    });

    // Create resolved (merged) epic
    sqlite.upsertEpicRun({
      epic_id: 'unitAI-epic-resolved',
      status: 'merged',
      updated_at_ms: now,
      status_json: JSON.stringify({ epic_id: 'unitAI-epic-resolved', status: 'merged' }),
    });

    // Chain job statuses for unresolved epic
    sqlite.upsertStatus(createStatus({
      id: 'job-chain-a',
      beadId: 'unitAI-chain-a',
      branch: 'feature/chain-a',
      status: 'done',
      startedAtMs: now,
      chainId: 'chain-a',
      chainRootJobId: 'job-chain-a',
      chainRootBeadId: 'unitAI-chain-a',
      epicId: 'unitAI-epic1',
    }));

    sqlite.upsertStatus(createStatus({
      id: 'job-chain-b',
      beadId: 'unitAI-chain-b',
      branch: 'feature/chain-b',
      status: 'done',
      startedAtMs: now,
      chainId: 'chain-b',
      chainRootJobId: 'job-chain-b',
      chainRootBeadId: 'unitAI-chain-b',
      epicId: 'unitAI-epic1',
    }));

    // Standalone chain (no epic)
    sqlite.upsertStatus({
      id: 'job-standalone',
      specialist: 'executor',
      status: 'done',
      started_at_ms: now,
      bead_id: 'unitAI-standalone',
      branch: 'feature/standalone',
      worktree_path: '/tmp/standalone',
      chain_id: 'standalone',
      chain_root_job_id: 'job-standalone',
      chain_root_bead_id: 'unitAI-standalone',
    });

    sqlite.close();

    await writeFile(
      join(tempDir, '.specialists', 'jobs', 'job-chain-a', 'status.json'),
      JSON.stringify({
        id: 'job-chain-a',
        bead_id: 'unitAI-chain-a',
        status: 'done',
        branch: 'feature/chain-a',
        worktree_path: '/tmp/chain-a',
        started_at_ms: now,
      }),
      'utf-8',
    );

    await writeFile(
      join(tempDir, '.specialists', 'jobs', 'job-chain-b', 'status.json'),
      JSON.stringify({
        id: 'job-chain-b',
        bead_id: 'unitAI-chain-b',
        status: 'done',
        branch: 'feature/chain-b',
        worktree_path: '/tmp/chain-b',
        started_at_ms: now,
      }),
      'utf-8',
    );

    await writeFile(
      join(tempDir, '.specialists', 'jobs', 'job-standalone', 'status.json'),
      JSON.stringify({
        id: 'job-standalone',
        bead_id: 'unitAI-standalone',
        status: 'done',
        branch: 'feature/standalone',
        worktree_path: '/tmp/standalone',
        started_at_ms: now,
      }),
      'utf-8',
    );

    const binDir = join(tempDir, 'bin');
    await mkdir(binDir, { recursive: true });
    await writeMockBd(binDir);
    await writeMockBunx(binDir);
    await writeMockGh(binDir);
    await writeMockBun(binDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('epic-aware blocking and redirect', () => {
    it('sp end --bead <chain-in-unresolved-epic> refuses bypass and redirects to sp epic merge', () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Chain belongs to unresolved epic (open state)
      const result = runCli(tempDir, ['end', '--bead', 'unitAI-chain-a'], { PATH: pathPrefix });

      // Should redirect to epic merge, not fail outright
      // But since epic is in 'open' state, epic merge will also refuse
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('unitAI-epic1');
    });

    it('sp end --epic delegates directly to sp epic merge with correct flags', async () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Resolve the epic first
      const resolveResult = runCli(tempDir, ['epic', 'resolve', 'unitAI-epic1'], { PATH: pathPrefix });
      expect(resolveResult.status).toBe(0);

      // Now sp end --epic should delegate to sp epic merge
      const endResult = runCli(tempDir, ['end', '--epic', 'unitAI-epic1'], { PATH: pathPrefix });

      expect(endResult.status).toBe(0);
      expect(endResult.stdout).toContain('Epic unitAI-epic1');
      expect(endResult.stdout).toContain('Publication successful');

      // Verify files were merged
      const aFile = await readFile(join(tempDir, 'a.txt'), 'utf-8').catch(() => '');
      const bFile = await readFile(join(tempDir, 'b.txt'), 'utf-8').catch(() => '');
      expect(aFile).toContain('feature/chain-a');
      expect(bFile).toContain('feature/chain-b');
    });

    it('sp end --bead <standalone-chain> succeeds without epic redirect', async () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Standalone chain has no epic membership
      const result = runCli(tempDir, ['end', '--bead', 'unitAI-standalone'], { PATH: pathPrefix });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Merge complete');
      expect(result.stdout).toContain('feature/standalone');

      const standaloneFile = await readFile(join(tempDir, 'standalone.txt'), 'utf-8');
      expect(standaloneFile).toContain('feature/standalone');
    });

    it('sp end --bead <chain-in-resolved-epic> succeeds (terminal epic allows direct merge)', async () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Create a branch for the resolved epic chain
      const baseBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
      await createBranchCommit(tempDir, baseBranch, 'feature/chain-resolved', 'resolved.txt');

      // Add job status for resolved chain
      const sqlite = createObservabilitySqliteClient(tempDir);
      if (!sqlite) throw new Error('sqlite unavailable');

      const now = Date.now();
      sqlite.upsertEpicChainMembership({
        chain_id: 'chain-resolved',
        epic_id: 'unitAI-epic-resolved',
        chain_root_bead_id: 'unitAI-chain-resolved',
        chain_root_job_id: 'job-chain-resolved',
        updated_at_ms: now,
      });

      sqlite.upsertStatus(createStatus({
        id: 'job-chain-resolved',
        beadId: 'unitAI-chain-resolved',
        branch: 'feature/chain-resolved',
        status: 'done',
        startedAtMs: now,
        chainId: 'chain-resolved',
        chainRootJobId: 'job-chain-resolved',
        chainRootBeadId: 'unitAI-chain-resolved',
        epicId: 'unitAI-epic-resolved',
      }));

      sqlite.close();

      await mkdir(join(tempDir, '.specialists', 'jobs', 'job-chain-resolved'), { recursive: true });
      await writeFile(
        join(tempDir, '.specialists', 'jobs', 'job-chain-resolved', 'status.json'),
        JSON.stringify({
          id: 'job-chain-resolved',
          bead_id: 'unitAI-chain-resolved',
          status: 'done',
          branch: 'feature/chain-resolved',
          worktree_path: '/tmp/resolved',
          started_at_ms: now,
        }),
        'utf-8',
      );

      // Update bd mock for this chain
      const bdScript = await readFile(join(tempDir, 'bin', 'bd'), 'utf-8');
      const updatedBdScript = bdScript.replace(
        /fi\s+fi\s+if \[\[ "\$1" == "children" \]\]/,
        `fi
  if [[ "$id" == "unitAI-chain-resolved" ]]; then
    echo '[{"id":"unitAI-chain-resolved","title":"Chain Resolved","parent":"unitAI-epic-resolved","dependencies":[]}]'
    exit 0
  fi
fi
if [[ "$1" == "children" ]]`,
      );
      await writeFile(join(tempDir, 'bin', 'bd'), updatedBdScript, 'utf-8');

      // Chain belongs to merged epic (terminal state) - should allow direct merge
      const result = runCli(tempDir, ['end', '--bead', 'unitAI-chain-resolved'], { PATH: pathPrefix });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Merge complete');
      expect(result.stdout).toContain('feature/chain-resolved');
    });
  });

  describe('--pr publication mode', () => {
    it('sp end --epic --pr delegates to sp epic merge with PR mode', () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Resolve the epic first
      runCli(tempDir, ['epic', 'resolve', 'unitAI-epic1'], { PATH: pathPrefix });

      // Now sp end --epic --pr
      const result = runCli(tempDir, ['end', '--epic', 'unitAI-epic1', '--pr'], { PATH: pathPrefix });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Publication mode: PR');
      expect(result.stdout).toContain('https://github.com/test/repo/pull/123');
    });

    it('sp epic merge --pr creates PR and reports URL', () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Resolve the epic first
      runCli(tempDir, ['epic', 'resolve', 'unitAI-epic1'], { PATH: pathPrefix });

      const result = runCli(tempDir, ['epic', 'merge', 'unitAI-epic1', '--pr'], { PATH: pathPrefix });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Publication mode: PR');
      expect(result.stdout).toContain('https://github.com/test/repo/pull/123');
    });

    it('sp end --bead --pr publishes standalone chain as PR', () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      const result = runCli(tempDir, ['end', '--bead', 'unitAI-standalone', '--pr'], { PATH: pathPrefix });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Publication mode: PR');
      expect(result.stdout).toContain('https://github.com/test/repo/pull/123');
    });

    it('PR mode follows same lifecycle constraints as direct merge (blocked epic refuses)', () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Epic is in 'open' state (unresolved) - should refuse even with --pr
      const result = runCli(tempDir, ['end', '--epic', 'unitAI-epic1', '--pr'], { PATH: pathPrefix });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Must be \'resolving\' or \'merge_ready\'');
    });
  });

  describe('failure-mode UX', () => {
    it('sp end without bead/epic inference fails with clear guidance', () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Run sp end without any identifiers (can't infer from non-worktree cwd)
      const result = runCli(tempDir, ['end'], { PATH: pathPrefix });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Unable to infer current chain bead');
      expect(result.stderr).toContain('--bead');
      expect(result.stderr).toContain('--epic');
    });

    it('sp end with unknown bead fails gracefully', () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      const result = runCli(tempDir, ['end', '--bead', 'unknown-bead-id'], { PATH: pathPrefix });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Unable to read bead');
    });

    it('sp end --rebuild passes rebuild flag through to merge', () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Resolve epic first
      runCli(tempDir, ['epic', 'resolve', 'unitAI-epic1'], { PATH: pathPrefix });

      const result = runCli(tempDir, ['end', '--epic', 'unitAI-epic1', '--rebuild'], { PATH: pathPrefix });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Rebuild: bun run build');
    });
  });

  describe('cross-component wiring', () => {
    it('sp end reuses checkEpicUnresolvedGuard from merge.ts', async () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Chain belongs to unresolved epic - should use shared guard logic
      const result = runCli(tempDir, ['end', '--bead', 'unitAI-chain-a'], { PATH: pathPrefix });

      // The guard message should match merge.ts guard output
      expect(result.status).not.toBe(0);
      // Should reference the epic and the correct alternative command
      expect(result.stderr).toMatch(/unitAI-epic1|epic merge/i);
    });

    it('sp end --epic reuses handleEpicMergeCommand from epic.ts', () => {
      const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

      // Resolve first
      runCli(tempDir, ['epic', 'resolve', 'unitAI-epic1'], { PATH: pathPrefix });

      const endResult = runCli(tempDir, ['end', '--epic', 'unitAI-epic1'], { PATH: pathPrefix });
      const epicMergeResult = runCli(tempDir, ['epic', 'merge', 'unitAI-epic1'], { PATH: pathPrefix });

      // Both should produce equivalent output structure
      expect(endResult.status).toBe(epicMergeResult.status);
      expect(endResult.stdout).toContain('Epic unitAI-epic1');
      expect(epicMergeResult.stdout).toContain('Epic unitAI-epic1');
    });
  });

  describe('help output', () => {
    it('sp end --help shows --pr and --epic options', () => {
      const result = runCli(tempDir, ['end', '--help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--pr');
      expect(result.stdout).toContain('--epic');
      expect(result.stdout).toContain('--bead');
    });

    it('sp epic merge --help shows --pr option', () => {
      const result = runCli(tempDir, ['epic', 'merge', '--help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--pr');
    });
  });
});