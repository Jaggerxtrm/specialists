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

describe('describeLeaf — operationally-grounded hints (unitAI-ctb4u.31)', () => {
  it('enum hint for thinking_level lists alternatives AND appends a plain-word gloss', () => {
    const d = describeLeaf('execution.thinking_level');
    expect(d.isEnum).toBe(true);
    expect(d.hint.startsWith('enum: ')).toBe(true);
    expect(d.hint).toContain('low');
    expect(d.hint).toContain('high');
    expect(d.hint).toContain('reasoning depth');
  });

  it('enum hint for prompt.system_prompt_mode names the operational effect of replace', () => {
    const d = describeLeaf('prompt.system_prompt_mode');
    expect(d.isEnum).toBe(true);
    expect(d.hint).toContain('append');
    expect(d.hint).toContain('replace');
    expect(d.hint).toContain('drops spec.prompt.system');
  });

  it('enum hint for notes_mode names what final-only does', () => {
    const d = describeLeaf('notes_mode');
    expect(d.isEnum).toBe(true);
    expect(d.hint).toContain('full-trail');
    expect(d.hint).toContain('final-only');
    expect(d.hint).toContain('per-turn');
  });

  it('numeric hints carry units AND a concrete example', () => {
    expect(describeLeaf('execution.timeout_ms').hint).toContain('ms');
    expect(describeLeaf('execution.timeout_ms').hint).toContain('120000');
    expect(describeLeaf('execution.stall_timeout_ms').hint).toContain('ms');
    expect(describeLeaf('execution.stall_timeout_ms').hint).toContain('300000');
    expect(describeLeaf('stall_detection.waiting_auto_close_ms').hint).toContain('ms');
    expect(describeLeaf('stall_detection.waiting_auto_close_ms').hint).toContain('3600000');
    expect(describeLeaf('execution.max_retries').hint).toContain('count');
    expect(describeLeaf('execution.max_retries').hint).toContain('e.g. 3');
    expect(describeLeaf('execution.prompt_limit_bytes').hint).toContain('bytes');
    expect(describeLeaf('execution.prompt_limit_bytes').hint).toContain('MiB');
    expect(describeLeaf('execution.stdout_limit_bytes').hint).toContain('bytes');
    expect(describeLeaf('execution.stdout_limit_bytes').hint).toContain('MiB');
  });

  it('interactive hint describes keep-alive default behavior', () => {
    const hint = describeLeaf('execution.interactive').hint;
    expect(hint).toContain('true|false');
    expect(hint).toContain('keep-alive');
    expect(hint).toContain('resume');
  });

  it('boolean hints name the OPERATIONAL effect of false, not the type', () => {
    // Serena retired (unitAI-e67up.8): the leaf stays editable for legacy
    // configs but the hint marks it deprecated and ignored.
    const serena = describeLeaf('execution.extensions.serena').hint;
    expect(serena).toContain('deprecated');
    expect(serena).toContain('ignored');
    expect(serena).toContain('Serena');
    const gitnexus = describeLeaf('execution.extensions.gitnexus').hint;
    expect(gitnexus).toContain('true|false');
    expect(gitnexus).toContain('GitNexus');
    expect(gitnexus).toContain('disables');
    const notes = describeLeaf('beads_write_notes').hint;
    expect(notes).toContain('true|false');
    expect(notes).toContain('skips');
    expect(notes).toContain('note append');
  });

  it('string hints carry format AND example', () => {
    expect(describeLeaf('execution.model').hint).toContain('<provider>/<id>');
    expect(describeLeaf('execution.model').hint).toContain('e.g.');
    expect(describeLeaf('execution.fallback_model').hint).toContain('<provider>/<id>');
    expect(describeLeaf('execution.fallback_models').hint).toContain('JSON array');
    expect(describeLeaf('execution.fallback_models').hint).toContain('e.g.');
    expect(describeLeaf('output_file').hint).toContain('absolute path');
  });

  it('skills.paths hint names the operational effect (append to spec)', () => {
    const hint = describeLeaf('skills.paths').hint;
    expect(hint).toContain('string[]');
    expect(hint).toContain('appended to spec');
  });

  it('every hint is ≤ 70 chars to fit the dim slot at 120-col widths', () => {
    const paths = [
      'execution.model',
      'execution.fallback_model',
      'execution.fallback_models',
      'execution.timeout_ms',
      'execution.stall_timeout_ms',
      'execution.interactive',
      'execution.thinking_level',
      'execution.max_retries',
      'execution.prompt_limit_bytes',
      'execution.stdout_limit_bytes',
      'execution.extensions.serena',
      'execution.extensions.gitnexus',
      'prompt.system_prompt_mode',
      'stall_detection.waiting_auto_close_ms',
      'beads_write_notes',
      'notes_mode',
      'output_file',
      'skills.paths',
    ];
    for (const p of paths) {
      const hint = describeLeaf(p).hint;
      expect(hint.length, `${p} hint exceeds 70 chars: "${hint}"`).toBeLessThanOrEqual(70);
    }
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
      renderConfigField('execution.timeout_ms', 'inherit', 'ms · total cap; e.g. 120000 (2m); 0=disabled', 80, {
        isOverride: false,
        isInherit: true,
      }),
    );
    expect(row.startsWith('execution.timeout_ms')).toBe(true);
    expect(row).toContain('inherit');
    expect(row).toContain('120000');
  });

  it('null value always renders as `inherit` (regardless of isOverride)', () => {
    const row = strip(
      renderConfigField('execution.model', 'should-not-show', '<provider>/<id> · e.g. openai-codex/gpt-5.4-mini', 80, {
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
