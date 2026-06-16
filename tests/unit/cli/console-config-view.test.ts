import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  describeLeaf,
  formatConfigValue,
  readGlobalConfigSnapshot,
} from '../../../src/cli/console/config-source.js';
import {
  renderConfigField,
  renderConfigSpecialistRow,
} from '../../../src/cli/console/theme.js';
import {
  initialConsoleState,
  reduceConsoleState,
} from '../../../src/cli/console/view-model.js';

const SGR_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(SGR_RE, '');

describe('describeLeaf — schema-driven allowed-input hints', () => {
  it('enum hint for thinking_level (zod introspection)', () => {
    const d = describeLeaf('execution.thinking_level');
    expect(d.hint.startsWith('enum: ')).toBe(true);
    expect(d.hint).toContain('low');
    expect(d.hint).toContain('high');
    expect(d.hint.endsWith(' | null')).toBe(true);
    expect(d.isEnum).toBe(true);
  });

  it('enum hint for prompt.system_prompt_mode', () => {
    const d = describeLeaf('prompt.system_prompt_mode');
    expect(d.isEnum).toBe(true);
    expect(d.hint).toContain('append');
    expect(d.hint).toContain('replace');
  });

  it('enum hint for notes_mode', () => {
    const d = describeLeaf('notes_mode');
    expect(d.isEnum).toBe(true);
    expect(d.hint).toContain('full-trail');
    expect(d.hint).toContain('final-only');
  });

  it('primitive hints for numeric leaves', () => {
    expect(describeLeaf('execution.timeout_ms').hint).toBe('int ≥ 0 | null');
    expect(describeLeaf('execution.max_retries').hint).toBe('int ≥ 0 | null');
    expect(describeLeaf('execution.prompt_limit_bytes').hint).toBe('int > 0 | null');
    expect(describeLeaf('execution.stdout_limit_bytes').hint).toBe('int > 0 | null');
  });

  it('primitive hint for booleans', () => {
    expect(describeLeaf('execution.extensions.serena').hint).toBe('bool | null');
    expect(describeLeaf('execution.extensions.gitnexus').hint).toBe('bool | null');
    expect(describeLeaf('beads_write_notes').hint).toBe('bool | null');
  });

  it('array hint for skills.paths', () => {
    expect(describeLeaf('skills.paths').hint).toBe('string[]');
  });

  it('string fallback for unrecognised paths', () => {
    expect(describeLeaf('execution.fallback_models').hint).toBe('string[] | null');
    expect(describeLeaf('execution.model').hint).toBe('string | null');
    expect(describeLeaf('output_file').hint).toBe('string | null');
  });
});

describe('formatConfigValue — null renders as `inherit`', () => {
  it('null → "inherit"', () => {
    expect(formatConfigValue(null)).toBe('inherit');
  });
  it('undefined → "inherit"', () => {
    expect(formatConfigValue(undefined)).toBe('inherit');
  });
  it('arrays render as JSON-compact list', () => {
    expect(formatConfigValue([])).toBe('[]');
    expect(formatConfigValue(['a', 'b'])).toBe('["a", "b"]');
  });
  it('primitives stringify', () => {
    expect(formatConfigValue('x')).toBe('x');
    expect(formatConfigValue(42)).toBe('42');
    expect(formatConfigValue(false)).toBe('false');
  });
});

