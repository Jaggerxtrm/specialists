import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_PROMETHEUS_LABELS,
  forensicEventFromTimelineEvent,
  projectRootRuntimeOrigin,
  projectSpawnedByLink,
  type TimelineForensicContext,
} from '../../../src/specialist/forensic-events.js';

const VALID_ORIGIN = {
  schema_version: 'xtrm.runtime-origin.v1',
  kind: 'xtmux.agent_instance',
  host_id: 'host-01J2M8GQY8J4Y6T3D3V6',
  tmux_session_id: '$3',
  tmux_window_id: '@7',
  tmux_pane_id: '%17',
  agent_instance_id: '7cc0b27f-41b0-4cae-b6e8-6929035bbb44',
  captured_at_ms: 1_700_000_000_000,
  capture_source: 'xtmux-context',
  verified: true,
} as const;

const BASE_CONTEXT: TimelineForensicContext = {
  jobId: 'j1',
  specialist: 'executor',
};

const RUN_START = { t: 1_700_000_001_000, seq: 1, type: 'run_start', specialist: 'executor', bead_id: 'unitAI-abc' };

describe('FORBIDDEN_PROMETHEUS_LABELS — spec §16 additions', () => {
  it.each([
    'parent_job_id',
    'agent_instance_id',
    'host_id',
    'tmux_session_id',
    'tmux_window_id',
    'tmux_pane_id',
  ])('contains %s', (key) => {
    expect(FORBIDDEN_PROMETHEUS_LABELS.has(key)).toBe(true);
  });
});

describe('projectSpawnedByLink — whitelist projection', () => {
  it('projects pane spawn origin', () => {
    const link = projectSpawnedByLink({ kind: 'xtmux.agent_instance', runtime_origin: VALID_ORIGIN });
    expect(link).toEqual({
      kind: 'xtmux.agent_instance',
      host_id: VALID_ORIGIN.host_id,
      tmux_session_id: VALID_ORIGIN.tmux_session_id,
      tmux_window_id: VALID_ORIGIN.tmux_window_id,
      tmux_pane_id: VALID_ORIGIN.tmux_pane_id,
      agent_instance_id: VALID_ORIGIN.agent_instance_id,
    });
  });

  it('projects specialist.job spawn origin', () => {
    const link = projectSpawnedByLink({ kind: 'specialist.job', parent_job_id: 'parent-42' });
    expect(link).toEqual({ kind: 'specialist.job', job_id: 'parent-42' });
  });

  it('returns undefined for kind:unknown', () => {
    expect(projectSpawnedByLink({ kind: 'unknown' })).toBeUndefined();
  });

  it('returns undefined for missing runtime_origin', () => {
    expect(projectSpawnedByLink({ kind: 'xtmux.agent_instance' })).toBeUndefined();
  });

  it('returns undefined for malformed input', () => {
    expect(projectSpawnedByLink(null)).toBeUndefined();
    expect(projectSpawnedByLink('nope')).toBeUndefined();
    expect(projectSpawnedByLink({ kind: 'specialist.job' })).toBeUndefined();
  });

  it('drops unknown pass-through fields on runtime_origin (redaction whitelist)', () => {
    const link = projectSpawnedByLink({
      kind: 'xtmux.agent_instance',
      runtime_origin: { ...VALID_ORIGIN, prompt: 'INJECTED', raw_command: 'x' },
    });
    expect(link).not.toHaveProperty('prompt');
    expect(link).not.toHaveProperty('raw_command');
  });
});

describe('projectRootRuntimeOrigin — whitelist projection', () => {
  it('projects a valid root', () => {
    const r = projectRootRuntimeOrigin(VALID_ORIGIN);
    expect(r).toEqual({
      kind: 'xtmux.agent_instance',
      host_id: VALID_ORIGIN.host_id,
      tmux_pane_id: VALID_ORIGIN.tmux_pane_id,
      agent_instance_id: VALID_ORIGIN.agent_instance_id,
    });
  });

  it('returns undefined when required fields missing', () => {
    expect(projectRootRuntimeOrigin({ host_id: 'x' })).toBeUndefined();
    expect(projectRootRuntimeOrigin(null)).toBeUndefined();
  });

  it('drops unknown fields', () => {
    const r = projectRootRuntimeOrigin({ ...VALID_ORIGIN, prompt: 'INJECTED' });
    expect(r).not.toHaveProperty('prompt');
    expect(r).not.toHaveProperty('bead_id');
  });
});

