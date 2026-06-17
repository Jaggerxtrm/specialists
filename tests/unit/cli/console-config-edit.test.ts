import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyFieldEdit,
  coerceFieldValue,
  writeGlobalConfigSafe,
  statConfigFileMtimeMs,
} from '../../../src/cli/console/config-source.js';
import {
  initialConsoleState,
  reduceConsoleState,
} from '../../../src/cli/console/view-model.js';
import { buildSpecialistOverrideTemplate } from '../../../src/specialist/global-config.js';

function completeTemplate() {
  return buildSpecialistOverrideTemplate();
}

describe('coerceFieldValue — primitive table', () => {
  it('empty input → null for nullable fields', () => {
    expect(coerceFieldValue('execution.model', '')).toEqual({ ok: true, value: null });
    expect(coerceFieldValue('execution.thinking_level', '')).toEqual({ ok: true, value: null });
    expect(coerceFieldValue('beads_write_notes', '')).toEqual({ ok: true, value: null });
  });

  it('literal "null"/"inherit" → null for nullable fields', () => {
    expect(coerceFieldValue('execution.model', 'null')).toEqual({ ok: true, value: null });
    expect(coerceFieldValue('execution.model', 'inherit')).toEqual({ ok: true, value: null });
    expect(coerceFieldValue('execution.model', 'INHERIT')).toEqual({ ok: true, value: null });
  });

  it('bool fields accept true/false (case-insensitive)', () => {
    expect(coerceFieldValue('beads_write_notes', 'true')).toEqual({ ok: true, value: true });
    expect(coerceFieldValue('beads_write_notes', 'FALSE')).toEqual({ ok: true, value: false });
    expect(coerceFieldValue('execution.extensions.serena', 'true')).toEqual({ ok: true, value: true });
  });

  it('bool fields reject non-bool input', () => {
    const r = coerceFieldValue('beads_write_notes', 'yes');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('true|false');
  });

  it('int fields accept numbers', () => {
    expect(coerceFieldValue('execution.timeout_ms', '3000')).toEqual({ ok: true, value: 3000 });
    expect(coerceFieldValue('execution.max_retries', '0')).toEqual({ ok: true, value: 0 });
  });

  it('int fields reject NaN', () => {
    const r = coerceFieldValue('execution.timeout_ms', 'abc');
    expect(r.ok).toBe(false);
  });

  it('enum fields accept exact match', () => {
    expect(coerceFieldValue('execution.thinking_level', 'medium')).toEqual({ ok: true, value: 'medium' });
    expect(coerceFieldValue('prompt.system_prompt_mode', 'append')).toEqual({ ok: true, value: 'append' });
    expect(coerceFieldValue('notes_mode', 'full-trail')).toEqual({ ok: true, value: 'full-trail' });
  });

  it('enum fields reject unknown values', () => {
    const r = coerceFieldValue('execution.thinking_level', 'medium-high');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('expected one of');
  });

  it('array fields accept JSON-bracket form', () => {
    expect(coerceFieldValue('skills.paths', '["a","b"]')).toEqual({ ok: true, value: ['a', 'b'] });
  });

  it('array fields accept comma-separated form', () => {
    expect(coerceFieldValue('skills.paths', 'a, b, c')).toEqual({ ok: true, value: ['a', 'b', 'c'] });
  });

  it('string fields pass through', () => {
    expect(coerceFieldValue('execution.model', 'anthropic/claude-sonnet-4-6'))
      .toEqual({ ok: true, value: 'anthropic/claude-sonnet-4-6' });
  });
});

describe('applyFieldEdit — preserves _doc and other underscore keys', () => {
  it('sets a nested value and keeps _doc sentinel', () => {
    const raw = {
      _doc: 'overrides-guide.md',
      executor: { execution: { model: null } },
    };
    const next = applyFieldEdit(raw, 'executor', 'execution.model', 'anthropic/foo');
    expect(next._doc).toBe('overrides-guide.md');
    expect((next.executor as any).execution.model).toBe('anthropic/foo');
  });

  it('creates missing intermediate objects', () => {
    const raw = { executor: {} };
    const next = applyFieldEdit(raw, 'executor', 'execution.extensions.serena', true);
    expect((next.executor as any).execution.extensions.serena).toBe(true);
  });

  it('does not mutate the input', () => {
    const raw = { executor: { execution: { model: null } } };
    const next = applyFieldEdit(raw, 'executor', 'execution.model', 'foo');
    expect((raw.executor as any).execution.model).toBeNull();
    expect((next.executor as any).execution.model).toBe('foo');
  });

  it('preserves _doc across multiple sequential edits', () => {
    let raw: Record<string, unknown> = { _doc: 'd', executor: { execution: { model: null } } };
    raw = applyFieldEdit(raw, 'executor', 'execution.model', 'm1');
    raw = applyFieldEdit(raw, 'executor', 'execution.thinking_level', 'medium');
    raw = applyFieldEdit(raw, 'executor', 'beads_write_notes', true);
    expect(raw._doc).toBe('d');
  });
});

