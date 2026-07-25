// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
// tests/unit/cli/list.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseArgs, ArgParseError, computeMedianElapsedMs, getChainPositionBadge, run } from '../../../src/cli/list.js';
import * as versionCheck from '../../../src/cli/version-check.js';
import { SpecialistLoader } from '../../../src/specialist/loader.js';

describe('list CLI — parseArgs', () => {
  it('returns empty object for no args', () => {
    expect(parseArgs([])).toEqual({});
  });

  it('parses --category', () => {
    expect(parseArgs(['--category', 'analysis'])).toEqual({ category: 'analysis' });
  });

  it('parses --scope default', () => {
    expect(parseArgs(['--scope', 'default'])).toEqual({ scope: 'default' });
  });

  it('parses --scope user', () => {
    expect(parseArgs(['--scope', 'user'])).toEqual({ scope: 'user' });
  });

  it('parses both --category and --scope together', () => {
    expect(parseArgs(['--category', 'review', '--scope', 'user']))
      .toEqual({ category: 'review', scope: 'user' });
  });

  it('parses flags in any order', () => {
    expect(parseArgs(['--scope', 'default', '--category', 'debug']))
      .toEqual({ category: 'debug', scope: 'default' });
  });

  it('throws ArgParseError for invalid --scope value', () => {
    expect(() => parseArgs(['--scope', 'system']))
      .toThrow(ArgParseError);
    expect(() => parseArgs(['--scope', 'system']))
      .toThrow('must be "default" or "user"');
  });

  it('throws ArgParseError for empty --scope', () => {
    expect(() => parseArgs(['--scope']))
      .toThrow(ArgParseError);
  });

  it('throws ArgParseError for --category with no value', () => {
    expect(() => parseArgs(['--category']))
      .toThrow(ArgParseError);
    expect(() => parseArgs(['--category']))
      .toThrow('--category requires a value');
  });

  it('throws ArgParseError when --category value looks like a flag', () => {
    expect(() => parseArgs(['--category', '--scope']))
      .toThrow(ArgParseError);
  });

  it('silently ignores unknown flags', () => {
    expect(parseArgs(['--unknown', 'foo'])).toEqual({});
  });
});

describe('list CLI — parseArgs --json', () => {
  it('parses --json flag', () => {
    expect(parseArgs(['--json'])).toEqual({ json: true });
  });

  it('parses --json with other flags', () => {
    expect(parseArgs(['--scope', 'default', '--json'])).toEqual({ scope: 'default', json: true });
  });

  it('json defaults to undefined when not provided', () => {
    const result = parseArgs([]);
    expect(result.json).toBeUndefined();
  });
});

describe('list CLI — parseArgs --live', () => {
  it('parses --live flag', () => {
    expect(parseArgs(['--live'])).toEqual({ live: true });
  });

  it('parses --live with other flags', () => {
    expect(parseArgs(['--scope', 'default', '--json', '--live']))
      .toEqual({ scope: 'default', json: true, live: true });
  });

  it('live defaults to undefined when not provided', () => {
    const result = parseArgs([]);
    expect(result.live).toBeUndefined();
  });
});

describe('list CLI — parseArgs description flags', () => {
  it('parses --compact flag', () => {
    expect(parseArgs(['--compact'])).toEqual({ compact: true });
  });

  it('parses full-description aliases', () => {
    expect(parseArgs(['--full'])).toEqual({ full: true });
    expect(parseArgs(['--no-truncate'])).toEqual({ full: true });
  });
});


describe('list CLI — helpers', () => {
  it('maps chain positions inline', () => {
    expect(getChainPositionBadge('explorer')).toBe('[pre-impl]');
    expect(getChainPositionBadge('executor')).toBe('[impl]');
    expect(getChainPositionBadge('reviewer')).toBe('[post-impl]');
    expect(getChainPositionBadge('changelog-keeper')).toBe('[merge]');
    expect(getChainPositionBadge('node-coordinator')).toBe('[standalone]');
    expect(getChainPositionBadge('unknown')).toBeNull();
  });

  it('computes median elapsed ms', () => {
    expect(computeMedianElapsedMs([300, 100, 200])).toBe(200);
    expect(computeMedianElapsedMs([100, 400, 200, 300])).toBe(250);
    expect(computeMedianElapsedMs([])).toBeNull();
  });
});


