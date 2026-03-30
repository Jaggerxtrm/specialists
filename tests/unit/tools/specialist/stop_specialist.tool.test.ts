import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStopSpecialistTool } from '../../../../src/tools/specialist/stop_specialist.tool.js';

describe('stop_specialist tool', () => {
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specialists-stop-tool-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns error when job does not exist', async () => {
    const tool = createStopSpecialistTool();
    const result = await tool.execute({ job_id: 'missing' }) as any;

    expect(result).toEqual({
      status: 'error',
      error: 'Job not found: missing',
      job_id: 'missing',
    });
  });

  it('kills pid from supervisor status.json', async () => {
    const tool = createStopSpecialistTool();
    const jobsDir = join(tempDir, '.specialists', 'jobs', 'abc123');
    mkdirSync(jobsDir, { recursive: true });
    writeFileSync(join(jobsDir, 'status.json'), JSON.stringify({
      id: 'abc123',
      specialist: 'debugger',
      status: 'running',
      pid: 4242,
      started_at_ms: Date.now(),
    }));

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);
    const result = await tool.execute({ job_id: 'abc123' }) as any;

    expect(killSpy).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(result).toEqual({ status: 'cancelled', job_id: 'abc123', pid: 4242 });
  });
});