describe('forensicEventFromTimelineEvent — run_start enrichment', () => {
  it('emits links + body for a direct pane spawn (spec §13.5 sample)', () => {
    const ev = forensicEventFromTimelineEvent(RUN_START, {
      ...BASE_CONTEXT,
      spawnOrigin: { kind: 'xtmux.agent_instance', runtime_origin: VALID_ORIGIN },
      rootRuntimeOrigin: VALID_ORIGIN,
    });
    expect(ev.event_name).toBe('job.started');
    expect((ev.links as { spawned_by: unknown })?.spawned_by).toEqual({
      kind: 'xtmux.agent_instance',
      host_id: VALID_ORIGIN.host_id,
      tmux_session_id: VALID_ORIGIN.tmux_session_id,
      tmux_window_id: VALID_ORIGIN.tmux_window_id,
      tmux_pane_id: VALID_ORIGIN.tmux_pane_id,
      agent_instance_id: VALID_ORIGIN.agent_instance_id,
    });
    expect((ev.links as { root_runtime_origin: unknown })?.root_runtime_origin).toEqual({
      kind: 'xtmux.agent_instance',
      host_id: VALID_ORIGIN.host_id,
      tmux_pane_id: VALID_ORIGIN.tmux_pane_id,
      agent_instance_id: VALID_ORIGIN.agent_instance_id,
    });
    expect(ev.body.origin_source).toBe('xtmux-context');
    expect(ev.body.origin_verified).toBe(true);
    expect(ev.body.launch_mode).toBe('foreground');
    expect(ev.correlation.parent_job_id).toBeUndefined();
  });

  it('emits propagated origin_source + background launch_mode for propagated origin', () => {
    const propagated = { ...VALID_ORIGIN, capture_source: 'propagated' };
    const ev = forensicEventFromTimelineEvent(RUN_START, {
      ...BASE_CONTEXT,
      spawnOrigin: { kind: 'xtmux.agent_instance', runtime_origin: propagated },
      rootRuntimeOrigin: propagated,
    });
    expect(ev.body.origin_source).toBe('propagated');
    expect(ev.body.launch_mode).toBe('background');
  });

  it('emits specialist.job link + correlation.parent_job_id for a child job', () => {
    const ev = forensicEventFromTimelineEvent(RUN_START, {
      ...BASE_CONTEXT,
      jobId: 'j2',
      parentJobId: 'j1',
      spawnOrigin: { kind: 'specialist.job', parent_job_id: 'j1' },
      rootRuntimeOrigin: VALID_ORIGIN,
    });
    expect((ev.links as { spawned_by: unknown })?.spawned_by).toEqual({
      kind: 'specialist.job',
      job_id: 'j1',
    });
    expect((ev.links as { root_runtime_origin: unknown })?.root_runtime_origin).toBeDefined();
    expect(ev.body.origin_source).toBe('child-of-specialist');
    expect(ev.correlation.parent_job_id).toBe('j1');
  });

  it.each([
    ['propagated', { ...VALID_ORIGIN, capture_source: 'propagated' }, 'background'],
    ['xtmux-context', VALID_ORIGIN, 'foreground'],
    ['missing', undefined, 'unknown'],
    ['unknown', { ...VALID_ORIGIN, capture_source: 'future-source' }, 'unknown'],
  ] as const)('maps a child with %s root origin to the expected launch mode', (_rootState, rootRuntimeOrigin, launchMode) => {
    const ev = forensicEventFromTimelineEvent(RUN_START, {
      ...BASE_CONTEXT,
      jobId: 'j2',
      parentJobId: 'j1',
      spawnOrigin: { kind: 'specialist.job', parent_job_id: 'j1' },
      rootRuntimeOrigin,
    });

    expect(ev.body.launch_mode).toBe(launchMode);
  });

  it('omits links entirely when no origin present', () => {
    const ev = forensicEventFromTimelineEvent(RUN_START, BASE_CONTEXT);
    expect(ev.links).toBeUndefined();
    expect(ev.body.origin_source).toBe('none');
    expect(ev.body.origin_verified).toBe(false);
    expect(ev.correlation.parent_job_id).toBeUndefined();
  });

  it('does NOT emit links on non-run_start events', () => {
    const other = { t: 1_700_000_001_000, seq: 2, type: 'meta', backend: 'anthropic', model: 'claude-opus-4-7' };
    const ev = forensicEventFromTimelineEvent(other, {
      ...BASE_CONTEXT,
      spawnOrigin: { kind: 'xtmux.agent_instance', runtime_origin: VALID_ORIGIN },
      rootRuntimeOrigin: VALID_ORIGIN,
    });
    expect(ev.links).toBeUndefined();
  });

  it('never emits kind:unknown as a link — reader assumes missing = no known binding', () => {
    const ev = forensicEventFromTimelineEvent(RUN_START, {
      ...BASE_CONTEXT,
      spawnOrigin: { kind: 'unknown' },
    });
    expect(ev.links).toBeUndefined();
  });
});