describe('writeGlobalConfigSafe — round-trip + mtime check', () => {
  let tmp: string;
  const originalXdg = process.env.XDG_CONFIG_HOME;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sp-console-cfg-edit-'));
    process.env.XDG_CONFIG_HOME = tmp;
    process.env.HOME = tmp;
    mkdirSync(join(tmp, 'specialists'), { recursive: true });
    writeFileSync(
      join(tmp, 'specialists', 'user.json'),
      JSON.stringify({ _doc: 'd', executor: completeTemplate() }, null, 2) + '\n',
      'utf-8',
    );
  });

  afterEach(() => {
    process.env.XDG_CONFIG_HOME = originalXdg;
    process.env.HOME = originalHome;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes a valid candidate and preserves _doc', () => {
    const mtime = statConfigFileMtimeMs();
    const raw = { _doc: 'd', executor: completeTemplate() };
    const next = applyFieldEdit(raw, 'executor', 'execution.model', 'anthropic/claude-sonnet-4-6');
    const outcome = writeGlobalConfigSafe(next, mtime);
    expect(outcome.ok).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(tmp, 'specialists', 'user.json'), 'utf-8'));
    expect(onDisk._doc).toBe('d');
    expect(onDisk.executor.execution.model).toBe('anthropic/claude-sonnet-4-6');
  });

  it('rejects invalid candidates without writing', () => {
    const original = readFileSync(join(tmp, 'specialists', 'user.json'), 'utf-8');
    const bad = { executor: { execution: { thinking_level: 'medium-high' } } };
    const outcome = writeGlobalConfigSafe(bad);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors && outcome.errors.length).toBeGreaterThan(0);
    expect(readFileSync(join(tmp, 'specialists', 'user.json'), 'utf-8')).toBe(original);
  });

  it('aborts on mtime mismatch', () => {
    const before = statConfigFileMtimeMs();
    const t = completeTemplate();
    t.execution.model = 'newer';
    const fakeExpected = (before ?? 0) + 999999;
    const outcome = writeGlobalConfigSafe(
      { _doc: 'd', executor: t },
      fakeExpected,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errorClass).toBe('mtime_mismatch');
  });
});

describe('view-model edit + undo state', () => {
  it('configEditStart/configEditChar build the buffer', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'configEditStart', specialist: 'executor', fieldPath: 'execution.model' });
    expect(state.configEdit.active).toBe(true);
    state = reduceConsoleState(state, { type: 'configEditChar', char: 'a' });
    state = reduceConsoleState(state, { type: 'configEditChar', char: 'b' });
    expect(state.configEdit.buffer).toBe('ab');
    state = reduceConsoleState(state, { type: 'configEditBackspace' });
    expect(state.configEdit.buffer).toBe('a');
  });

  it('configEditCancel clears edit mode', () => {
    let state = reduceConsoleState(initialConsoleState(), {
      type: 'configEditStart',
      specialist: 'executor',
      fieldPath: 'execution.model',
    });
    state = reduceConsoleState(state, { type: 'configEditCancel' });
    expect(state.configEdit.active).toBe(false);
    expect(state.configEdit.buffer).toBe('');
  });

  it('configEditError preserves buffer for retry', () => {
    let state = reduceConsoleState(initialConsoleState(), {
      type: 'configEditStart',
      specialist: 'executor',
      fieldPath: 'execution.model',
    });
    state = reduceConsoleState(state, { type: 'configEditChar', char: 'x' });
    state = reduceConsoleState(state, { type: 'configEditError', error: 'bad' });
    expect(state.configEdit.active).toBe(true);
    expect(state.configEdit.buffer).toBe('x');
    expect(state.configEdit.error).toBe('bad');
  });

  it('configEditCommit pushes onto undo stack, capped at 5', () => {
    let state = initialConsoleState();
    for (let i = 0; i < 7; i += 1) {
      state = reduceConsoleState(state, {
        type: 'configEditCommit',
        prevRaw: { snap: i },
      });
    }
    expect(state.configUndoStack.length).toBe(5);
    expect((state.configUndoStack[0] as any).snap).toBe(6);
    expect((state.configUndoStack[4] as any).snap).toBe(2);
  });

  it('configUndo pops once from the stack', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'configEditCommit', prevRaw: { a: 1 } });
    state = reduceConsoleState(state, { type: 'configEditCommit', prevRaw: { b: 2 } });
    expect(state.configUndoStack.length).toBe(2);
    state = reduceConsoleState(state, { type: 'configUndo' });
    expect(state.configUndoStack.length).toBe(1);
  });
});
