import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readVerifiedCitationWindow,
  verifyExactLineCitation,
  type RawPiReadEvidence,
} from '../../../src/specialist/citation-evidence.js';

const temporaryDirectories: string[] = [];
let trustedRoot = '';

async function fixture(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'specialists-citation-'));
  temporaryDirectories.push(directory);
  trustedRoot = directory;
  const path = 'fixture.txt';
  await writeFile(join(directory, path), content, 'utf8');
  return path;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('verified citation evidence', () => {
  it('preserves blank lines and verifies their exact file line', async () => {
    const path = await fixture('alpha\n\ngamma');
    const window = await readVerifiedCitationWindow(path, { trustedRoot });

    expect(window.lines).toEqual([
      { line: 1, text: 'alpha' },
      { line: 2, text: '' },
      { line: 3, text: 'gamma' },
    ]);
    await expect(verifyExactLineCitation(window, { line: 2, text: '' })).resolves.toEqual({
      ok: true,
      citation: `${path}:2`,
      line: 2,
      text: '',
    });
  });

  it('maps one-based offsets and limits without model-counted lines', async () => {
    const path = await fixture('one\ntwo\nthree\nfour\nfive');
    const window = await readVerifiedCitationWindow(path, { trustedRoot, offset: 3, limit: 2 });

    expect(window).toMatchObject({
      offset: 3,
      totalLines: 5,
      complete: false,
      truncated: false,
      nextOffset: 5,
      lines: [
        { line: 3, text: 'three' },
        { line: 4, text: 'four' },
      ],
    });
    await expect(verifyExactLineCitation(window, { line: 4, text: 'four' })).resolves.toMatchObject({ ok: true });
    await expect(verifyExactLineCitation(window, { line: 2, text: 'two' })).resolves.toEqual({
      ok: false,
      reason: 'line_outside_verified_window',
    });
  });

  it('marks deterministic line truncation and refuses claims after the verified prefix', async () => {
    const path = await fixture('one\ntwo\nthree\nfour');
    const window = await readVerifiedCitationWindow(path, { trustedRoot, maxLines: 2 });

    expect(window).toMatchObject({
      complete: false,
      truncated: true,
      nextOffset: 3,
      lines: [
        { line: 1, text: 'one' },
        { line: 2, text: 'two' },
      ],
    });
    await expect(verifyExactLineCitation(window, { line: 3, text: 'three' })).resolves.toEqual({
      ok: false,
      reason: 'line_outside_verified_window',
    });
  });

  it('never returns a partial line when the byte ceiling truncates output', async () => {
    const path = await fixture('abc\ndefgh\nijk');
    const window = await readVerifiedCitationWindow(path, { trustedRoot, maxBytes: 8 });

    expect(window.lines).toEqual([{ line: 1, text: 'abc' }]);
    expect(window).toMatchObject({ truncated: true, complete: false, nextOffset: 2 });
  });

  it('fails instead of returning a non-advancing continuation for an oversized first line', async () => {
    const path = await fixture('💥💥\nnext');

    await expect(readVerifiedCitationWindow(path, { trustedRoot, maxBytes: 4 })).rejects.toThrow(
      'Line 1 exceeds the 4-byte verification limit',
    );
  });

  it('matches Pi EOF splitting and rejects offsets beyond its counted EOF', async () => {
    const path = await fixture('one\ntwo\n');
    const eof = await readVerifiedCitationWindow(path, { trustedRoot, offset: 3 });

    expect(eof).toMatchObject({
      totalLines: 3,
      complete: true,
      truncated: false,
      lines: [{ line: 3, text: '' }],
    });
    await expect(readVerifiedCitationWindow(path, { trustedRoot, offset: 4 })).rejects.toThrow(
      'Offset 4 is beyond end of file (3 lines total)',
    );
  });

  it('rejects a mismatched claim instead of emitting an exact citation', async () => {
    const path = await fixture('before\nafter');
    const window = await readVerifiedCitationWindow(path, { trustedRoot });

    await expect(verifyExactLineCitation(window, { line: 2, text: 'stale' })).resolves.toEqual({
      ok: false,
      reason: 'line_mismatch',
    });
  });

  it('rechecks the current file and rejects evidence from a stale snapshot', async () => {
    const path = await fixture('before\nafter');
    const window = await readVerifiedCitationWindow(path, { trustedRoot });
    await writeFile(join(trustedRoot, path), 'inserted\nbefore\nafter', 'utf8');

    await expect(verifyExactLineCitation(window, { line: 2, text: 'after' })).resolves.toEqual({
      ok: false,
      reason: 'stale_snapshot',
    });
  });

  it('rejects traversal, absolute, and symlink-escaping paths', async () => {
    await fixture('inside');
    await expect(readVerifiedCitationWindow('../outside.txt', { trustedRoot })).rejects.toThrow(
      'path must remain within trusted root',
    );
    await expect(readVerifiedCitationWindow(join(trustedRoot, 'fixture.txt'), { trustedRoot })).rejects.toThrow(
      'path must be relative to trusted root',
    );
    const outside = await mkdtemp(join(tmpdir(), 'specialists-outside-'));
    temporaryDirectories.push(outside);
    await writeFile(join(outside, 'secret.txt'), 'secret', 'utf8');
    await symlink(join(outside, 'secret.txt'), join(trustedRoot, 'escape.txt'));
    await expect(readVerifiedCitationWindow('escape.txt', { trustedRoot })).rejects.toThrow(
      'path must remain within trusted root',
    );
  });

  it('rejects paths containing control characters before reading or formatting a citation', async () => {
    await expect(readVerifiedCitationWindow('unsafe\npath')).rejects.toThrow(
      'path must not contain control characters',
    );
  });

  it('refuses exact line claims sourced only from raw Pi read content', async () => {
    const rawRead: RawPiReadEvidence = {
      source: 'raw_pi_read',
      path: 'src/example.ts',
      content: 'first\nsecond',
      offset: 10,
      limit: 2,
      truncated: true,
    };

    await expect(verifyExactLineCitation(rawRead, { line: 10, text: 'first' })).resolves.toEqual({
      ok: false,
      reason: 'raw_pi_read_unverified',
    });
  });
});
