// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { describe, expect, it } from 'vitest';
import { createChatControl, dispatchInput, type ControlOps } from '../../../src/cli/chat/control.js';

describe('chat mailbox routing boundary', () => {
  it('routes running text to steer and waiting text to resume', () => {
    expect(dispatchInput('move faster', { jobState: 'running' })).toEqual({ kind: 'steer', text: 'move faster' });
    expect(dispatchInput('continue', { jobState: 'waiting' })).toEqual({ kind: 'resume', text: 'continue' });
  });

  it('rejects freeform input for terminal jobs', () => {
    expect(dispatchInput('again', { jobState: 'done' })).toEqual({ kind: 'reject', message: 'freeform input rejected in terminal state' });
  });

  it('dispatcher rejects post after state flips between snapshot and execute', async () => {
    let callCount = 0;
    const getJobState = async () => (callCount++ === 0 ? 'running' : 'done') as const;
    const controlOps: ControlOps = {
      getJobState,
      stopJob: async () => ({ ok: true, message: 'stop ok' }),
      finalizeJob: async () => ({ ok: true, message: 'finalize ok' }),
      appendBeadNote: async () => ({ ok: true, message: 'note ok' }),
    };

    const chat = createChatControl(controlOps);
    const action = await chat.executeInput('continue working', { jobId: 'job-1', jobState: 'running' });

    expect(action).toEqual({ kind: 'reject', message: 'freeform input rejected in terminal state' });
    expect(callCount).toBe(2);
  });
});
