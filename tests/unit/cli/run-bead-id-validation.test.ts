import { describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { BEAD_ID_PATTERN, readBeadSummary } from '../../../src/cli/run.js';

describe('BEAD_ID_PATTERN', () => {
  it('accepts canonical bead-id shapes', () => {
    for (const id of [
      'unitAI-63xi3',
      'unitAI-63xi3.1',
      'unitAI-tpafe.6.2',
      'xtrm-wiy5n.4.11',
      'a',
      'A1',
      'proj-alpha_beta',
    ]) {
      expect(BEAD_ID_PATTERN.test(id)).toBe(true);
    }
  });

  it('rejects shell metacharacters and other hostile inputs (CWE-78)', () => {
    for (const id of [
      'foo; touch /tmp/pwned',
      'foo && rm -rf /',
      'foo | cat /etc/passwd',
      'foo`whoami`',
      'foo$(id)',
      '../../../etc/passwd',
      'foo bar',
      '',
      '-foo',
      'foo.bar',           // suffix must be numeric
      'foo.1.bar',
      'foo\nbar',
      'foo\\',
    ]) {
      expect(BEAD_ID_PATTERN.test(id)).toBe(false);
    }
  });
});

describe('readBeadSummary — CWE-78 shell-injection regression', () => {
  it('does not execute shell metacharacters in the bead id', () => {
    const marker = '/tmp/specialists-eao44-pwned-marker';
    if (existsSync(marker)) unlinkSync(marker);
    try {
      const result = readBeadSummary(`x; touch ${marker}`);
      expect(result).toBeNull();
      expect(existsSync(marker)).toBe(false);
    } finally {
      if (existsSync(marker)) unlinkSync(marker);
    }
  });

  it('returns null for empty / non-matching input without spawning bd', () => {
    expect(readBeadSummary('')).toBeNull();
    expect(readBeadSummary('foo bar')).toBeNull();
    expect(readBeadSummary('foo`whoami`')).toBeNull();
  });
});
