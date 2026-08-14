// Unit tests for the bundled read-line-numbers Pi extension.
// - Verifies the resolver returns an existing, cached, readable path.
// - Dynamic-imports the shipped .mjs (with the peer dep stubbed) and re-runs
//   the canonical behavior tests against the shipped copy, so drift from
//   the canonical source is caught here.
// - Encodes Pi's split("\n") EOF model exactly (see pi-coding-agent read.js
//   line 85: `const allLines = textContent.split("\n")`), including the
//   trailing empty produced by a terminating newline being numbered as a
//   citable line.

import { describe, expect, it, beforeAll, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Stub the Pi peer dependency at the module boundary. `isReadToolResult` in
// pi-coding-agent v0.80+ is `event.toolName === "read"`. Pi resolves the real
// package at runtime; here we mirror the discriminant so vitest can load the
// .mjs without the runtime peer dep installed.
vi.mock('@earendil-works/pi-coding-agent', () => ({
  isReadToolResult: (event: { toolName?: string } | null | undefined) =>
    event != null && typeof event === 'object' && (event as { toolName?: string }).toolName === 'read',
}));

import {
  getReadLineNumbersExtensionPath,
  __resetReadLineNumbersExtensionPathCacheForTest,
} from '../../../src/pi/read-line-numbers-extension.js';

describe('getReadLineNumbersExtensionPath', () => {
  it('returns an existing directory with a readable index.mjs', () => {
    __resetReadLineNumbersExtensionPathCacheForTest();
    const p = getReadLineNumbersExtensionPath();
    expect(p).toBeTruthy();
    expect(existsSync(p!)).toBe(true);
    const entry = join(p!, 'index.mjs');
    expect(existsSync(entry)).toBe(true);
    expect(statSync(entry).isFile()).toBe(true);
  });

  it('is idempotent — a second call returns the same path with the file untouched', () => {
    __resetReadLineNumbersExtensionPathCacheForTest();
    const first = getReadLineNumbersExtensionPath();
    const entry = join(first!, 'index.mjs');
    const beforeHash = createHash('sha256').update(readFileSync(entry)).digest('hex');
    const second = getReadLineNumbersExtensionPath();
    const afterHash = createHash('sha256').update(readFileSync(entry)).digest('hex');
    expect(second).toBe(first);
    expect(afterHash).toBe(beforeHash);
  });
});

type MjsModule = {
  default: (pi: { on: (name: string, handler: (event: unknown) => unknown) => void }) => void;
  numberReadText: (text: string, startLine: number, truncated: boolean) => string;
};

let mjs: MjsModule;

beforeAll(async () => {
  __resetReadLineNumbersExtensionPathCacheForTest();
  const p = getReadLineNumbersExtensionPath();
  if (!p) throw new Error('bundled read-line-numbers extension not found');
  mjs = (await import(pathToFileURL(join(p, 'index.mjs')).href)) as MjsModule;
});

describe('numberReadText (Pi EOF-parity model)', () => {
  it('multi-line input prefixes every line with 1-based numbers', () => {
    expect(mjs.numberReadText('foo\nbar\nbaz', 1, false)).toBe('1 | foo\n2 | bar\n3 | baz');
  });
  it('offset 137 numbers from the true source line', () => {
    expect(mjs.numberReadText('foo\nbar', 137, false)).toBe('137 | foo\n138 | bar');
  });
  it('single-line content is numbered 1', () => {
    expect(mjs.numberReadText('text', 1, false)).toBe('1 | text');
  });
  it('first-line-exceeds banner alone is preserved verbatim', () => {
    const input = "[Line 5 is 60KB, exceeds 50KB limit. Use bash: sed -n '5p' /a/b.txt | head -c 51200]";
    expect(mjs.numberReadText(input, 1, true)).toBe(input);
  });

  // --- Pi split("\n") parity — every element is a citable line ------------
  // pi-coding-agent read.js:85 uses `text.split("\n")`, so a trailing newline
  // produces a trailing empty that Pi counts as a real line at EOF. The
  // number model MUST match, or a model citation to "line N" points at a
  // line the citation-evidence verifier disagrees exists.

  it('empty content becomes "1 | "', () => {
    expect(mjs.numberReadText('', 1, false)).toBe('1 | ');
  });

  it('empty content at offset 3 becomes "3 | "', () => {
    expect(mjs.numberReadText('', 3, false)).toBe('3 | ');
  });

  it('"one\\n" becomes "1 | one\\n2 | " (trailing empty is line 2)', () => {
    expect(mjs.numberReadText('one\n', 1, false)).toBe('1 | one\n2 | ');
  });

  it('"one\\ntwo\\n" becomes "1 | one\\n2 | two\\n3 | " (trailing empty is line 3)', () => {
    expect(mjs.numberReadText('one\ntwo\n', 1, false)).toBe('1 | one\n2 | two\n3 | ');
  });

  it('"foo\\n\\n" numbers foo, interior blank, and trailing empty', () => {
    expect(mjs.numberReadText('foo\n\n', 1, false)).toBe('1 | foo\n2 | \n3 | ');
  });

  it('interior blank line is numbered', () => {
    expect(mjs.numberReadText('foo\n\nbar', 1, false)).toBe('1 | foo\n2 | \n3 | bar');
  });

  it('leading blank line is numbered', () => {
    expect(mjs.numberReadText('\nfoo\nbar', 1, false)).toBe('1 | \n2 | foo\n3 | bar');
  });

  it('consecutive interior blank lines are all numbered', () => {
    expect(mjs.numberReadText('foo\n\n\n\nbar', 10, false)).toBe(
      '10 | foo\n11 | \n12 | \n13 | \n14 | bar',
    );
  });

  it('offset advances through blank lines and the trailing EOF empty', () => {
    expect(mjs.numberReadText('foo\n\nbar\n', 137, false)).toBe(
      '137 | foo\n138 | \n139 | bar\n140 | ',
    );
  });

  // --- Truncation / user-limit notices — separator + notice stay verbatim -

  it('Pi truncation notice is preserved verbatim, not prefixed', () => {
    const input = 'foo\nbar\n\n[Showing lines 1-2 of 5000. Use offset=3 to continue.]';
    expect(mjs.numberReadText(input, 1, true)).toBe(
      '1 | foo\n2 | bar\n\n[Showing lines 1-2 of 5000. Use offset=3 to continue.]',
    );
  });

  it('Pi user-limit notice is preserved verbatim even without truncation flag', () => {
    const input = 'foo\nbar\n\n[3 more lines in file. Use offset=3 to continue.]';
    expect(mjs.numberReadText(input, 1, false)).toBe(
      '1 | foo\n2 | bar\n\n[3 more lines in file. Use offset=3 to continue.]',
    );
  });

  it('interior blank preserved before truncation notice, notice stays verbatim', () => {
    const input = 'foo\n\nbar\n\n[Showing lines 1-3 of 5000. Use offset=4 to continue.]';
    expect(mjs.numberReadText(input, 1, true)).toBe(
      '1 | foo\n2 | \n3 | bar\n\n[Showing lines 1-3 of 5000. Use offset=4 to continue.]',
    );
  });

  it('notice with trailing-empty source — trailing empty is numbered', () => {
    // Pi content "foo\n" + separator "\n\n" + "[N]" == "foo\n\n\n[N]"
    const input = 'foo\n\n\n[Showing lines 1-2 of 5000. Use offset=3 to continue.]';
    expect(mjs.numberReadText(input, 1, true)).toBe(
      '1 | foo\n2 | \n\n[Showing lines 1-2 of 5000. Use offset=3 to continue.]',
    );
  });

  it('notice with trailing-blanks source — every source blank is numbered', () => {
    // Pi content "foo\n\n" + separator "\n\n" + "[N]" == "foo\n\n\n\n[N]"
    const input = 'foo\n\n\n\n[3 more lines in file. Use offset=3 to continue.]';
    expect(mjs.numberReadText(input, 1, false)).toBe(
      '1 | foo\n2 | \n3 | \n\n[3 more lines in file. Use offset=3 to continue.]',
    );
  });
});

describe('read-line-numbers extension hook', () => {
  function runHandler(event: unknown): unknown {
    const handlers: Array<(event: unknown) => unknown> = [];
    mjs.default({ on: (_name, handler) => handlers.push(handler) });
    return handlers[0]?.(event);
  }

  it('read tool result is numbered using the event offset', () => {
    const result = runHandler({
      type: 'tool_result',
      toolCallId: 'call-1',
      toolName: 'read',
      input: { path: '/a/b.txt', offset: 137 },
      content: [{ type: 'text', text: 'foo\nbar' }],
      isError: false,
    }) as { content: Array<{ text: string }> };
    expect(result.content[0]?.text).toBe('137 | foo\n138 | bar');
  });

  it('read tool result without offset numbers from 1', () => {
    const result = runHandler({
      type: 'tool_result',
      toolCallId: 'call-1',
      toolName: 'read',
      input: { path: '/a/b.txt' },
      content: [{ type: 'text', text: 'foo' }],
      isError: false,
    }) as { content: Array<{ text: string }> };
    expect(result.content[0]?.text).toBe('1 | foo');
  });

  it('non-read tool result passes through untouched', () => {
    const result = runHandler({
      type: 'tool_result',
      toolCallId: 'call-2',
      toolName: 'bash',
      input: { command: 'ls' },
      content: [{ type: 'text', text: 'a.txt\nb.txt' }],
      isError: false,
    });
    expect(result).toBeUndefined();
  });

  it('error result passes through untouched', () => {
    const result = runHandler({
      type: 'tool_result',
      toolCallId: 'call-3',
      toolName: 'read',
      input: { path: '/a/b.txt', offset: 999 },
      content: [{ type: 'text', text: 'Offset 999 is beyond end of file (5 lines total)' }],
      isError: true,
    });
    expect(result).toBeUndefined();
  });

  it('image + text-note content passes through untouched (image item present)', () => {
    const result = runHandler({
      type: 'tool_result',
      toolCallId: 'call-4',
      toolName: 'read',
      input: { path: '/a/img.png' },
      content: [
        { type: 'text', text: 'Read image file [image/png]' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
      isError: false,
    });
    expect(result).toBeUndefined();
  });

  it('image text-note alone (single text item) passes through untouched', () => {
    const result = runHandler({
      type: 'tool_result',
      toolCallId: 'call-5',
      toolName: 'read',
      input: { path: '/a/img.png' },
      content: [{ type: 'text', text: 'Read image file [image/png]\n2048x1024' }],
      isError: false,
    });
    expect(result).toBeUndefined();
  });

  it('trailing EOF empty is numbered in the model-facing text', () => {
    const result = runHandler({
      type: 'tool_result',
      toolCallId: 'call-6',
      toolName: 'read',
      input: { path: '/a/b.txt' },
      content: [{ type: 'text', text: 'one\ntwo\n' }],
      isError: false,
    }) as { content: Array<{ text: string }> };
    expect(result.content[0]?.text).toBe('1 | one\n2 | two\n3 | ');
  });
});
