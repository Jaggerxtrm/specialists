import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectMandatoryRulesInjection, Supervisor } from '../../../src/specialist/supervisor.js';

const supervisors: Supervisor[] = [];
const tempDirs: string[] = [];
const originalJobFileOutput = process.env.SPECIALISTS_JOB_FILE_OUTPUT;
process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';

afterAll(() => {
  if (originalJobFileOutput === undefined) delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
  else process.env.SPECIALISTS_JOB_FILE_OUTPUT = originalJobFileOutput;
});

afterEach(async () => {
  await Promise.all(supervisors.splice(0).map(supervisor => supervisor.dispose()));
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeSupervisor(
  emit: (onEvent: (type: string, details: Record<string, unknown>) => void) => Promise<Record<string, unknown>>,
): Supervisor {
  const root = mkdtempSync(join(tmpdir(), 'supervisor-mandatory-budget-'));
  tempDirs.push(root);
  const supervisor = new Supervisor({
    jobsDir: join(root, 'jobs'),
    runner: {
      run: async (_options: unknown, _onProgress: unknown, onEvent: (type: string, details: Record<string, unknown>) => void) => emit(onEvent),
    } as any,
    runOptions: { name: 'test-specialist', prompt: 'test', workingDirectory: root } as any,
  });
  supervisors.push(supervisor);
  return supervisor;
}

describe('projectMandatoryRulesInjection', () => {
  it('preserves exact final budgeting telemetry for status consumers', () => {
    expect(projectMandatoryRulesInjection({
      sets_loaded: ['floor'],
      rules_count: 1,
      inline_rules_count: 0,
      globals_disabled: true,
      token_estimate: 14,
      budget_limit: 2000,
      candidate_tokens: 2300,
      injected_tokens: 14,
      injected_section_ids: ['floor'],
      evicted_section_ids: ['optional'],
      payload_digest: 'a'.repeat(64),
      outcome: 'degraded',
    })).toEqual({
      sets_loaded: ['floor'],
      rules_count: 1,
      inline_rules_count: 0,
      globals_disabled: true,
      token_estimate: 14,
      budget_limit: 2000,
      candidate_tokens: 2300,
      injected_tokens: 14,
      injected_section_ids: ['floor'],
      evicted_section_ids: ['optional'],
      payload_digest: 'a'.repeat(64),
      outcome: 'degraded',
    });
  });

  it('preserves an impossible outcome for fail-closed status consumers', () => {
    expect(projectMandatoryRulesInjection({
      budget_limit: 2000,
      candidate_tokens: 2400,
      injected_tokens: 0,
      injected_section_ids: [],
      evicted_section_ids: ['floor'],
      payload_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      outcome: 'impossible',
    })).toMatchObject({
      budget_limit: 2000,
      candidate_tokens: 2400,
      injected_tokens: 0,
      injected_section_ids: [],
      evicted_section_ids: ['floor'],
      outcome: 'impossible',
    });
  });
});

describe('Supervisor mandatory-rule budget persistence', () => {
  it('persists degraded final-payload telemetry in job status', async () => {
    const data = {
      sets_loaded: ['floor'],
      rules_count: 1,
      inline_rules_count: 0,
      globals_disabled: true,
      token_estimate: 14,
      budget_limit: 2000,
      candidate_tokens: 2300,
      injected_tokens: 14,
      injected_section_ids: ['floor'],
      evicted_section_ids: ['optional'],
      payload_digest: 'a'.repeat(64),
      outcome: 'degraded' as const,
    };
    const supervisor = makeSupervisor(async onEvent => {
      onEvent('meta', {
        source: 'mandatory_rules_injection',
        data,
        summary: JSON.stringify({ kind: 'meta', source: 'mandatory_rules_injection', data }),
      });
      return { output: 'done', model: 'test', backend: 'test', durationMs: 1 };
    });

    const id = await supervisor.run();

    expect(supervisor.readStatus(id)?.startup_context?.mandatory_rules_injection).toEqual(data);
  });

  it('persists impossible telemetry when prompt construction aborts', async () => {
    const data = {
      budget_limit: 2000,
      candidate_tokens: 2400,
      injected_tokens: 0,
      injected_section_ids: [],
      evicted_section_ids: ['floor'],
      payload_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      outcome: 'impossible' as const,
    };
    const supervisor = makeSupervisor(async onEvent => {
      onEvent('meta', {
        source: 'mandatory_rules_injection',
        data,
        summary: JSON.stringify({ kind: 'meta', source: 'mandatory_rules_injection', data }),
      });
      throw new Error('Mandatory rules MUST_KEEP floor requires 2400 tokens, exceeding budget 2000');
    });

    await expect(supervisor.run()).rejects.toThrow('MUST_KEEP floor requires 2400 tokens');
    const [id] = supervisor.listJobs();

    expect(id?.startup_context?.mandatory_rules_injection).toMatchObject(data);
    expect(id?.status).toBe('error');
  });
});
