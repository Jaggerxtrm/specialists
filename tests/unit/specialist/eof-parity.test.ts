// EOF cross-contract parity test.
//
// Three surfaces MUST agree on how the trailing-newline empty is counted,
// or a model citation to "line N" points at content the verifier disagrees
// exists. This test locks the three together for the fixture "one\ntwo\n":
//
//   1. Pi (upstream): pi-coding-agent/dist/core/tools/read.js line 85
//      `text.split("\n")` — totalLines = 3.
//   2. Vendored fork numberReadText (config/pi-extensions/read-line-numbers/
//      index.mjs) — numbers every split element, so "3 | " is emitted.
//   3. Specialists citation-evidence readVerifiedCitationWindow — returns
//      totalLines: 3 with lines[-1] = { line: 3, text: '' }
//      (see tests/unit/specialist/citation-evidence.test.ts:103-110).
//
// If ANY of these diverges in future, this test trips.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The vendored fork imports @earendil-works/pi-coding-agent for isReadToolResult.
// We only exercise numberReadText here, so the peer dep is mocked at the module
// boundary — Pi is not required to prove numbering parity.
vi.mock('@earendil-works/pi-coding-agent', () => ({
  isReadToolResult: (event: { toolName?: string } | null | undefined) =>
    event != null && typeof event === 'object' && (event as { toolName?: string }).toolName === 'read',
}));

import { readVerifiedCitationWindow } from '../../../src/specialist/citation-evidence.js';
import { getReadLineNumbersExtensionPath } from '../../../src/pi/read-line-numbers-extension.js';

type MjsModule = {
  numberReadText: (text: string, startLine: number, truncated: boolean) => string;
};

let vendoredFork: MjsModule;

beforeAll(async () => {
  const p = getReadLineNumbersExtensionPath();
  if (!p) throw new Error('vendored read-line-numbers fork not resolvable');
  vendoredFork = (await import(pathToFileURL(join(p, 'index.mjs')).href)) as MjsModule;
});

const FIXTURE = 'one\ntwo\n';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('EOF parity across Pi / vendored fork / citation-evidence', () => {
  it('Pi model: split("\\n") of "one\\ntwo\\n" has length 3', () => {
    // ponytail: inlined Pi's rule verbatim from pi-coding-agent read.js:85
    // — this is the authoritative surface. If Pi changes its model, this
    // assertion breaks first and forces both other surfaces to update.
    const allLines = FIXTURE.split('\n');
    expect(allLines.length).toBe(3);
    expect(allLines).toEqual(['one', 'two', '']);
  });

  it('Vendored fork: numberReadText emits "3 | " for the EOF empty', () => {
    expect(vendoredFork.numberReadText(FIXTURE, 1, false)).toBe('1 | one\n2 | two\n3 | ');
  });

  it('Vendored fork: offset=3 on empty content emits "3 | "', () => {
    expect(vendoredFork.numberReadText('', 3, false)).toBe('3 | ');
  });

  it('citation-evidence: reads line 3 of "one\\ntwo\\n" as the EOF empty', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eof-parity-'));
    temporaryDirectories.push(directory);
    const path = 'fixture.txt';
    await writeFile(join(directory, path), FIXTURE, 'utf8');

    const window = await readVerifiedCitationWindow(path, { trustedRoot: directory, offset: 3 });
    expect(window).toMatchObject({
      totalLines: 3,
      complete: true,
      truncated: false,
      lines: [{ line: 3, text: '' }],
    });
  });

  it('all three surfaces agree that line 3 exists and is empty', async () => {
    // Consolidated conjunctive assertion — if any of the three diverges,
    // this fails with a single clear regression.
    const piTotal = FIXTURE.split('\n').length;
    const numbered = vendoredFork.numberReadText(FIXTURE, 1, false);
    const numberedLines = numbered.split('\n');

    const directory = await mkdtemp(join(tmpdir(), 'eof-parity-'));
    temporaryDirectories.push(directory);
    const path = 'fixture.txt';
    await writeFile(join(directory, path), FIXTURE, 'utf8');
    const window = await readVerifiedCitationWindow(path, { trustedRoot: directory });

    expect(piTotal).toBe(3);
    expect(numberedLines[2]).toBe('3 | ');
    expect(window.totalLines).toBe(3);
    expect(window.lines[window.lines.length - 1]).toEqual({ line: 3, text: '' });
  });
});
