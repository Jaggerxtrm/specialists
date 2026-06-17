import { mkdtemp, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Build a per-test specialists config home for live smoke while keeping real HOME/ ~/.pi.
 * Real HOME keeps provider credentials; XDG_CONFIG_HOME scopes global specialist overrides.
 */
export async function createLiveSmokeHome(prefix: string): Promise<{ tempHome: string; env: NodeJS.ProcessEnv }> {
  const tempHome = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(tempHome, '.config', 'specialists'), { recursive: true });

  return {
    tempHome,
    env: {
      ...process.env,
      HOME: process.env.HOME,
      XDG_CONFIG_HOME: join(tempHome, '.config'),
      NO_COLOR: '1',
    },
  };
}

export async function snapshotJobIds(cwd: string): Promise<Set<string>> {
  const ids = await listJobIds(cwd);
  return new Set(ids);
}

export async function waitForNewJobId(
  cwd: string,
  existingJobIds: ReadonlySet<string>,
  timeoutMs = 60_000,
  intervalMs = 500,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const currentIds = await listJobIds(cwd);
    const fresh = currentIds.find((id) => !existingJobIds.has(id));
    if (fresh) return fresh;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return '';
}

async function listJobIds(cwd: string): Promise<string[]> {
  const jobsDir = join(cwd, '.specialists', 'jobs');
  let entries;
  try {
    entries = await readdir(jobsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const seen = new Map<string, number>();
  await Promise.all(
    entries
      .filter(entry => entry.isDirectory() && /^[a-f0-9]{6}$/.test(entry.name))
      .map(async (entry) => {
        const statusJson = join(jobsDir, entry.name, 'status.json');
        try {
          const statusStat = await stat(statusJson);
          seen.set(entry.name, statusStat.mtimeMs);
        } catch {
          // Ignore directories not yet initialized by supervisor lifecycle.
        }
      }),
  );

  return [...seen.entries()]
    .sort(([_idA, atime], [_idB, btime]) => btime - atime)
    .map(([id]) => id);
}
