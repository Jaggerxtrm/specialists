import { describe, expect, it } from 'vitest';
import { formatSpawnedByLine } from '../../../src/cli/ps.js';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

const BASE: SupervisorStatus = {
  id: 'j1',
  specialist: 'executor',
  status: 'running',
  started_at_ms: 0,
};

const ORIGIN = {
  schema_version: 'xtrm.runtime-origin.v1' as const,
  kind: 'xtmux.agent_instance' as const,
  host_id: 'host-01J2M8GQY8J4Y6T3D3V6',
  tmux_session_id: '$3',
  tmux_window_id: '@7',
  tmux_pane_id: '%17',
  agent_instance_id: '7cc0b27f-41b0-4cae-b6e8-6929035bbb44',
  captured_at_ms: 0,
  capture_source: 'xtmux-context' as const,
  verified: true,
};

describe('formatSpawnedByLine', () => {
  it('renders a pane origin with short host + session:pane + agent prefix', () => {
    const line = formatSpawnedByLine({
      ...BASE,
      spawn_origin: { kind: 'xtmux.agent_instance', runtime_origin: ORIGIN },
    });
    expect(line).toBe('spawned-by host-01J2M8GQ / $3:%17 / agent 7cc0b27f');
  });

  it('omits agent segment when agent_instance_id is absent', () => {
    const line = formatSpawnedByLine({
      ...BASE,
      spawn_origin: {
        kind: 'xtmux.agent_instance',
        runtime_origin: { ...ORIGIN, agent_instance_id: undefined },
      },
    });
    expect(line).toBe('spawned-by host-01J2M8GQ / $3:%17');
  });

  it('renders a specialist.job spawn as spawned-by specialist.job <parent-short>', () => {
    const line = formatSpawnedByLine({
      ...BASE,
      spawn_origin: { kind: 'specialist.job', parent_job_id: 'parent-4242-abcdef' },
    });
    expect(line).toBe('spawned-by specialist.job parent-4');
  });

  it('returns undefined for a job without spawn_origin', () => {
    expect(formatSpawnedByLine(BASE)).toBeUndefined();
  });

  it('returns undefined for kind:unknown — no misleading line', () => {
    expect(formatSpawnedByLine({ ...BASE, spawn_origin: { kind: 'unknown' } })).toBeUndefined();
  });
});