const sampleSpecialist = {
  name: 'sample',
  description: 'desc',
  category: 'test',
  version: '1.0.0',
  model: 'provider/model',
  permission_required: 'LOW' as const,
  interactive: false,
  thinking_level: undefined,
  skills: [],
  scripts: [],
  mandatoryRuleTemplateSets: ['sample-rules'],
  scope: 'default' as const,
  source: 'default-mirror' as const,
  filePath: '/tmp/sample.specialist.json',
  updated: undefined,
  filestoWatch: undefined,
  staleThresholdDays: undefined,
  stallDetection: undefined,
};

describe('list CLI — json shape', () => {
  const originalArgv = process.argv;
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const listSpy = vi.spyOn(SpecialistLoader.prototype, 'list');
  const versionSpy = vi.spyOn(versionCheck, 'getVersionCheckResult').mockReturnValue(null);

  beforeEach(() => {
    logSpy.mockClear();
    listSpy.mockResolvedValue([sampleSpecialist]);
    listSpy.mockClear();
    versionSpy.mockClear();
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('keeps --json shape unchanged when --full present', async () => {
    process.argv = ['bun', 'src/index.ts', 'list', '--json'];
    await run();
    const withoutFull = logSpy.mock.calls.at(0)?.[0];

    logSpy.mockClear();

    process.argv = ['bun', 'src/index.ts', 'list', '--json', '--full'];
    await run();
    const withFull = logSpy.mock.calls.at(0)?.[0];

    expect(withFull).toBe(withoutFull);
    expect(JSON.parse(String(withFull))).toEqual([sampleSpecialist]);
  });
});

describe('list CLI — human output', () => {
  const originalArgv = process.argv;
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const versionSpy = vi.spyOn(versionCheck, 'getVersionCheckResult');
  const alertSpy = vi.spyOn(versionCheck, 'formatListVersionAlert');
  const notifySpy = vi.spyOn(versionCheck, 'markVersionCheckNotified').mockImplementation(() => {});
  const listSpy = vi.spyOn(SpecialistLoader.prototype, 'list');

  beforeEach(() => {
    logSpy.mockClear();
    versionSpy.mockReset();
    alertSpy.mockReset();
    notifySpy.mockClear();
    listSpy.mockResolvedValue([
      { ...sampleSpecialist, name: 'zeta', version: '2.0.0' },
      { ...sampleSpecialist, name: 'alpha', version: '1.2.3' },
    ]);
    listSpy.mockClear();
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('sorts by name, shows spec and package versions, and alerts on new release', async () => {
    const result = {
      latestTag: 'v9.9.9',
      localVersion: '3.17.0',
      cache: { checked_at_ms: Date.now(), latest_tag: 'v9.9.9', notified_for_tag: '' },
    } satisfies versionCheck.VersionCheckResult;

    versionSpy.mockReturnValue(result);
    alertSpy.mockReturnValue('new version 9.9.9 available, run npm i -g @jaggerxtrm/specialists@9.9.9');

    process.argv = ['bun', 'src/index.ts', 'list'];
    await run();

    expect(logSpy.mock.calls[0]?.[0]).toContain('new version 9.9.9 available, run npm i -g @jaggerxtrm/specialists@9.9.9');
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes('specialists v3.17.0'))).toBe(true);
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes('alpha') && String(call[0]).includes('[v1.2.3]'))).toBe(true);
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes('zeta') && String(call[0]).includes('[v2.0.0]'))).toBe(true);
    const alphaIdx = logSpy.mock.calls.findIndex((call) => String(call[0]).includes('alpha'));
    const zetaIdx = logSpy.mock.calls.findIndex((call) => String(call[0]).includes('zeta'));
    expect(alphaIdx).toBeGreaterThanOrEqual(0);
    expect(zetaIdx).toBeGreaterThanOrEqual(0);
    expect(alphaIdx).toBeLessThan(zetaIdx);
    expect(notifySpy).toHaveBeenCalledWith(result);
  });
});