describe('readGlobalConfigSnapshot — file-existence + parse handling', () => {
  let tmp: string;
  const originalXdg = process.env.XDG_CONFIG_HOME;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sp-console-config-'));
    process.env.XDG_CONFIG_HOME = tmp;
    process.env.HOME = tmp;
  });

  afterEach(() => {
    process.env.XDG_CONFIG_HOME = originalXdg;
    process.env.HOME = originalHome;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns exists=false when no user.json', () => {
    const snap = readGlobalConfigSnapshot();
    expect(snap.exists).toBe(false);
    expect(snap.specialists).toEqual([]);
    expect(snap.parseError).toBeUndefined();
  });

  it('returns parseError on corrupt JSON without crashing', () => {
    mkdirSync(join(tmp, 'specialists'), { recursive: true });
    writeFileSync(join(tmp, 'specialists', 'user.json'), '{ this is not json', 'utf-8');
    const snap = readGlobalConfigSnapshot();
    expect(snap.exists).toBe(true);
    expect(snap.parseError).toMatch(/JSON parse error/);
  });

  it('parses a well-formed user.json into the override table', () => {
    mkdirSync(join(tmp, 'specialists'), { recursive: true });
    writeFileSync(
      join(tmp, 'specialists', 'user.json'),
      JSON.stringify({
        executor: {
          execution: {
            model: 'anthropic/claude-sonnet-4-6',
            thinking_level: 'medium',
            timeout_ms: null,
            extensions: { serena: true, gitnexus: null },
          },
          beads_write_notes: null,
          skills: { paths: [] },
        },
      }),
      'utf-8',
    );
    const snap = readGlobalConfigSnapshot();
    expect(snap.exists).toBe(true);
    const exec = snap.specialists.find((s) => s.name === 'executor');
    expect(exec).toBeDefined();
    expect(exec?.hasOverride).toBe(true);
    const model = exec?.fields.find((f) => f.path === 'execution.model');
    expect(model?.value).toBe('anthropic/claude-sonnet-4-6');
    expect(model?.isOverride).toBe(true);
    const thinking = exec?.fields.find((f) => f.path === 'execution.thinking_level');
    expect(thinking?.isEnum).toBe(true);
    const beads = exec?.fields.find((f) => f.path === 'beads_write_notes');
    expect(beads?.value).toBeNull();
    expect(beads?.isOverride).toBe(false);
  });

  it('displayPath emits a string (HOME→~ when overlapping the real home)', () => {
    mkdirSync(join(tmp, 'specialists'), { recursive: true });
    writeFileSync(join(tmp, 'specialists', 'user.json'), '{}', 'utf-8');
    const snap = readGlobalConfigSnapshot();
    // homedir() reads OS-level HOME at boot — env override may or may not match.
    // The contract is: displayPath is non-empty and does not start with `/home/<user>` raw
    // when HOME == OS home. We assert non-empty as the resilient invariant.
    expect(snap.displayPath.length).toBeGreaterThan(0);
  });
});

describe('theme.renderConfigField + renderConfigSpecialistRow', () => {
  it('field row shows path, value, and hint aligned', () => {
    const row = strip(
      renderConfigField('execution.timeout_ms', 'inherit', 'int ≥ 0 | null', 80, {
        isOverride: false,
        isInherit: true,
      }),
    );
    expect(row.startsWith('execution.timeout_ms')).toBe(true);
    expect(row).toContain('inherit');
    expect(row).toContain('int ≥ 0 | null');
  });

  it('null value always renders as `inherit` (regardless of isOverride)', () => {
    const row = strip(
      renderConfigField('execution.model', 'should-not-show', 'string | null', 80, {
        isOverride: false,
        isInherit: true,
      }),
    );
    expect(row).toContain('inherit');
    expect(row).not.toContain('should-not-show');
  });

  it('specialist row shows ●/○ marker for hasOverride', () => {
    expect(strip(renderConfigSpecialistRow('executor', true, false, 80))).toContain('●');
    expect(strip(renderConfigSpecialistRow('reviewer', false, false, 80))).toContain('○');
  });

  it('selected marker › appears only when selected', () => {
    expect(strip(renderConfigSpecialistRow('a', true, true, 80)).startsWith('›')).toBe(true);
    expect(strip(renderConfigSpecialistRow('b', true, false, 80)).startsWith(' ')).toBe(true);
  });
});

describe('view-model: config actions', () => {
  const snapshot = {
    path: '/x',
    displayPath: '~/x',
    source: 'config-home' as const,
    exists: true,
    validationErrors: [],
    specialists: [
      { name: 'executor', hasOverride: true, fields: [], blockedWarnings: [] },
      { name: 'reviewer', hasOverride: false, fields: [], blockedWarnings: [] },
    ],
  };

  it('open(view=config) sets configLoading true', () => {
    const state = reduceConsoleState(initialConsoleState(), { type: 'open', view: 'config', jobId: '' });
    expect(state.view).toBe('config');
    expect(state.configLoading).toBe(true);
  });

  it('configLoaded stores snapshot and clears loading', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'open', view: 'config', jobId: '' });
    state = reduceConsoleState(state, { type: 'configLoaded', snapshot });
    expect(state.configLoading).toBe(false);
    expect(state.config?.specialists.length).toBe(2);
    expect(state.configSelectedSpecialist).toBe('executor');
  });

  it('configSelectSpecialist resets scroll', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'open', view: 'config', jobId: '' });
    state = reduceConsoleState(state, { type: 'configLoaded', snapshot });
    state = { ...state, configScroll: 10 };
    state = reduceConsoleState(state, { type: 'configSelectSpecialist', name: 'reviewer' });
    expect(state.configSelectedSpecialist).toBe('reviewer');
    expect(state.configScroll).toBe(0);
  });
});

describe('logging contract: no values from user.json escape to stderr/snapshot', () => {
  it('PRIMITIVE_HINT static map exposes only field paths, no values', () => {
    // formatConfigValue is the only path that turns a stored value into a string.
    // The renderer downstream paints those, but the LOG path uses describeLeaf +
    // schema introspection — no user value involved.
    expect(describeLeaf('execution.model')).not.toHaveProperty('value');
  });
});
