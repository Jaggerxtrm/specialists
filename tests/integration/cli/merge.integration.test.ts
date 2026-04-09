import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { execSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const repoRoot = resolve(import.meta.dirname, '../../..');
const entry = join(repoRoot, 'src/index.ts');

function runCli(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync('bun', [entry, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', ...env },
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

async function writeMockBd(binDir: string): Promise<void> {
  const script = `#!/usr/bin/env bash
set -e
if [[ "$1" == "show" ]]; then
  id="$2"
  if [[ "$id" == "unitAI-epic1" ]]; then
    echo '[{"id":"unitAI-epic1","title":"epic","issue_type":"epic"}]'
    exit 0
  fi
  if [[ "$id" == "unitAI-a" ]]; then
    echo '[{"id":"unitAI-a","title":"a","dependencies":[{"id":"unitAI-b"}]}]'
    exit 0
  fi
  if [[ "$id" == "unitAI-b" ]]; then
    echo '[{"id":"unitAI-b","title":"b","dependencies":[{"id":"unitAI-c"}]}]'
    exit 0
  fi
  if [[ "$id" == "unitAI-c" ]]; then
    echo '[{"id":"unitAI-c","title":"c","dependencies":[]}]'
    exit 0
  fi
fi
if [[ "$1" == "children" ]]; then
  echo '[{"id":"unitAI-a"},{"id":"unitAI-b"},{"id":"unitAI-c"}]'
  exit 0
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

describe('integration: merge CLI', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sp-merge-integration-'));
    await initRepo(tempDir);

    const baseBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
    await createBranchCommit(tempDir, baseBranch, 'feature/c', 'c.txt');
    await createBranchCommit(tempDir, baseBranch, 'feature/b', 'b.txt');
    await createBranchCommit(tempDir, baseBranch, 'feature/a', 'a.txt');

    await mkdir(join(tempDir, '.specialists', 'jobs', 'job-a'), { recursive: true });
    await mkdir(join(tempDir, '.specialists', 'jobs', 'job-b'), { recursive: true });
    await mkdir(join(tempDir, '.specialists', 'jobs', 'job-c'), { recursive: true });

    await writeFile(
      join(tempDir, '.specialists', 'jobs', 'job-a', 'status.json'),
      JSON.stringify({ id: 'job-a', bead_id: 'unitAI-a', status: 'done', branch: 'feature/a', worktree_path: '/tmp/a', started_at_ms: 3 }),
      'utf-8',
    );
    await writeFile(
      join(tempDir, '.specialists', 'jobs', 'job-b', 'status.json'),
      JSON.stringify({ id: 'job-b', bead_id: 'unitAI-b', status: 'done', branch: 'feature/b', worktree_path: '/tmp/b', started_at_ms: 2 }),
      'utf-8',
    );
    await writeFile(
      join(tempDir, '.specialists', 'jobs', 'job-c', 'status.json'),
      JSON.stringify({ id: 'job-c', bead_id: 'unitAI-c', status: 'done', branch: 'feature/c', worktree_path: '/tmp/c', started_at_ms: 1 }),
      'utf-8',
    );

    const binDir = join(tempDir, 'bin');
    await mkdir(binDir, { recursive: true });
    await writeMockBd(binDir);
    await writeMockBunx(binDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('merges epic child branches in topological order', async () => {
    const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

    const result = runCli(tempDir, ['merge', 'unitAI-epic1'], { PATH: pathPrefix });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('feature/c');
    expect(result.stdout).toContain('feature/b');
    expect(result.stdout).toContain('feature/a');

    const cIndex = result.stdout.indexOf('feature/c');
    const bIndex = result.stdout.indexOf('feature/b');
    const aIndex = result.stdout.indexOf('feature/a');
    expect(cIndex).toBeLessThan(bIndex);
    expect(bIndex).toBeLessThan(aIndex);

    const gitLog = execSync('git log --merges --pretty=%s -n 3', { cwd: tempDir, encoding: 'utf-8' });
    expect(gitLog).toContain("Merge branch 'feature/a'");
    expect(gitLog).toContain("Merge branch 'feature/b'");
    expect(gitLog).toContain("Merge branch 'feature/c'");

    const aFile = await readFile(join(tempDir, 'a.txt'), 'utf-8');
    const bFile = await readFile(join(tempDir, 'b.txt'), 'utf-8');
    const cFile = await readFile(join(tempDir, 'c.txt'), 'utf-8');
    expect(aFile).toContain('feature/a');
    expect(bFile).toContain('feature/b');
    expect(cFile).toContain('feature/c');
  });
});
