import { describe, expect, it, vi } from 'vitest';
import {
  captureRuntimeOrigin,
  decodePropagatedOrigin,
  encodePropagatedOrigin,
  validateRuntimeOrigin,
  SPECIALISTS_RUNTIME_ORIGIN_V1,
  type RuntimeOriginV1,
} from '../../../src/specialist/runtime-origin.js';

const VALID: RuntimeOriginV1 = {
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
};

describe('validateRuntimeOrigin', () => {
  it('accepts a valid origin round-trip', () => {
    const r = validateRuntimeOrigin({ ...VALID });
    expect(r).toEqual(VALID);
  });

  it('accepts optional fields absent', () => {
    const min: RuntimeOriginV1 = {
      schema_version: 'xtrm.runtime-origin.v1',
      kind: 'xtmux.agent_instance',
      host_id: 'host-x',
      tmux_session_id: '$1',
      tmux_window_id: '@1',
      tmux_pane_id: '%1',
      captured_at_ms: 0,
      capture_source: 'xtmux-context',
      verified: false,
    };
    expect(validateRuntimeOrigin(min)).toEqual(min);
  });

  it.each([
    ['schema_version', 'wrong-schema-version'],
    ['kind', 'wrong-kind'],
    ['host_id', 'invalid-host-id'],
    ['tmux_session_id', 'invalid-tmux-session-id'],
    ['tmux_window_id', 'invalid-tmux-window-id'],
    ['tmux_pane_id', 'invalid-tmux-pane-id'],
    ['captured_at_ms', 'invalid-captured-at-ms'],
    ['capture_source', 'invalid-capture-source'],
    ['verified', 'invalid-verified'],
  ])('rejects missing required field %s', (field, expected) => {
    const bad: Record<string, unknown> = { ...VALID };
    delete bad[field];
    const r = validateRuntimeOrigin(bad);
    expect('error' in r && r.error).toBe(expected);
  });

  it('rejects wrong schema_version', () => {
    const r = validateRuntimeOrigin({ ...VALID, schema_version: 'xtrm.runtime-origin.v2' });
    expect('error' in r && r.error).toBe('wrong-schema-version');
  });

  it('rejects wrong kind', () => {
    const r = validateRuntimeOrigin({ ...VALID, kind: 'xtmux.something-else' });
    expect('error' in r && r.error).toBe('wrong-kind');
  });

  it('rejects non-string tmux ID', () => {
    const r = validateRuntimeOrigin({ ...VALID, tmux_pane_id: 17 });
    expect('error' in r && r.error).toBe('invalid-tmux-pane-id');
  });

  it('rejects negative captured_at_ms', () => {
    const r = validateRuntimeOrigin({ ...VALID, captured_at_ms: -1 });
    expect('error' in r && r.error).toBe('invalid-captured-at-ms');
  });

  it('rejects invalid capture_source', () => {
    const r = validateRuntimeOrigin({ ...VALID, capture_source: 'made-up' });
    expect('error' in r && r.error).toBe('invalid-capture-source');
  });

  it('rejects unknown extra fields (strict schema)', () => {
    const r = validateRuntimeOrigin({ ...VALID, evil: 'extra' });
    expect('error' in r && r.error).toMatch(/^unknown-field:evil$/);
  });

  it('rejects non-object', () => {
    expect('error' in validateRuntimeOrigin('nope') && (validateRuntimeOrigin('nope') as { error: string }).error).toBe('not-object');
    expect('error' in validateRuntimeOrigin(null) && (validateRuntimeOrigin(null) as { error: string }).error).toBe('not-object');
    expect('error' in validateRuntimeOrigin([1, 2]) && (validateRuntimeOrigin([1, 2]) as { error: string }).error).toBe('not-object');
  });
});

