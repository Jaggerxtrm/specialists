// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseSpecialist } from '../../../src/specialist/schema.js';
import { compatGuard, runScriptSpecialist } from '../../../src/specialist/script-runner.js';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

describe('changelog-drafter specialist', () => {
  it('passes script compat guard', async () => {
    const result = await parseSpecialist(readFileSync('config/specialists/changelog-drafter.specialist.json', 'utf8'));

    expect(result.specialist.execution.permission_required).toBe('READ_ONLY');
    expect(result.specialist.execution.interactive).toBe(false);
    expect(result.specialist.execution.requires_worktree).toBe(false);
    expect(result.specialist.skills?.scripts).toBeUndefined();
    expect(result.specialist.skills?.paths).toBeUndefined();

    expect(() => compatGuard(result)).not.toThrow();
  });

  it('runs direct script request without aliasing', async () => {
    const result = await parseSpecialist(readFileSync('config/specialists/changelog-drafter.specialist.json', 'utf8'));
    const loader = { get: vi.fn().mockResolvedValue(result) } as never;
    const child = new FakeChild();
    spawnMock.mockReturnValue(child as never);

    const outcomePromise = runScriptSpecialist(
      { specialist: 'changelog-drafter', requested_specialist: 'changelog-drafter', template: 'hello' },
      { loader, projectDir: '.', trust: { allowSkills: false, allowLocalScripts: false } },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } })}\n`));
    child.emit('close', 0);

    const outcome = await outcomePromise;

    expect(loader.get).toHaveBeenCalledWith('changelog-drafter');
    expect(outcome).toMatchObject({ success: true });
    if (outcome.success) {
      expect(outcome.meta).toMatchObject({ specialist: 'changelog-drafter', requested_specialist: 'changelog-drafter', resolved_specialist: 'changelog-drafter' });
    }
  });
});
