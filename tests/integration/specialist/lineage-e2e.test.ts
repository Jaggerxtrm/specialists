// F4 (unitAI-z8uli.10): end-to-end lineage fixture.
//
// Simulates spec §18's `agent instance A in pane %17 → executor J1 (background)
// → reviewer J2` scenario at the FORENSIC LAYER: build the three run_start
// events the way E5's emitter would produce them, tear down any state, then
// reconstruct the lineage map purely from the event stream.
//
// A live-with-real-xtmux run is a follow-up once xtmux-j46.2 lands on xtmux
// main — the reconstruction contract itself is verified today against the
// stubbed shape.

import { describe, expect, it } from 'vitest';
import type { RuntimeOriginV1 } from '../../../src/specialist/runtime-origin.js';
import { forensicEventFromTimelineEvent } from '../../../src/specialist/forensic-events.js';
import {
  reconstructLineage,
  redactionSweep,
} from '../../../src/specialist/runtime-origin-reconstruct.js';

const ORIGIN_A: RuntimeOriginV1 = {
  schema_version: 'xtrm.runtime-origin.v1',
  kind: 'xtmux.agent_instance',
  host_id: 'host-01J2M8GQY8J4Y6T3D3V6',
  tmux_session_id: '$3',
  tmux_window_id: '@7',
  tmux_pane_id: '%17',
  agent_instance_id: 'A-7cc0b27f-41b0-4cae-b6e8-6929035bbb44',
  captured_at_ms: 1_700_000_000_000,
  capture_source: 'xtmux-context',
  verified: true,
};

// J1 was launched via `sp run --background` from pane A. Its capture_source is
// 'propagated' after the outer sp run passed SPECIALISTS_RUNTIME_ORIGIN_V1 to
// the detached child (E3).
const ORIGIN_A_PROPAGATED: RuntimeOriginV1 = { ...ORIGIN_A, capture_source: 'propagated' };

describe('F4: A -> J1 -> J2 forensic lineage reconstruction', () => {
  const runStartEvent = (t: number) => ({
    t, seq: 1, type: 'run_start', specialist: 'executor', bead_id: 'bead-X',
  } as { t: number; seq: number; type: string; [key: string]: unknown });

  it('reconstructs pane->J1, J1->J2, J2->A entirely from event stream', () => {
    const ev1 = forensicEventFromTimelineEvent(runStartEvent(1_700_000_001_000), {
      jobId: 'J1',
      specialist: 'executor',
      spawnOrigin: { kind: 'xtmux.agent_instance', runtime_origin: ORIGIN_A_PROPAGATED },
      rootRuntimeOrigin: ORIGIN_A_PROPAGATED,
    });
    const ev2 = forensicEventFromTimelineEvent(runStartEvent(1_700_000_002_000), {
      jobId: 'J2',
      specialist: 'reviewer',
      parentJobId: 'J1',
      spawnOrigin: { kind: 'specialist.job', parent_job_id: 'J1' },
      rootRuntimeOrigin: ORIGIN_A_PROPAGATED,
    });

    const lineage = reconstructLineage([ev1, ev2]);

    const j1 = lineage.get('J1');
    expect(j1?.spawned_by).toEqual({
      kind: 'xtmux.agent_instance',
      host_id: ORIGIN_A.host_id,
      tmux_session_id: ORIGIN_A.tmux_session_id,
      tmux_window_id: ORIGIN_A.tmux_window_id,
      tmux_pane_id: ORIGIN_A.tmux_pane_id,
      agent_instance_id: ORIGIN_A.agent_instance_id,
    });
    expect(j1?.root_agent_instance_id).toBe(ORIGIN_A.agent_instance_id);
    expect(j1?.parent_job_id).toBeUndefined();

    const j2 = lineage.get('J2');
    expect(j2?.parent_job_id).toBe('J1');
    expect(j2?.spawned_by).toEqual({ kind: 'specialist.job', job_id: 'J1' });
    // J2 shares its root pane binding with J1 — the whole chain resolves to A.
    expect(j2?.root_agent_instance_id).toBe(ORIGIN_A.agent_instance_id);
  });

  it('outside-tmux job produces no spawned_by (negative control)', () => {
    const evOutside = forensicEventFromTimelineEvent(runStartEvent(1_700_000_003_000), {
      jobId: 'J-outside',
      specialist: 'executor',
      // No spawnOrigin, no rootRuntimeOrigin — matches sp run outside tmux.
    });
    const lineage = reconstructLineage([evOutside]);
    expect(lineage.get('J-outside')?.spawned_by).toBeUndefined();
    expect(lineage.get('J-outside')?.root_runtime_origin).toBeUndefined();
  });

  it('reconstruction is pure over the event stream (no live state)', () => {
    // Independent copies of the event objects to prove no mutation / no
    // hidden lookup on the runtime.
    const events = [
      forensicEventFromTimelineEvent(runStartEvent(1_700_000_001_000), {
        jobId: 'J1',
        specialist: 'executor',
        spawnOrigin: { kind: 'xtmux.agent_instance', runtime_origin: ORIGIN_A_PROPAGATED },
        rootRuntimeOrigin: ORIGIN_A_PROPAGATED,
      }),
    ];
    const first = reconstructLineage(events);
    const second = reconstructLineage(events);
    expect(first.get('J1')).toEqual(second.get('J1'));
  });
});

describe('F4: redaction sweep — spec §16', () => {
  it('produces zero forbidden-label hits on a clean event stream', () => {
    const events = [
      forensicEventFromTimelineEvent({ t: 1, seq: 1, type: 'run_start' }, {
        jobId: 'J1',
        specialist: 'executor',
        spawnOrigin: { kind: 'xtmux.agent_instance', runtime_origin: ORIGIN_A },
        rootRuntimeOrigin: ORIGIN_A,
      }),
      forensicEventFromTimelineEvent({ t: 2, seq: 2, type: 'run_start' }, {
        jobId: 'J2',
        specialist: 'reviewer',
        parentJobId: 'J1',
        spawnOrigin: { kind: 'specialist.job', parent_job_id: 'J1' },
        rootRuntimeOrigin: ORIGIN_A,
      }),
    ];
    const sweep = redactionSweep(events);
    expect(sweep.forbidden_label_hits).toEqual([]);
    expect(sweep.payload_leaks).toEqual([]);
  });

  it('rejects a synthetic event with a forbidden label promoted onto resource', () => {
    const events = [
      forensicEventFromTimelineEvent({ t: 1, seq: 1, type: 'run_start' }, {
        jobId: 'J1',
        specialist: 'executor',
      }),
    ];
    // Simulate a future regression that leaks tmux_pane_id onto resource.
    (events[0].resource as Record<string, unknown>).tmux_pane_id = '%17';
    const sweep = redactionSweep(events);
    expect(sweep.forbidden_label_hits).toEqual([
      { event: 'job.started#J1', label: 'tmux_pane_id', where: 'resource' },
    ]);
  });

  it('rejects a synthetic event with a prompt leak in body', () => {
    const events = [
      forensicEventFromTimelineEvent({ t: 1, seq: 1, type: 'run_start' }, {
        jobId: 'J1',
        specialist: 'executor',
      }),
    ];
    (events[0].body as Record<string, unknown>).prompt = 'SECRET: do not leak';
    const sweep = redactionSweep(events);
    expect(sweep.payload_leaks[0]?.field).toBe('body.prompt');
    expect(sweep.payload_leaks[0]?.snippet).toContain('SECRET');
  });
});