describe('captureRuntimeOrigin', () => {
  it('returns undefined outside tmux (no TMUX_PANE)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await captureRuntimeOrigin({ env: {}, subprocess: () => ({ status: 0, stdout: '', stderr: '' }) });
    expect(r).toBeUndefined();
    expect(spy.mock.calls.join(' ')).toMatch(/outcome=skipped reason=outside-tmux/);
    spy.mockRestore();
  });

  it('returns validated origin on success', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await captureRuntimeOrigin({
      env: { TMUX_PANE: '%17' },
      subprocess: () => ({ status: 0, stdout: JSON.stringify(VALID), stderr: '' }),
    });
    expect(r).toEqual(VALID);
    expect(spy.mock.calls.join(' ')).toMatch(/event=capture outcome=ok/);
    spy.mockRestore();
  });

  it('returns undefined when binary is missing (ENOENT)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const enoentErr = Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException;
    const r = await captureRuntimeOrigin({
      env: { TMUX_PANE: '%17' },
      subprocess: () => ({ status: null, stdout: '', stderr: '', error: enoentErr }),
    });
    expect(r).toBeUndefined();
    expect(spy.mock.calls.join(' ')).toMatch(/outcome=unavailable reason=binary-missing/);
    spy.mockRestore();
  });

  it('returns undefined on non-zero exit', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await captureRuntimeOrigin({
      env: { TMUX_PANE: '%17' },
      subprocess: () => ({ status: 2, stdout: '', stderr: 'nope' }),
    });
    expect(r).toBeUndefined();
    expect(spy.mock.calls.join(' ')).toMatch(/outcome=unavailable reason=exit-2/);
    spy.mockRestore();
  });

  it('returns undefined on JSON parse failure', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await captureRuntimeOrigin({
      env: { TMUX_PANE: '%17' },
      subprocess: () => ({ status: 0, stdout: 'not-json', stderr: '' }),
    });
    expect(r).toBeUndefined();
    expect(spy.mock.calls.join(' ')).toMatch(/outcome=malformed reason=json-parse/);
    spy.mockRestore();
  });

  it('returns undefined on schema-validation failure', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await captureRuntimeOrigin({
      env: { TMUX_PANE: '%17' },
      subprocess: () => ({ status: 0, stdout: JSON.stringify({ ...VALID, kind: 'nope' }), stderr: '' }),
    });
    expect(r).toBeUndefined();
    expect(spy.mock.calls.join(' ')).toMatch(/event=reject outcome=malformed reason=wrong-kind/);
    spy.mockRestore();
  });

  it('returns undefined on oversize payload', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const huge = 'x'.repeat(20 * 1024);
    const r = await captureRuntimeOrigin({
      env: { TMUX_PANE: '%17' },
      subprocess: () => ({ status: 0, stdout: huge, stderr: '' }),
    });
    expect(r).toBeUndefined();
    expect(spy.mock.calls.join(' ')).toMatch(/outcome=malformed reason=payload-too-large/);
    spy.mockRestore();
  });

  it('never throws when subprocess runner itself throws', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await captureRuntimeOrigin({
      env: { TMUX_PANE: '%17' },
      subprocess: () => { throw new Error('boom'); },
    });
    expect(r).toBeUndefined();
    expect(spy.mock.calls.join(' ')).toMatch(/outcome=unavailable reason=runner-throw/);
    spy.mockRestore();
  });
});

describe('decodePropagatedOrigin', () => {
  it('returns undefined when env var absent', () => {
    expect(decodePropagatedOrigin({})).toBeUndefined();
  });

  it('accepts raw JSON path and marks capture_source=propagated', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = decodePropagatedOrigin({ [SPECIALISTS_RUNTIME_ORIGIN_V1]: JSON.stringify(VALID) });
    expect(r).toEqual({ ...VALID, capture_source: 'propagated' });
    expect(spy.mock.calls.join(' ')).toMatch(/event=propagate outcome=ok/);
    spy.mockRestore();
  });

  it('accepts base64url path', () => {
    const encoded = encodePropagatedOrigin(VALID);
    const r = decodePropagatedOrigin({ [SPECIALISTS_RUNTIME_ORIGIN_V1]: encoded });
    expect(r).toEqual({ ...VALID, capture_source: 'propagated' });
  });

  it('preserves verified from the source', () => {
    const unverified = { ...VALID, verified: false };
    const r = decodePropagatedOrigin({ [SPECIALISTS_RUNTIME_ORIGIN_V1]: JSON.stringify(unverified) });
    expect(r?.verified).toBe(false);
  });

  it('rejects malformed base64url payload', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = decodePropagatedOrigin({ [SPECIALISTS_RUNTIME_ORIGIN_V1]: 'not-base64-and-not-json' });
    expect(r).toBeUndefined();
    expect(spy.mock.calls.join(' ')).toMatch(/event=reject/);
    spy.mockRestore();
  });

  it('rejects oversize propagated value', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const huge = 'x'.repeat(20 * 1024);
    const r = decodePropagatedOrigin({ [SPECIALISTS_RUNTIME_ORIGIN_V1]: huge });
    expect(r).toBeUndefined();
    expect(spy.mock.calls.join(' ')).toMatch(/reason=propagated-too-large/);
    spy.mockRestore();
  });
});

describe('encodePropagatedOrigin', () => {
  it('round-trips through decodePropagatedOrigin (except capture_source)', () => {
    const encoded = encodePropagatedOrigin(VALID);
    const decoded = decodePropagatedOrigin({ [SPECIALISTS_RUNTIME_ORIGIN_V1]: encoded });
    expect(decoded).toEqual({ ...VALID, capture_source: 'propagated' });
  });
});
